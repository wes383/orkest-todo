/**
 * Local-calendar date helpers.
 *
 * Everything is keyed off `YYYY-MM-DD` strings so that "today" means the
 * user's local today — never a UTC-shifted one. `new Date("2026-01-01")`
 * parses as UTC midnight and would flip the day for negative offsets, so we
 * build dates from components instead.
 *
 * Anything that renders words takes a `Language`: these functions are called
 * from components, not from a context, so the language has to be handed in.
 * Month and day names come from `Intl` rather than a dictionary — the platform
 * already knows them, and `zh-CN` gets the `9月20日` shape for free.
 */

import { LOCALES, translate, type Language, type MessageKey } from "@/lib/messages";

const DAY_MS = 86_400_000;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days between `iso` and today. Negative = in the past. */
export function daysFromToday(iso: string): number {
  const a = fromISODate(todayISO()).getTime();
  const b = fromISODate(iso).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** `9月20日` / `2027年1月3日` · `Sep 20` / `Jan 3, 2027` — year only when needed. */
export function formatDate(iso: string, lang: Language): string {
  const d = fromISODate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(LOCALES[lang], {
    ...(sameYear ? {} : { year: "numeric" as const }),
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Human due-date label with near-term shortcuts. */
export function dueLabel(iso: string, lang: Language): string {
  switch (daysFromToday(iso)) {
    case 0:
      return translate(lang, "date.today");
    case 1:
      return translate(lang, "date.tomorrow");
    case 2:
      return translate(lang, "date.dayAfter");
    case -1:
      return translate(lang, "date.yesterday");
    case -2:
      return translate(lang, "date.dayBefore");
    default:
      return formatDate(iso, lang);
  }
}

export type DueTone = "overdue" | "today" | "soon" | "later";

/** Tone drives the color of the due-date chip. A done task is never "overdue". */
export function dueTone(dueDate: string | null, done: boolean): DueTone | null {
  if (!dueDate) return null;
  if (done) return "later";
  const diff = daysFromToday(dueDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "later";
}

export type TimeVerb = "created" | "completed";

/**
 * The two families of timestamp text, spelled out rather than composed as
 * `` `time.${verb}.${unit}` `` so the keys stay literal and the compiler can
 * check them.
 */
const TIME_KEYS: Record<
  TimeVerb,
  {
    justNow: MessageKey;
    minutes: MessageKey;
    hours: MessageKey;
    yesterday: MessageKey;
    days: MessageKey;
    onDate: MessageKey;
  }
> = {
  created: {
    justNow: "time.created.justNow",
    minutes: "time.created.minutes",
    hours: "time.created.hours",
    yesterday: "time.created.yesterday",
    days: "time.created.days",
    onDate: "time.created.onDate",
  },
  completed: {
    justNow: "time.completed.justNow",
    minutes: "time.completed.minutes",
    hours: "time.completed.hours",
    yesterday: "time.completed.yesterday",
    days: "time.completed.days",
    onDate: "time.completed.onDate",
  },
};

/**
 * Relative timestamp for a task card.
 *
 * `verb` is a parameter rather than something the caller post-processes. The
 * old signature returned `…前创建` and the card did
 * `relativeCreated(x).replace("创建", "完成")` — which only ever worked because
 * Chinese appends a verb. English puts it in front ("Created 3 hours ago") and
 * pluralises the unit, so the verb has to be part of the lookup.
 */
export function relativeCreated(
  ts: number,
  lang: Language,
  verb: TimeVerb = "created"
): string {
  const keys = TIME_KEYS[verb];
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return translate(lang, keys.justNow);
  if (mins < 60) return translate(lang, keys.minutes, { n: mins });

  const hours = Math.floor(mins / 60);
  if (hours < 24) return translate(lang, keys.hours, { n: hours });

  const days = Math.floor(hours / 24);
  if (days === 1) return translate(lang, keys.yesterday);
  if (days < 30) return translate(lang, keys.days, { n: days });

  return translate(lang, keys.onDate, {
    date: formatDate(toISODate(new Date(ts)), lang),
  });
}
