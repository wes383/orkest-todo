/**
 * The phone half of the focus sync.
 *
 * The desktop is the keeper of the log; this page is the remote control the
 * desk leaves behind. It does one thing well: shows where the switch stands
 * — the words the desktop shows, and what today added up to — and flips it
 * when told, from wherever the desk is not.
 *
 * Every request carries the sync code as an `x-sync-code` header, which the
 * row-level policies in `supabase-schema.sql` check against every row's
 * `owner_code`. There is no account to sign into: the code typed once on
 * this page is the whole of the identity, and it only ever reaches the one
 * data space it names.
 *
 * Like the desktop, the page polls rather than subscribes — 10 s here, and
 * once more the moment the tab comes back to the front — because the
 * Realtime socket cannot present the header the policies demand. The poll is
 * cheap by construction: it re-reads the newest stretch and the row count,
 * and takes the whole table again only when one of those two has moved. The
 * table it reads is a rolling two-day window rather than a history — the
 * desktop keeps the archive and prunes what the phone no longer needs — so a
 * pull here stays small however long the log grows.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronDown, Settings } from "lucide-react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./credentials";

/* ── The shape of the log, as the phone needs it ────────────────────────── */

/** One focus stretch, mirroring the desktop's `FocusSpan`. */
interface Span {
  start: number;
  end: number | null;
  listId: string | null;
  minMs?: number;
}

interface ListRow {
  id: string;
  name: string;
  position: number;
}

/** The focus rules the desktop pushed, for judging a close. */
interface Rules {
  minMs: number;
  maxMs: number;
}

/** A row of `focus_spans` as this page reads it. */
interface SpanRow {
  start_ms: number;
  end_ms: number | null;
  list_id: string | null;
  min_ms: number | null;
}

/** The columns every read asks for, in one place. */
const SPAN_COLUMNS = "start_ms, end_ms, list_id, min_ms";

function toSpan(row: SpanRow): Span {
  return {
    start: row.start_ms,
    end: row.end_ms,
    listId: row.list_id,
    minMs: row.min_ms ?? undefined,
  };
}

/** Whether two probes are looking at the same newest stretch. */
function sameTail(a: SpanRow | null, b: SpanRow | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.start_ms === b.start_ms &&
    a.end_ms === b.end_ms &&
    a.list_id === b.list_id &&
    a.min_ms === b.min_ms
  );
}

/* ── Configuration — the code, and nothing but the code ─────────────────── */

/** The Supabase connection is baked into the page (see `credentials.ts`);
    the only thing this page ever asks for is the sync code that names whose
    data it reads. */
interface MobileConfig {
  code: string;
}

const CONFIG_KEY = "orkest-mobile.v1";
const LIST_KEY = "orkest-mobile.list.v1";
const LANG_KEY = "orkest-mobile.lang";

function loadConfig(): MobileConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MobileConfig>;
    if (typeof parsed.code === "string" && parsed.code !== "") {
      return { code: parsed.code };
    }
  } catch {
    /* unreadable — the setup screen takes over */
  }
  return null;
}

function saveConfig(config: MobileConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* blocked — the config holds for this tab only */
  }
}

/**
 * The code a pairing QR carried in.
 *
 * The desktop's settings page draws a QR holding this page's address with the
 * code in the query, so scanning it with a phone camera opens the page already
 * knowing what to connect to. The code is read once and then wiped from the
 * address bar: the stored config is what the page uses from then on, and a
 * code left in the URL would be re-applied on every later reload — including
 * after the reader deliberately switched to another one.
 *
 * A code in the URL wins over the stored one. Scanning is an explicit "pair me
 * with this desk", which is a newer intention than whatever the tab held.
 */
function takeCodeFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("code") ?? new URLSearchParams(window.location.hash.slice(1)).get("code");
    if (raw === null) return null;
    params.delete("code");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
    const code = normalizeCode(raw);
    return code.length === 24 ? code : null;
  } catch {
    return null;
  }
}

/** What the page opens with: a scanned code first, the last one second. */
function initialConfig(): MobileConfig | null {
  const scanned = takeCodeFromUrl();
  if (scanned !== null) {
    const config = { code: scanned };
    saveConfig(config);
    return config;
  }
  return loadConfig();
}

/** The alphabet the desktop generates codes from, mirrored here so a typed
    code can be cleaned the same way it was written: upper-cased, stripped of
    everything that is not a letter or a digit. */
function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 24);
}

/* ── Language — the two words this page knows ──────────────────────────── */

type Lang = "zh" | "en";

/** The product name, and the only word on the page that reads the same in both
    languages: a brand is not translated, so it lives outside the table rather
    than being repeated inside it. */
const APP_NAME = "Orkest Focus";

/** One row of a dropdown: the value that travels, and the word on screen. */
interface Choice {
  value: string;
  label: string;
}

/** The two languages, each named in itself, so the menu is usable from inside
    the language you are trying to leave — the desktop's own rule for this
    control, down to the written form on each half (`LANGUAGE_LABELS` in
    `src/lib/messages.ts` writes them the same way). */
const LANGUAGE_CHOICES: Choice[] = [
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English (US)" },
];

const STRINGS = {
  zh: {
    setupTitle: "连接",
    settingsTitle: "设置",
    languageLabel: "语言",
    cancel: "返回",
    setupHint: "输入桌面端「设置 → 同步」中生成的同步码。",
    codeLabel: "同步码",
    connect: "连接",
    connecting: "连接中…",
    reconfigure: "更改同步码",
    stateUseful: "我在做有用的事。",
    stateIdle: "我在休息。",
    today: "今日合计",
    start: "开始专注",
    starting: "开始中…",
    stop: "结束专注",
    stopping: "结束中…",
    listLabel: "归入清单",
    noList: "不归入清单",
    runningListHint: "运行中的专注将随之归档。",
    idleListHint: "下次开始的专注将归入所选清单。",
    updated: "更新于 {time}",
    never: "尚未更新",
    errorPrefix: "出错：",
    configIncomplete: "同步码为 24 位字符。",
    badConnect: "连接失败，请检查同步码。",
    spaceMissing: "云端没有这个同步码的数据空间：请核对同步码，或确认桌面端已开启同步。",
  },
  en: {
    setupTitle: "Connect",
    settingsTitle: "Settings",
    languageLabel: "Language",
    cancel: "Back",
    setupHint: "Enter the sync code generated by the desktop's Settings → Sync.",
    codeLabel: "Sync code",
    connect: "Connect",
    connecting: "Connecting…",
    reconfigure: "Change sync code",
    stateUseful: "I’m doing something useful.",
    stateIdle: "I’m taking a break.",
    today: "Today",
    start: "Start focusing",
    starting: "Starting…",
    stop: "Stop focusing",
    stopping: "Stopping…",
    listLabel: "File under",
    noList: "No list",
    runningListHint: "The running session will be filed there.",
    idleListHint: "The next session you start will be filed there.",
    updated: "Updated {time}",
    never: "Not yet updated",
    errorPrefix: "Error: ",
    configIncomplete: "The sync code is 24 characters.",
    badConnect: "Connection failed — check the sync code.",
    spaceMissing:
      "The cloud holds no data space for this sync code — check the code, or confirm the desktop has sync switched on.",
  },
} as const;

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* fall through to the browser */
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/* ── Time, on the face of it ──────────────────────────────────────────── */

/** `2 小时 14 分` / `2 h 14 min` — today's total, minute-grained like the
    desktop's own readout; a total that changes by the second is not a
    total. */
function formatTotal(ms: number, lang: Lang): string {
  const minutes = Math.floor(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (lang === "zh") return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** `14:32` — the moment the last pull landed, in the reader's own clock. */
function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/* ── The dropdown ─────────────────────────────────────────────────────── */

/** Where the menu sits relative to its trigger, and how close to the viewport
    edge it is allowed to come. */
const MENU_GAP = 6;
const MENU_MARGIN = 8;

/**
 * The desktop's select, rebuilt for one page.
 *
 * The trigger is the same box the desktop draws (`h-12`, `rounded-lg`, a
 * hairline border, the chevron at 60% opacity) and the menu is the same
 * popover (`shadow-pop`, 8px of padding, a check standing in the left gutter
 * of the chosen row). A native `<select>` cannot be dressed this way — the
 * platform paints its own list — so the list is drawn here.
 *
 * It is handed to `document.body` rather than parked under the trigger: the
 * list panel above it clips its own corners with `overflow: hidden`, which
 * would crop a menu drawn inside it, and a fixed layer also escapes the page's
 * stacking context. Two deliberate differences from the desktop: the height of
 * a row — 44px here, the smallest comfortable tap, against its 36px for a
 * pointer — and the menu's width, which the desktop leaves to its content but
 * this one never lets fall below the trigger's (see the layout effect).
 */
function Dropdown({
  id,
  value,
  choices,
  onChange,
  ariaLabel,
  compact = false,
}: {
  id: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const current = choices.find((choice) => choice.value === value) ?? choices[0];

  /* Place the menu against the trigger — and above it when the viewport below
     is too short. Measured in a layout effect, so the correction lands before
     the first paint instead of as a visible jump.

     The width is the wider of two things, each clamped to the viewport first
     (a menu wider than the phone would hang off the edge):

     · what the labels need. The style below asks for `max-content` on this
       pass, and `.is-measuring` holds the labels on one line while it is
       taken — see the note on that class: `overflow-wrap: anywhere` on
       `.menu-label` otherwise collapses the contribution to the longest word,
       so the measurement says "English" and the rendered menu breaks before
       "(US)".
     · the trigger's own width, as a floor. A popover narrower than the box it
       dropped out of reads as a second, unrelated control — and this one is a
       full-width field, not the desktop's content-sized trigger, so there is
       nothing else holding the two together.

     Rounded up, because this number is handed back as a `width`: the measured
     value is fractional, and half a pixel short of what a label needs is
     enough to break that label at its space.

     It is one number rather than a `width` plus a `min-width`: `min-width`
     outranks `width`, so a floor written there has to be guarded against the
     viewport clamp, and a floor that is already inside the computed value
     needs no guard. */
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (trigger === null || menu === null) return;
    const box = trigger.getBoundingClientRect();
    const room = window.innerWidth - 2 * MENU_MARGIN;
    const width = Math.max(
      Math.min(Math.ceil(menu.getBoundingClientRect().width), room),
      Math.min(box.width, room)
    );
    const height = menu.offsetHeight;
    const below = window.innerHeight - box.bottom - MENU_GAP - MENU_MARGIN;
    const flip = height > below && box.top - MENU_GAP - MENU_MARGIN > below;
    setPos({
      top: flip ? box.top - MENU_GAP - height : box.bottom + MENU_GAP,
      left: Math.max(
        MENU_MARGIN,
        Math.min(box.left, window.innerWidth - width - MENU_MARGIN)
      ),
      width,
    });
  }, [open, choices.length]);

  /* The menu takes focus so the arrow keys and Escape reach it; the trigger
     takes it back on the way out, but only for a dismissal — a choice ends
     with the pointer where it already was. */
  useEffect(() => {
    if (open && pos !== null) menuRef.current?.focus({ preventScroll: true });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (triggerRef.current?.contains(target) === true) return;
      if (menuRef.current?.contains(target) === true) return;
      setOpen(false);
    };
    /* A page that moves under an open menu leaves it pointing at nothing, and
       the menu's own scroll does not reach this listener. */
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  /* The arrow-key cursor never moves past the end of the list, so it cannot
     hide below the fold. */
  useEffect(() => {
    if (!open) return;
    itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      close(false);
    },
    [onChange, close]
  );

  const toggle = () => {
    if (open) {
      close(false);
      return;
    }
    setActive(Math.max(0, choices.findIndex((choice) => choice.value === value)));
    setOpen(true);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => Math.min(Math.max(index + step, 0), choices.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const choice = choices[active];
      if (choice !== undefined) pick(choice.value);
    } else if (event.key === "Escape" || event.key === "Tab") {
      close(true);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={"trigger" + (compact ? " is-compact" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="trigger-value">{current?.label ?? ""}</span>
        <ChevronDown className="trigger-chevron" size={16} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-labelledby={id}
            tabIndex={-1}
            className={"menu" + (pos === null ? " is-measuring" : "")}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              /* `max-content` while measuring (see the layout effect and the
                 `.is-measuring` rule): the natural width, so the labels are
                 not broken up by a box that was sized for the trigger instead
                 of for them. */
              width: pos === null ? "max-content" : pos.width,
              visibility: pos === null ? "hidden" : "visible",
            }}
            onKeyDown={onMenuKeyDown}
          >
            {choices.map((choice, index) => {
              const selected = choice.value === value;
              return (
                <div
                  key={choice.value}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  role="option"
                  aria-selected={selected}
                  className={
                    "menu-item" +
                    (index === active ? " is-active" : "") +
                    (selected ? " is-selected" : "")
                  }
                  onClick={() => pick(choice.value)}
                >
                  <span className="menu-check" aria-hidden="true">
                    {selected && <Check size={16} strokeWidth={3} />}
                  </span>
                  <span className="menu-label">{choice.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

/* ── The app ──────────────────────────────────────────────────────────── */

const POLL_MS = 10_000;
/** The floor the desktop ships with, used only until the real rules arrive. */
const DEFAULT_MIN_MS = 5 * 60_000;
const DEFAULT_MAX_MS = 8 * 3_600_000;

export function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const strings = STRINGS[lang];

  const [config, setConfig] = useState<MobileConfig | null>(initialConfig);
  /** The setup screen also opens on demand, pre-filled, to change anything. */
  const [setupOpen, setSetupOpen] = useState(config === null);

  const [spans, setSpans] = useState<Span[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [selectedList, setSelectedList] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LIST_KEY);
    } catch {
      return null;
    }
  });
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The instant today's total is measured against: a running stretch counts
      up to this, so every pull moves it forward. Nothing on the page counts
      by the second, so there is no timer of its own behind it. */
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  /* `<html lang>` follows the page's own choice rather than staying at the
     static `zh-CN` index.html ships: the font stack picks its CJK family by
     it, and so does the browser's own line breaking. The choice is written
     down beside the sync code, so a reload does not ask again. */
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* blocked — the choice holds for this tab only */
    }
  }, [lang]);

  const client = useMemo(() => {
    if (config === null) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { "x-sync-code": config.code } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [config]);

  /* The running session is the log's open tail, exactly as the desktop's
     merge sees it — the switch row beside it is a cache this page also keeps
     current for its own quick reads. */
  const tail = spans.length > 0 ? spans[spans.length - 1] : null;
  const running = tail !== null && tail.end === null ? tail : null;

  const minMs = rules?.minMs ?? DEFAULT_MIN_MS;
  const maxMs = rules?.maxMs ?? DEFAULT_MAX_MS;

  /* ── Pull ──────────────────────────────────────────────────────────── */

  /** What the last full read saw — the row count and the newest row. A poll
      re-reads only those two (one request, one row) and takes the log itself
      again only when one of them moved. */
  const seenRef = useRef<{ count: number; tail: SpanRow | null } | null>(null);

  const pull = useCallback(
    async (target: SupabaseClient, force = false) => {
      const seen = seenRef.current;
      let changed = force || seen === null;
      if (!changed && seen !== null) {
        // Every change the desktop can make moves one of these two: an append
        // moves both, a close or a re-filing moves the newest row's body, a
        // deletion moves the count. A count the server did not answer is
        // never taken as "unchanged".
        const probe = await target
          .from("focus_spans")
          .select(SPAN_COLUMNS, { count: "exact" })
          .order("start_ms", { ascending: false })
          .limit(1);
        if (probe.error) throw probe.error;
        const tail = ((probe.data ?? []) as SpanRow[])[0] ?? null;
        changed = probe.count !== seen.count || !sameTail(tail, seen.tail);
      }

      if (changed) {
        const spanRes = await target
          .from("focus_spans")
          .select(SPAN_COLUMNS)
          .order("start_ms", { ascending: true });
        if (spanRes.error) throw spanRes.error;
        const rows = (spanRes.data ?? []) as SpanRow[];
        setSpans(rows.map(toSpan));
        // The optimistic edits this page makes — a tap, a re-filing — leave
        // the log ahead of this snapshot, so the next probe finds the count
        // moved and reads the truth again. That is the wanted behaviour after
        // a write, not a cost.
        seenRef.current = {
          count: rows.length,
          tail: rows.length > 0 ? rows[rows.length - 1] : null,
        };
      }

      const [listRes, ruleRes] = await Promise.all([
        target
          .from("lists")
          .select("id, name, position")
          .order("position", { ascending: true }),
        target.from("app_settings").select("min_span_minutes, max_span_hours").maybeSingle(),
      ]);
      if (listRes.error) throw listRes.error;

      setLists(((listRes.data ?? []) as ListRow[]).slice().sort((a, b) => a.position - b.position));
      if (ruleRes.error === null && ruleRes.data) {
        const row = ruleRes.data as { min_span_minutes: number | null; max_span_hours: number | null };
        setRules({
          minMs: (row.min_span_minutes ?? 5) * 60_000,
          maxMs: (row.max_span_hours ?? 8) * 3_600_000,
        });
      }
      const landedAt = Date.now();
      setLastSyncAt(landedAt);
      // Today's total measures a running stretch up to `now`, so the read
      // that just landed is also what moves it forward.
      setNow(landedAt);
    },
    []
  );

  /* A new client is a new data space — the shape of the last read says
     nothing about this one, so the next pull takes the long way. Declared
     ahead of the poll below, which fires its first tick on mount. */
  useEffect(() => {
    seenRef.current = null;
  }, [client]);

  /* Poll every 10 s, once immediately, and once more whenever the tab returns
     to the front — the phone is looked at in bursts, and the pull that
     matters is the one that happens when someone is there to see it. */
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    if (client === null) return;
    const target = client;
    const tick = () => {
      if (document.hidden) return;
      void pull(target)
        .then(() => setError(null))
        .catch((e: unknown) => setError(String((e as Error)?.message ?? e)));
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, pull]);

  /* The list the running session wears comes from the log; the choice made
     while idle is remembered for the next start. */
  useEffect(() => {
    if (running !== null) setSelectedList(running.listId);
  }, [running?.start, running?.listId]);

  useEffect(() => {
    try {
      if (selectedList === null) localStorage.removeItem(LIST_KEY);
      else localStorage.setItem(LIST_KEY, selectedList);
    } catch {
      /* blocked — the choice holds for this tab only */
    }
  }, [selectedList]);

  /* ── Today, as the desktop would count it ──────────────────────────── */

  const todayTotal = useMemo(() => {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    let total = 0;
    for (const span of spans) {
      const from = Math.max(span.start, start);
      // A running stretch counts to the moment on screen, capped the way the
      // desktop caps a forgotten session — never beyond its own ceiling.
      const to = Math.min(
        span.end ?? Math.min(now, span.start + maxMs),
        Math.min(now, span.start + maxMs)
      );
      if (to <= from) continue;
      // The slice is judged the way the desktop judges it: by the floor the
      // stretch closed under, or the rules as they stand if it never closed.
      const floor = span.minMs ?? minMs;
      if (span.end !== null && to - from < floor) continue;
      total += to - from;
    }
    return total;
  }, [spans, now, minMs, maxMs]);

  /* ── Actions ───────────────────────────────────────────────────────── */

  /** A write the policies refused is neither a network fault nor something to
      put on the reader to decipher: it means the code this page holds names a
      space that no longer takes writes — the desktop regenerated its code, or
      switched the sync off, and emptying a space takes its marker with it (see
      `purgeDataSpace` in the desktop's engine). That reads in words; the
      policy's own version of it does not. */
  const reportFailure = useCallback(
    (e: unknown) => {
      const message = String((e as Error)?.message ?? e);
      setError(/row-level security/i.test(message) ? strings.spaceMissing : message);
    },
    [strings]
  );

  /** The pull that just happened is the freshest word (≤10 s old); a start
      pressed on it is exactly as safe as the desktop's own merge, which will
      settle any race the delay allows. */
  const startFocus = useCallback(async () => {
    const target = clientRef.current;
    if (target === null || config === null || running !== null) return;
    setBusy(true);
    const start = Date.now();
    try {
      const inserted = await target.from("focus_spans").insert({
        owner_code: config.code,
        start_ms: start,
        end_ms: null,
        list_id: selectedList,
        min_ms: null,
      });
      if (inserted.error) throw inserted.error;
      const stated = await target
        .from("focus_state")
        .upsert({ owner_code: config.code, state: "useful" });
      if (stated.error) throw stated.error;
      setSpans((prev) => [
        ...prev,
        { start, end: null, listId: selectedList, minMs: undefined },
      ]);
      setError(null);
    } catch (e: unknown) {
      reportFailure(e);
    } finally {
      setBusy(false);
    }
  }, [config, running, selectedList, reportFailure]);

  const stopFocus = useCallback(async () => {
    const target = clientRef.current;
    if (target === null || config === null || running === null) return;
    setBusy(true);
    const end = Date.now();
    try {
      // Closed whether or not the stretch reached the floor — never deleted.
      // The floor rides along on `min_ms` and the desktop drops a stretch that
      // came up short by it (`dropBriefSpans`), so a brief session still costs
      // nothing. Deleting the row instead would say nothing at all over there:
      // a row that is simply gone from the table is indistinguishable from one
      // that aged out of the sync window, and the desktop would keep the
      // session running until its own cap closed it hours later. A close it can
      // read is what turns its switch off, and the keeper of the log is then
      // the one that decides the stretch never counted.
      const closed = await target
        .from("focus_spans")
        .update({ end_ms: end, min_ms: minMs })
        .eq("start_ms", running.start);
      if (closed.error) throw closed.error;
      setSpans((prev) => [...prev.slice(0, -1), { ...running, end, minMs }]);
      const stated = await target
        .from("focus_state")
        .upsert({ owner_code: config.code, state: "idle" });
      if (stated.error) throw stated.error;
      setError(null);
    } catch (e: unknown) {
      reportFailure(e);
    } finally {
      setBusy(false);
    }
  }, [config, running, minMs, reportFailure]);

  /** Re-filing the running stretch, or naming where the next one will go. */
  const changeList = useCallback(
    async (listId: string | null) => {
      const target = clientRef.current;
      setSelectedList(listId);
      if (target === null || running === null) return;
      try {
        const moved = await target
          .from("focus_spans")
          .update({ list_id: listId })
          .eq("start_ms", running.start);
        if (moved.error) throw moved.error;
        setSpans((prev) => [
          ...prev.slice(0, -1),
          { ...running, listId },
        ]);
        setError(null);
      } catch (e: unknown) {
        reportFailure(e);
      }
    },
    [running, reportFailure]
  );

  /* ── The setup screen ───────────────────────────────────────────────── */

  if (config === null || setupOpen) {
    return (
      <Setup
        strings={strings}
        language={lang}
        onLanguage={setLang}
        initialCode={config?.code ?? null}
        onCancel={config === null ? undefined : () => setSetupOpen(false)}
        onConnect={async (code) => {
          const target = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { "x-sync-code": code } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          // A pull cannot tell a wrong code from a right one: the policies
          // answer both with the same thing, an empty log and a 200 — a query
          // that matched nothing is not an error, so "connected" would mean no
          // more than "the network works". The marker is what separates them.
          // The desktop pushes an `app_settings` row the first time it enables
          // a code, and a space without one refuses every write (see the
          // policies in supabase-schema.sql), so a missing marker means the
          // code names nothing. Refusing here is the whole difference between
          // a typo caught and a typo entered — then filled with sessions no
          // desktop will ever read, and rows nothing will ever prune.
          const marker = await target
            .from("app_settings")
            .select("owner_code")
            .maybeSingle();
          if (marker.error) throw marker.error;
          if (marker.data === null) throw new MissingSpace();
          // Forced, so a code typed over an older one reads the new space in
          // full rather than trusting the shape of the old one.
          await pull(target, true);
          saveConfig({ code });
          setConfig({ code });
          setSetupOpen(false);
          setError(null);
        }}
      />
    );
  }

  /* ── The main screen ───────────────────────────────────────────────── */

  const listName = (id: string | null) =>
    id === null ? null : (lists.find((l) => l.id === id)?.name ?? null);

  return (
    <div className="page">
      <header className="header">
        <h1>{APP_NAME}</h1>
        <button
          className="ghost"
          onClick={() => setSetupOpen(true)}
          aria-label={strings.reconfigure}
          title={strings.reconfigure}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </header>

      {error !== null && (
        <div className="error" role="alert">
          {strings.errorPrefix}
          {error}
        </div>
      )}

      {/* The switch, seen from a phone: the desktop's own two sentences, and
          the list the running session is filed under. No card around it — the
          desktop's focus view is the one screen that carries no chrome, and
          this is that screen at arm's length. No clock either: a timer here
          would be a number to watch on a device you are not working from. The
          words hold the middle of the screen and every reading sits below
          them, so the one thing worth a glance is where the eye already is. */}
      <section className={"hero" + (running !== null ? " is-running" : "")}>
        <span className="hero-bloom" aria-hidden="true" />
        <p className="state-text" role="status">
          {running !== null ? strings.stateUseful : strings.stateIdle}
        </p>
        {running !== null && listName(running.listId) !== null && (
          <div className="filed-under">{listName(running.listId)}</div>
        )}
      </section>

      {/* Today's total, and where the session goes: two readings of the same
          log, told as two rows of one panel. */}
      <section className="panel">
        <div className="row">
          <span className="row-label">{strings.today}</span>
          <span className="row-value">{formatTotal(todayTotal, lang)}</span>
        </div>
        <div className="stack">
          <label className="field-label" htmlFor="list-select">
            {strings.listLabel}
          </label>
          <Dropdown
            id="list-select"
            ariaLabel={strings.listLabel}
            value={selectedList ?? ""}
            choices={[
              { value: "", label: strings.noList },
              ...lists.map((list) => ({ value: list.id, label: list.name })),
            ]}
            onChange={(next) => void changeList(next === "" ? null : next)}
          />
          <p className="hint">
            {running !== null ? strings.runningListHint : strings.idleListHint}
          </p>
        </div>
      </section>

      <button
        className={"action" + (running !== null ? " is-stop" : "")}
        disabled={busy}
        onClick={() => void (running !== null ? stopFocus() : startFocus())}
      >
        {running !== null
          ? busy
            ? strings.stopping
            : strings.stop
          : busy
            ? strings.starting
            : strings.start}
      </button>

      <footer className="footer">
        {lastSyncAt !== null
          ? strings.updated.replace("{time}", formatTime(lastSyncAt))
          : strings.never}
      </footer>
    </div>
  );
}

/* ── The setup screen — one field, one button ──────────────────────────── */

/** The one failure the setup screen can say something truer about than "check
    the sync code": the code is well-formed and the network answered, and the
    cloud still holds no space by that name. Anything else that goes wrong
    during a connect stays the general message it always was. */
class MissingSpace extends Error {}

function Setup({
  strings,
  language,
  onLanguage,
  initialCode,
  onCancel,
  onConnect,
}: {
  strings: (typeof STRINGS)[Lang];
  language: Lang;
  onLanguage: (language: Lang) => void;
  initialCode: string | null;
  onCancel?: () => void;
  onConnect: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState(initialCode ?? "");
  const [connecting, setConnecting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const complete = code.trim().length === 24;

  return (
    <div className="page">
      <header className="header">
        {/* The same screen, two jobs: it is where a first code is typed, and
            where an existing one is changed. Only the second is settings. */}
        <h1>{onCancel === undefined ? strings.setupTitle : strings.settingsTitle}</h1>
      </header>

      {/* No panel: the page has exactly one thing to fill in, and a box drawn
          around a single field is chrome for nothing. */}
      <form
        className="setup"
        onSubmit={(e) => {
          e.preventDefault();
          if (!complete || connecting) return;
          setConnecting(true);
          setFailed(null);
          onConnect(code.trim())
            .catch((e: unknown) =>
              setFailed(
                e instanceof MissingSpace ? strings.spaceMissing : strings.badConnect
              )
            )
            .finally(() => setConnecting(false));
        }}
      >
        {/* The language comes first because it is the one setting a reader may
            need before they can read anything else on the page. */}
        <div className="lang-row">
          <label className="row-label" htmlFor="setup-language">
            {strings.languageLabel}
          </label>
          <Dropdown
            id="setup-language"
            compact
            ariaLabel={strings.languageLabel}
            value={language}
            choices={LANGUAGE_CHOICES}
            onChange={(next) => onLanguage(next === "en" ? "en" : "zh")}
          />
        </div>

        <p className="hint">{strings.setupHint}</p>

        <label className="field-label" htmlFor="setup-code">
          {strings.codeLabel}
        </label>
        <input
          id="setup-code"
          type="text"
          inputMode="numeric"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="input"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
        />

        {failed !== null && (
          <p className="error" role="alert">
            {failed}
          </p>
        )}
        {!complete && <p className="hint">{strings.configIncomplete}</p>}

        <button className="action" type="submit" disabled={!complete || connecting}>
          {connecting ? strings.connecting : strings.connect}
        </button>

        {onCancel !== undefined && (
          <button className="ghost" type="button" onClick={onCancel}>
            {strings.cancel}
          </button>
        )}
      </form>
    </div>
  );
}
