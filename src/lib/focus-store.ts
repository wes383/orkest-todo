/**
 * The focus log, live.
 *
 * The switch and the log are written together, so they normally agree — the same
 * arrangement Pivot uses, and for the same reason: the state alone cannot say
 * whether a stretch is still running, and the log alone cannot say whether the
 * page was closed mid-session.
 *
 * Two storage keys rather than one, mirroring the way the app already splits its
 * own state: the log is user data and is never rewritten wholesale, while the
 * switch is a single word that has to survive a restart on its own.
 *
 * ── The one thing this file adds to Pivot's model ───────────────────────────
 *
 * A stretch belongs to a list. A new session opens wearing the list that was in
 * view when it started (or nothing, if no list was in view), and that answer is
 * only a starting point: it can be changed as often as wanted, from the switch
 * while the session runs and from the log afterwards. Nothing here locks.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_USEFUL_MS,
  MIN_USEFUL_MS,
  type FocusSpan,
} from "@/lib/focus-spans";

const LOG_KEY = "orkest-todo.focus.log.v1";
const STATE_KEY = "orkest-todo.focus.state";

/** The site has exactly two states. Nothing else. */
export type FocusState = "idle" | "useful";

interface Persisted {
  version: number;
  spans: FocusSpan[];
}

/**
 * Reads one stored span, or rejects it.
 *
 * The list field is allowed to be missing rather than required: a log written
 * before this app filed stretches under lists is still a valid log, and its
 * stretches are simply unassigned. Everything else has to be there — a stretch
 * without a start is not a stretch.
 */
function readSpan(value: unknown): FocusSpan | null {
  if (typeof value !== "object" || value === null) return null;
  const span = value as Partial<FocusSpan>;
  if (typeof span.start !== "number") return null;
  if (typeof span.end !== "number" && span.end !== null) return null;
  return {
    start: span.start,
    end: span.end,
    listId: typeof span.listId === "string" ? span.listId : null,
  };
}

/** Drops the stretches too brief to count as work. A stretch that is still
    running has no end to measure yet, so it is always kept — it gets judged when
    the switch actually flips back, and dropped then if it came up short. */
function dropBriefSpans(spans: FocusSpan[]): FocusSpan[] {
  return spans.filter(
    (span) => span.end === null || span.end - span.start >= MIN_USEFUL_MS
  );
}

/** The switch state and the log, read together.
 *
 *  Restoring into "useful" means a session is in flight, so the newest stretch
 *  is reopened — including one left behind by a log written before open
 *  stretches existed, whose end is only the last heartbeat rather than a real
 *  one. Restoring into "idle" means nothing is running, so a stretch still
 *  marked open was left that way by a failed write: it is dropped rather than
 *  handed an invented end that would claim hours of work.
 *
 *  Except a stretch already past the cap: that one ended itself while the page
 *  was away. It comes back closed at the cap and the switch comes back on
 *  "idle", so the app opens showing what actually happened rather than reopening
 *  a session that is already overdue by hours. */
function load(): { state: FocusState; spans: FocusSpan[] } {
  let state: FocusState = "idle";
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LOG_KEY);
    if (window.localStorage.getItem(STATE_KEY) === "useful") state = "useful";
  } catch {
    /* storage blocked — the log lives in memory for this session */
  }

  let spans: FocusSpan[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null
          ? (parsed as { spans?: unknown }).spans
          : null;
      if (Array.isArray(list)) {
        spans = list
          .map(readSpan)
          .filter((span): span is FocusSpan => span !== null)
          // Oldest first, which is also the order writes keep. Normalising here
          // means the timeline can walk the log without sorting on every render.
          .sort((a, b) => a.start - b.start);
      }
    } catch {
      spans = [];
    }
  }

  const last = spans[spans.length - 1];
  if (state === "useful" && last === undefined) {
    // The switch says a session is running but the log has nothing to show for
    // it — nothing to reopen, so the switch is the thing that is wrong.
    state = "idle";
  } else if (state === "idle" && last !== undefined && last.end === null) {
    spans = spans.slice(0, -1);
  } else if (state === "useful" && last !== undefined && last.end !== null) {
    // A session in flight whose newest stretch is closed: the write that opened
    // it landed, the one that closed it did not. Reopening the same stretch is
    // what the original does, and it is the honest reading — the switch never
    // went back to rest.
    spans = [...spans.slice(0, -1), { ...last, end: null }];
  }

  const newest = spans[spans.length - 1];
  if (
    state === "useful" &&
    newest !== undefined &&
    newest.end === null &&
    Date.now() - newest.start >= MAX_USEFUL_MS
  ) {
    spans = [
      ...spans.slice(0, -1),
      { ...newest, end: newest.start + MAX_USEFUL_MS },
    ];
    state = "idle";
    // Corrected on the spot rather than left for the next write: the next write
    // only happens on a change, and nothing is going to change if the app opens
    // showing the right state.
    writeState(state);
  }

  return { state, spans: dropBriefSpans(spans) };
}

function writeState(state: FocusState): void {
  try {
    window.localStorage.setItem(STATE_KEY, state);
  } catch {
    /* storage blocked — the state lives in memory only */
  }
}

function writeSpans(spans: FocusSpan[]): void {
  try {
    window.localStorage.setItem(
      LOG_KEY,
      JSON.stringify({ version: 1, spans } satisfies Persisted)
    );
  } catch {
    /* storage blocked — the log lives in memory only */
  }
}

export function useFocusStore() {
  /*
   * Lazy initialiser on purpose: `load` reads localStorage and reconciles the
   * two keys with each other. It must run exactly once — running it per render
   * would re-reconcile a log that has already been reconciled — and the state it
   * comes back with is the one the hook starts on. Reading the switch a second
   * time here would be a second opinion, and the two could disagree: an empty
   * log with the switch left on "useful" is corrected down to "idle" by the
   * reconciliation, which a bare re-read would not know about.
   */
  const [boot] = useState(load);
  const [persisted, setPersisted] = useState<Persisted>(() => ({
    version: 1,
    spans: boot.spans,
  }));
  const [state, setState] = useState<FocusState>(boot.state);
  /** Mirrors `state` so the callbacks below can read the current switch without
      depending on the render they were created in — and so `commit` never has to
      write the log from inside a state updater, which React would run twice. */
  const stateRef = useRef(boot.state);
  const first = useRef(true);

  const spans = persisted.spans;

  useEffect(() => {
    // Skip the very first write: `load()` already mirrors storage.
    if (first.current) {
      first.current = false;
      return;
    }
    writeSpans(spans);
  }, [spans]);

  const patch = useCallback((fn: (spans: FocusSpan[]) => FocusSpan[]) => {
    setPersisted((p) => ({ ...p, spans: fn(p.spans) }));
  }, []);

  /**
   * Moves the switch. History is written here and nowhere else — never by
   * watching the state. Watching it would also catch the restore on launch and
   * record that as a flip, which both split the session that was still running
   * and opened a second one behind it. A move that lands on the state already
   * showing changes nothing.
   */
  const commit = useCallback(
    (to: FocusState, defaultListId: string | null = null) => {
      if (stateRef.current === to) return;
      stateRef.current = to;
      const now = Date.now();

      patch((prev) => {
        const last = prev[prev.length - 1];
        // Going to work opens a stretch and leaves it open. Nothing else is
        // written for as long as it runs, however long that is or however many
        // times the app is closed in between.
        if (to === "useful") {
          return [
            ...prev,
            { start: now, end: null, listId: defaultListId },
          ];
        }
        // Coming back closes it — or drops it, if it turned out too brief to
        // count, in which case the time it covered goes back to plain grey. The
        // end is capped, so a stretch left running overnight closes at eight
        // hours rather than at the moment someone finally noticed.
        if (!last || last.end !== null) return prev;
        const end = Math.min(now, last.start + MAX_USEFUL_MS);
        if (end - last.start < MIN_USEFUL_MS) return prev.slice(0, -1);
        return [...prev.slice(0, -1), { ...last, end }];
      });

      writeState(to);
      setState(to);
    },
    [patch]
  );

  /**
   * Files the stretch at `index` under a list.
   *
   * The one action both surfaces share: the switch calls it for the session it
   * is running, the log calls it for any row on the sheet, and it asks no
   * questions about either. A stretch's list is an answer the reader owns, so it
   * stays open to being answered again — mid-session, after the fact, as many
   * times as wanted. `null` is a real answer too: unassigned.
   */
  const setList = useCallback(
    (index: number, listId: string | null) => {
      patch((prev) => {
        const span = prev[index];
        if (span === undefined || span.listId === listId) return prev;
        const next = [...prev];
        next[index] = { ...span, listId };
        return next;
      });
    },
    [patch]
  );

  /** A hand edit of the log. It goes through the same three steps the switch
      itself does — new array, storage, state — so an edited stretch is written
      exactly like a recorded one, and the panel and the rail can never be
      looking at different logs. */
  const reschedule = useCallback(
    (index: number, end: number) => {
      patch((prev) => {
        const span = prev[index];
        // A running stretch has no end to move, and the five-minute floor holds
        // here as firmly as it does when the switch closes a stretch itself.
        if (!span || span.end === null) return prev;
        if (end - span.start < MIN_USEFUL_MS) return prev;
        const next = [...prev];
        next[index] = { ...span, end };
        return next;
      });
    },
    [patch]
  );

  /** Ends the stretch at `index` at `end` *and* keeps the part that ran on into
      the next day as a stretch of its own, opening at that midnight. Ending a
      session on the day it began is the one correction that moving an end cannot
      express: the tail belongs to the next day's list, and one record spread
      over two days has only the one end to move. */
  const split = useCallback(
    (index: number, end: number) => {
      patch((prev) => {
        const span = prev[index];
        if (!span || span.end === null) return prev;
        if (end - span.start < MIN_USEFUL_MS) return prev;
        const midnight = dayStartAfter(end);
        // Nothing ran past midnight, so there is nothing to cut off. Without
        // this the tail would open *after* the stretch ended and describe a
        // session of negative length.
        if (span.end <= midnight) return prev;
        const next = [...prev];
        // The tail opens the next day under the same list: cutting a session at
        // midnight does not change where the time went.
        next.splice(index, 1, { ...span, end }, { ...span, start: midnight });
        return next;
      });
    },
    [patch]
  );

  const remove = useCallback(
    (index: number) => {
      patch((prev) =>
        prev[index] === undefined ? prev : prev.filter((_, at) => at !== index)
      );
    },
    [patch]
  );

  /**
   * Forgets a list that no longer exists.
   *
   * Its sessions are not re-homed the way its tasks are: a task moved to another
   * list is still the same task, but the hours spent on "工作" did not become
   * hours spent on whatever list happened to be first. They keep their place in
   * the log and lose their label, which is what the unassigned bucket is for.
   */
  const forgetList = useCallback(
    (listId: string) => {
      patch((prev) =>
        prev.some((span) => span.listId === listId)
          ? prev.map((span) =>
              span.listId === listId ? { ...span, listId: null } : span
            )
          : prev
      );
    },
    [patch]
  );

  const running =
    state === "useful" && spans[spans.length - 1]?.end === null
      ? spans[spans.length - 1]
      : null;

  /**
   * A session left running closes itself at the cap, switch and all: away time
   * counts as focus, but not for ever, so a forgotten instance comes back to
   * "idle" on its own.
   */
  useEffect(() => {
    if (running === null) return;
    const wait = running.start + MAX_USEFUL_MS - Date.now();
    // A session already overdue — a window woken from sleep, say — collapses to a
    // zero delay. Either way the flip goes through a timer rather than running in
    // the effect body, where setState would land mid-commit.
    const id = window.setTimeout(() => commit("idle"), Math.max(0, wait));
    return () => window.clearTimeout(id);
  }, [running, commit]);

  return {
    spans,
    state,
    running,
    commit,
    setList,
    reschedule,
    split,
    remove,
    forgetList,
  };
}

/** The whole of the focus store, as one thing a view can be handed.
 *
 *  Expanded from the hook rather than written out, so a new action added to the
 *  store reaches the views without a second declaration to keep in step — and
 *  the views are typed against the store itself, not a copy of its shape. */
export type FocusStore = ReturnType<typeof useFocusStore>;

/** The midnight that follows `ms`, as the moment a split tail opens on. */
function dayStartAfter(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}
