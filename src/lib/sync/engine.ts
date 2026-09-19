/**
 * The sync engine — the desktop half of the focus sync.
 *
 * The desktop is the keeper of the log: everything it writes goes to
 * localStorage exactly as before, and the engine mirrors the same changes up
 * to Supabase; everything the phone writes arrives as rows, is merged into
 * the local log (see `merge.ts`), and the merged truth is pushed back. One
 * `cycle` is the whole protocol:
 *
 *   pull → merge into the local log → push the difference → push the
 *   switch, the lists and the rules alongside.
 *
 * The cycle runs on a 5-second poll rather than a Realtime subscription on
 * purpose: the row-level policies read the sync code from the
 * `x-sync-code` request header, which PostgREST forwards to the database —
 * but the Realtime WebSocket does not go through PostgREST, so it can never
 * present the code and would see no rows at all. A poll the policies can
 * check is worth more than a push the policies would block.
 *
 * Pushes are differences against the rows the last pull actually showed
 * (`remoteSpansRef`), never blind overwrites: a row missing from the outbound
 * set and present remotely is deleted, a row missing remotely is inserted.
 *
 * Only the tail of the log travels. The cloud is the phone's view of the
 * session, not a copy of the archive: everything that ended longer ago than
 * `SYNC_WINDOW_MS` stays on this machine, and the rows that age out of the
 * window leave the cloud by the same difference that carries a local
 * deletion. The phone reads the switch, a running clock and today's total, so
 * the window needs to be wider than a day and no wider — and being measured
 * in hours back from now rather than from a midnight keeps it independent of
 * which time zone either device is in.
 *
 * That makes this machine the only pruner, and it should stay that way: a row
 * is dropped from the cloud only after the merge has put it into the local
 * log, and only the desktop can know that has happened. Nothing is lost — the
 * cloud never held the archive, and the phone is looking at today.
 *
 * A real pull is O(the whole table) and a cycle runs every 5 s, so the pull is
 * gated behind a one-request probe: the newest row plus the exact row count,
 * read off a `limit(1)` query. The mirror from the last pull answers for
 * everything else, because an append, a deletion and an edit to the tail are
 * the only things the phone can do — and each of them moves one of those two
 * numbers. When the probe says the table is what the mirror already holds, the
 * mirror stands in for a pull and no rows travel; anything else, including a
 * count the probe would not vouch for, falls through to a real pull. (The
 * window sliding moves the count too, but this side does the pruning and moves
 * its own mirror in the same cycle, so the two stay in step.) A full pull is
 * also forced every `FULL_PULL_EVERY` cycles, so a change
 * the probe cannot see — an edit to a row that is neither the tail nor the
 * count — heals within minutes instead of never.
 *
 * `app_settings` doubles as the space itself: the policies let a row into
 * `focus_spans`, `focus_state` or `lists` only when the same code already owns
 * an `app_settings` row. It is therefore pushed first in every cycle — before
 * this side's own rows, because on a code's first cycle there is nothing up
 * there for them to lean on — and it is the one table the phone never writes.
 * A code no desktop has enabled cannot be written to at all, which is what
 * turns a mistyped code into a failure instead of a space of its own.
 *
 * Two smaller economies follow the same rule: `focus_state` and
 * `app_settings` are written only when they differ from what was last pushed,
 * and a failed cycle backs off instead of hammering a server that is down.
 * The marker is the one exception to that difference test — it is also the
 * space's heartbeat for the server-side sweep, so it is re-pushed once a day
 * even when nothing changed (`MARKER_REFRESH_MS`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FocusSpan } from "@/lib/focus-spans";
import type { FocusState, FocusStore } from "@/lib/focus-store";
import { spanLimits, type AppSettings } from "@/lib/settings";
import type { TodoList } from "@/lib/types";
import { mergeFocus } from "@/lib/sync/merge";
import {
  generateSyncCode,
  loadSyncConfig,
  saveSyncConfig,
  type SyncConfig,
} from "@/lib/sync/config";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/sync/credentials";

/** What a row of `focus_spans` looks like over the wire. */
interface RemoteSpan {
  owner_code: string;
  start_ms: number;
  end_ms: number | null;
  list_id: string | null;
  min_ms: number | null;
}

/** What a read of that table comes back as: the same row less `owner_code`,
    which the row-level policy has already made the only possible answer. */
type RemoteRow = Omit<RemoteSpan, "owner_code">;

/** The columns every read asks for, in one place. */
const SPAN_COLUMNS = "start_ms, end_ms, list_id, min_ms";

function toRemote(code: string, span: FocusSpan): RemoteSpan {
  return {
    owner_code: code,
    start_ms: span.start,
    end_ms: span.end,
    list_id: span.listId,
    min_ms: span.minMs ?? null,
  };
}

function fromRemote(row: RemoteRow): FocusSpan {
  return {
    start: row.start_ms,
    end: row.end_ms,
    listId: row.list_id,
    minMs: row.min_ms ?? undefined,
  };
}

export type SyncStatus = "off" | "idle" | "syncing" | "error";

/** The settings page's handle on the engine, expanded like `autostart` is.
    No credentials in here — they are baked into the build, so the page hands
    over one switch and one code and nothing else. */
export interface SyncControls {
  code: string | null;
  enabled: boolean;
  status: SyncStatus;
  error: string | null;
  lastSyncAt: number | null;
  setEnabled: (value: boolean) => void;
  regenerateCode: () => void;
}

const POLL_MS = 5000;
/** A local change waits this long before it insists on a cycle — long enough
    that a burst of edits (a hand edit of the log, say) leaves as one push. */
const NUDGE_MS = 400;
/** Cycles between forced full pulls — the safety net under the probe. */
const FULL_PULL_EVERY = 60;
/** The ceiling a failed cycle's backoff doubles up to. */
const MAX_RETRY_MS = 5 * 60_000;
/** How often the marker row is re-asserted even when nothing about it changed.
    That row doubles as the space's heartbeat — the server deletes a marker
    that has not moved in a month (the cron jobs in supabase-schema.sql) — so a
    desktop with a quiet log must keep saying it is still here. Once a day, one
    small upsert; the sweep's window leaves room for thirty missed ones. */
const MARKER_REFRESH_MS = 24 * 3_600_000;
/** How much of the log the cloud is allowed to hold: more than a day, because
    the day the phone is counting is the phone's, and the two devices can sit
    up to 26 hours apart in time zone; no more than that, because the cloud is
    a channel and not the archive. */
const SYNC_WINDOW_MS = 48 * 3_600_000;

/** The part of the log the cloud should hold: every stretch that reached into
    the window. A stretch is judged by the moment it got to — its end, or now
    if it has not ended — so one that began before the window and closed inside
    it still travels, which is what keeps the hour before midnight accounted
    for on a phone that is counting today. A running stretch always travels
    however old it is: the phone is showing its clock, and a phone that cannot
    see the switch cannot turn it off. */
function withinWindow(spans: FocusSpan[], now: number): FocusSpan[] {
  const from = now - SYNC_WINDOW_MS;
  return spans.filter((span) => (span.end ?? now) >= from);
}

function spanEqual(a: FocusSpan, b: FocusSpan): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.listId === b.listId &&
    (a.minMs ?? undefined) === (b.minMs ?? undefined)
  );
}

function spansEqual(a: FocusSpan[], b: FocusSpan[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!spanEqual(a[i], b[i])) return false;
  return true;
}

/**
 * Empties one data space: every row the code owns, in all four tables.
 *
 * The row-level policies narrow every statement to `owner_code` equal to the
 * `x-sync-code` header, so the `neq` here is not a filter in any real sense —
 * it is what PostgREST requires before it will run a delete with no `where`
 * clause. What this can reach is exactly what this code owns and nothing else.
 *
 * Called when the sync is switched off and when the code is regenerated,
 * because a channel should not keep what it is no longer carrying: with the
 * sync off nothing prunes the window any more, and rows left behind would sit
 * in the cloud — readable by anyone holding the old code — for good.
 */
async function purgeDataSpace(code: string): Promise<void> {
  if (code === "") return;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { "x-sync-code": code } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Twice, a second apart: a cycle already in flight when the switch was
  // flipped can land its own rows just after the first delete has run. The
  // second pass is what makes "nothing left behind" true rather than likely.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    await Promise.all(
      ["focus_spans", "focus_state", "lists", "app_settings"].map((table) =>
        client.from(table).delete().neq("owner_code", "")
      )
    );
  }
}

/**
 * What the remote log holds — pulled in full when it may have moved, and
 * answered from `mirror` when it demonstrably has not.
 *
 * The probe is one request and no more: the newest row plus the table's exact
 * row count. Between them they cover every change either client can make — an
 * append moves both the count and the newest row, a deletion moves the count,
 * an edit to the tail (a close, a re-filing) moves the newest row's body. A
 * count the server did not answer, or one that disagrees with the mirror, is
 * never trusted: the pull happens instead. `force` skips the probe outright,
 * which is how a periodic full pull gets in.
 *
 * A pull reads the whole table and is deliberately not narrowed to the
 * window, small as that window keeps it: this side does the pruning, and it
 * can only prune what it can see. A row the phone wrote with a wildly wrong
 * clock lands outside the window, is read here, is merged into the log like
 * anything else, and then leaves the cloud on the next push.
 *
 * Returning `mirror` itself, not a copy, is deliberate: the caller tells a
 * probe hit from a real pull by identity, and reuses the snapshot untouched.
 */
async function pullRemote(
  client: SupabaseClient,
  mirror: FocusSpan[] | null,
  force: boolean
): Promise<FocusSpan[]> {
  if (!force && mirror !== null) {
    const probe = await client
      .from("focus_spans")
      .select(SPAN_COLUMNS, { count: "exact" })
      .order("start_ms", { ascending: false })
      .limit(1);
    if (probe.error) throw probe.error;
    const newest = ((probe.data ?? []) as RemoteRow[])[0] ?? null;
    const shown = mirror.length > 0 ? mirror[mirror.length - 1] : null;
    const unchanged =
      probe.count === mirror.length &&
      (newest === null
        ? shown === null
        : shown !== null && spanEqual(fromRemote(newest), shown));
    if (unchanged) return mirror;
  }

  const pulled = await client
    .from("focus_spans")
    .select(SPAN_COLUMNS)
    .order("start_ms", { ascending: true });
  if (pulled.error) throw pulled.error;
  return ((pulled.data ?? []) as RemoteRow[]).map(fromRemote);
}

export function useFocusSync(
  focus: FocusStore,
  lists: TodoList[],
  settings: AppSettings
): SyncControls {
  const [config, setConfig] = useState<SyncConfig>(loadSyncConfig);

  useEffect(() => saveSyncConfig(config), [config]);

  const enabled = config.enabled && config.code !== "";

  const [status, setStatus] = useState<SyncStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  /* Latest-value mirrors, so the async cycle always reads the present and
     never the render it was created in. */
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const spansRef = useRef(focus.spans);
  spansRef.current = focus.spans;
  const stateRef = useRef(focus.state);
  stateRef.current = focus.state;
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const limitsRef = useRef(spanLimits());
  limitsRef.current = spanLimits();

  /** What the cloud is meant to hold — the rows the last pull showed, what
      pushes are diffed against, and what stands in for a pull when the probe
      says nothing moved. Windowed, like the push: it tracks the cloud's
      contents, not the log. */
  const remoteSpansRef = useRef<FocusSpan[] | null>(null);
  /** The lists as last pushed; the desktop is their only writer. */
  const remoteListsRef = useRef<{ id: string; name: string; position: number }[] | null>(null);
  /** The switch and the rules as last pushed — the two rows that used to be
      rewritten every cycle to say what they already said. */
  const pushedStateRef = useRef<FocusState | null>(null);
  const pushedRulesRef = useRef<{
    min: number;
    max: number;
    at: number;
  } | null>(null);
  /** Cycles since the last forced full pull; see `FULL_PULL_EVERY`. */
  const cyclesSinceFullRef = useRef(0);
  /** Consecutive failures, and the moment the next automatic cycle may run. */
  const failuresRef = useRef(0);
  const retryAfterRef = useRef(0);

  const runningRef = useRef(false);
  const pendingRef = useRef(false);

  /** Reports a failure and arms the backoff. A server that is down, or a
      network that is gone, should not be asked every 5 s — the interval only
      doubles, capped, and a single success resets it to nothing. */
  const fail = useCallback((message: string) => {
    failuresRef.current += 1;
    const wait = Math.min(POLL_MS * 2 ** failuresRef.current, MAX_RETRY_MS);
    retryAfterRef.current = Date.now() + wait;
    // A cycle can fail because the space's marker is missing — and the marker
    // is the one write nothing else can happen without. It is only re-pushed
    // when this side believes it is already up, so a failure forgets that
    // belief: the next cycle re-asserts the space before anything else, which
    // costs one small upsert and is what lets a space heal itself.
    pushedRulesRef.current = null;
    setError(message);
    setStatus("error");
  }, []);

  /** The client, rebuilt whenever the credentials do. Mirrors reset with it —
      a different code is a different data space, and stale mirrors would
      push deletions into rows the new code has never seen. */
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const clientCode = enabled ? config.code : null;
  useEffect(() => {
    if (clientCode === null) {
      setClient(null);
      return;
    }
    // A build made without `.env.local` gets here with empty strings, which
    // `createClient` refuses; leaving the client unset is quieter than an
    // effect that throws on a misbuild.
    try {
      setClient(
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { "x-sync-code": clientCode } },
          // No auth is used — the code in the header is the whole identity —
          // so the client is told not to keep a session it would never have.
          auth: { persistSession: false, autoRefreshToken: false },
        })
      );
      remoteSpansRef.current = null;
      remoteListsRef.current = null;
      pushedStateRef.current = null;
      pushedRulesRef.current = null;
      cyclesSinceFullRef.current = 0;
      failuresRef.current = 0;
      retryAfterRef.current = 0;
    } catch {
      setClient(null);
    }
  }, [clientCode]);

  /** One pass of the protocol. Throws on failure; the callers decide how a
      failure is reported. */
  const runCycle = useCallback(
    async (client: SupabaseClient, code: string) => {
      if (runningRef.current) {
        pendingRef.current = true;
        return;
      }
      runningRef.current = true;
      try {
        // ── Pull ────────────────────────────────────────────────
        const prevRemote = remoteSpansRef.current;
        const remote = await pullRemote(
          client,
          prevRemote,
          cyclesSinceFullRef.current >= FULL_PULL_EVERY
        );
        // A probe hit hands back the mirror itself; a real pull resets the
        // countdown that keeps one coming even when nothing ever moves.
        cyclesSinceFullRef.current =
          remote === prevRemote ? cyclesSinceFullRef.current + 1 : 0;
        remoteSpansRef.current = remote;

        // ── Merge ───────────────────────────────────────────────
        // Only when the cloud moved — and that gate is load-bearing rather
        // than an optimisation. A local deletion travels as the difference
        // pushed below, against a mirror that still holds the deleted row;
        // merging first would union that row straight back out of the mirror
        // and the deletion would never leave. The merge is for rows this side
        // has not seen yet.
        if (prevRemote === null || !spansEqual(prevRemote, remote)) {
          const merged = mergeFocus(
            spansRef.current,
            remote,
            limitsRef.current,
            Date.now()
          );
          if (
            !spansEqual(merged.spans, spansRef.current) ||
            merged.state !== stateRef.current
          ) {
            focusRef.current.importRemote(merged.spans, merged.state);
            spansRef.current = merged.spans;
            stateRef.current = merged.state;
          }
        }

        // ── The rules, and with them the space ──────────────────
        // Pushed before everything else, including this side's own rows,
        // because this write is what makes the space exist: the data tables
        // refuse a row whose `owner_code` names no `app_settings` row (see the
        // policies in supabase-schema.sql). On a code's first cycle the cloud
        // holds nothing at all, so an order that put the log first would have
        // the log rejected by the absence of its own space. The phone writes
        // none of these four tables' markers — only the desktop mints one —
        // so a code nobody's desktop has ever used cannot be written to at
        // all, and a mistyped code fails loudly instead of quietly becoming a
        // space of its own. The same row is the space's heartbeat: it carries
        // an `updated_at` the server sweeps by, so it is re-pushed on a slow
        // clock even when the rules have not moved.
        const wantedRules = {
          min: settingsRef.current.minSpanMinutes,
          max: settingsRef.current.maxSpanHours,
        };
        const lastRules = pushedRulesRef.current;
        const stamp = Date.now();
        if (
          lastRules === null ||
          lastRules.min !== wantedRules.min ||
          lastRules.max !== wantedRules.max ||
          stamp - lastRules.at >= MARKER_REFRESH_MS
        ) {
          const rulesPushed = await client.from("app_settings").upsert({
            owner_code: code,
            min_span_minutes: wantedRules.min,
            max_span_hours: wantedRules.max,
            updated_at: stamp,
          });
          if (rulesPushed.error) throw rulesPushed.error;
          pushedRulesRef.current = { ...wantedRules, at: stamp };
        }

        // ── Push the window's difference ────────────────────────
        const local = spansRef.current;
        // The cloud is asked to hold `outbound` and nothing else, so a row
        // that leaves that set leaves the cloud for either of two reasons
        // that need no telling apart: it was deleted here, or it aged past
        // the window. Both mean the phone has no business with it, and the
        // archive is on this machine.
        const outbound = withinWindow(local, Date.now());
        const remoteByStart = new Map(remote.map((span) => [span.start, span]));
        const upserts: RemoteSpan[] = [];
        for (const span of outbound) {
          const known = remoteByStart.get(span.start);
          if (
            known === undefined ||
            !spanEqual(known, span)
          ) {
            upserts.push(toRemote(code, span));
          }
        }
        const outboundStarts = new Set(outbound.map((span) => span.start));
        const deletions = remote
          .filter((span) => !outboundStarts.has(span.start))
          .map((span) => span.start);

        if (upserts.length > 0) {
          const pushed = await client.from("focus_spans").upsert(upserts);
          if (pushed.error) throw pushed.error;
        }
        if (deletions.length > 0) {
          const removed = await client
            .from("focus_spans")
            .delete()
            .in("start_ms", deletions);
          if (removed.error) throw removed.error;
        }
        // Both pushes landed, so the cloud holds exactly `outbound` — move the
        // mirror onto it instead of waiting for a pull to confirm, which is
        // what lets the next probe come back quiet. (`outbound` is the
        // snapshot the difference was taken from, so a row recorded mid-cycle
        // is not claimed here and still leaves on the next one.)
        remoteSpansRef.current = outbound;

        // The switch, beside the log — the phone's quick read. Written only
        // when it moved: a row rewritten every cycle to say what it already
        // said is most of what this sync would otherwise spend.
        const wantedState = stateRef.current;
        if (pushedStateRef.current !== wantedState) {
          const statePushed = await client.from("focus_state").upsert({
            owner_code: code,
            state: wantedState,
          });
          if (statePushed.error) throw statePushed.error;
          pushedStateRef.current = wantedState;
        }

        // ── Lists (desktop is the source of truth; the phone only reads) ──
        const listsNow = listsRef.current;
        const pushedLists = remoteListsRef.current ?? [];
        const listUpserts = listsNow
          .map((list, position) => ({ list, position }))
          .filter(({ list, position }) => {
            const known = pushedLists.find((p) => p.id === list.id);
            return known === undefined || known.name !== list.name || known.position !== position;
          })
          .map(({ list, position }) => ({
            owner_code: code,
            id: list.id,
            name: list.name,
            position,
            updated_at: Date.now(),
          }));
        const listIds = new Set(listsNow.map((list) => list.id));
        const listDeletions = pushedLists
          .filter((p) => !listIds.has(p.id))
          .map((p) => p.id);

        if (listUpserts.length > 0) {
          const pushed = await client.from("lists").upsert(listUpserts);
          if (pushed.error) throw pushed.error;
        }
        if (listDeletions.length > 0) {
          const removed = await client.from("lists").delete().in("id", listDeletions);
          if (removed.error) throw removed.error;
        }
        remoteListsRef.current = listsNow.map((list, position) => ({
          id: list.id,
          name: list.name,
          position,
        }));

        setLastSyncAt(Date.now());
        setError(null);
        setStatus("idle");
        // The cycle got through — the backoff has nothing left to wait for.
        failuresRef.current = 0;
        retryAfterRef.current = 0;
      } finally {
        runningRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          if (Date.now() >= retryAfterRef.current) {
            void runCycle(client, code).catch((e: unknown) =>
              fail(String(e))
            );
          }
        }
      }
    },
    [fail]
  );

  /* The poll — one cycle every 5 s while enabled, and one immediately on
     enable (which is also the app's startup merge). */
  useEffect(() => {
    if (client === null || clientCode === null) {
      setStatus("off");
      setError(null);
      return;
    }
    /** Skipped while the backoff is armed: a cycle that fails is not asked
        again until the wait it earned has passed. */
    const tick = () => {
      if (Date.now() < retryAfterRef.current) return;
      void runCycle(client, clientCode).catch((e: unknown) => fail(String(e)));
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [client, clientCode, runCycle, fail]);

  /* A local change asks for a cycle sooner than the poll would get to it —
     the debounce keeps a burst of edits (or a dragged slider) to one push. */
  useEffect(() => {
    if (client === null || clientCode === null) return;
    const id = window.setTimeout(() => {
      // An edit made during a backoff waits for it like any other cycle. The
      // change is already in the local log either way, which is the copy that
      // matters; only the errand up to the cloud is delayed.
      if (Date.now() < retryAfterRef.current) return;
      void runCycle(client, clientCode).catch((e: unknown) => fail(String(e)));
    }, NUDGE_MS);
    return () => window.clearTimeout(id);
  }, [
    client,
    clientCode,
    focus.spans,
    focus.state,
    lists,
    settings.minSpanMinutes,
    settings.maxSpanHours,
    runCycle,
    fail,
  ]);

  /** The first enable mints the code — the moment the sync gains an
      identity. Later enables reuse it, so a pause and resume is invisible.

      Switching off empties the data space rather than leaving it to go stale:
      the cloud holds the phone's window into the session, and with the sync
      off there is no window to hold. The local log is untouched either way,
      so re-enabling rebuilds the same rows from it. The purge is
      fire-and-forget — a cleanup that failed is no reason to refuse the
      switch, and a delete that did not land leaves nothing worse than not
      having tried. */
  const setEnabled = useCallback(
    (value: boolean) => {
      if (!value) void purgeDataSpace(config.code).catch(() => undefined);
      setConfig((c) => ({ ...c, code: c.code || generateSyncCode(), enabled: value }));
    },
    [config.code]
  );

  /** A new code is a new data space, so the old one goes with it. */
  const regenerateCode = useCallback(() => {
    void purgeDataSpace(config.code).catch(() => undefined);
    setConfig((c) => ({ ...c, code: generateSyncCode() }));
  }, [config.code]);

  return {
    code: config.code || null,
    enabled,
    status,
    error,
    lastSyncAt,
    setEnabled,
    regenerateCode,
  };
}
