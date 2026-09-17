/**
 * The focus log, and the arithmetic over it — the one place a stretch, a day
 * and a period are defined.
 *
 * Ported from Pivot (`pivot/app/spans.ts`), which is the reference for this
 * feature. The shape of the model is Pivot's: a stretch is one run of the
 * "useful" state, a stretch that crosses midnight is cut at every midnight it
 * crosses, and every figure the log shows is derived from those same slices —
 * so no two readings of one day can disagree.
 *
 * Two things differ from the original:
 *
 *  - A stretch carries the list it was filed under (`listId`), which is what
 *    lets the same log answer "what did the day actually go on". Nothing here
 *    sets it — see `focus-store.ts` for the one rule that does.
 *  - Every word this module produces goes through the dictionary, because this
 *    app speaks two languages. The arithmetic itself stays language-free: `lang`
 *    is only ever taken by the functions that print something.
 */

import {
  LOCALES,
  translate,
  type Language,
  type MessageKey,
} from "@/lib/messages";

/**
 * One stretch of the day spent in the "useful" state, in epoch ms. `end` is
 * `null` while the stretch is still running: away time counts as focus, so a run
 * has no knowable end until the switch flips back.
 */
export interface FocusSpan {
  start: number;
  end: number | null;
  /**
   * The list this stretch is filed under. `null` is "unassigned" — a real
   * answer, not a missing one: a session that started while no list was in
   * view, or one whose list was deleted afterwards.
   */
  listId: string | null;
}

/** A dip into "useful" shorter than this is not treated as work at all: the
    stretch is dropped and stays grey, as if the break had simply carried on. */
export const MIN_USEFUL_MS = 300_000;

/** The most a stretch that is *still running* is credited. Nobody works eight
    hours without stopping, so a switch left on by mistake stops counting there
    instead of quietly swallowing the whole night. An end already written is
    never trimmed to it. */
export const MAX_USEFUL_MS = 8 * 3_600_000;

/* ── Days, weeks, and the clock ─────────────────────────────────────────── */

/** Local midnight of the day `ms` falls in. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight → the next one, as epoch ms. Built from the calendar rather
    than by adding 24h, so a daylight-saving day still measures as one day. */
export function dayBounds(ms: number): [number, number] {
  const d = new Date(startOfDay(ms));
  return [
    d.getTime(),
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(),
  ];
}

/** Monday of the week `ms` falls in. Weeks run from Monday rather than from the
    locale's idea of a week, so the figures read the same in either language. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

/** The same wall-clock time `days` calendar days on, or back for a negative. */
export function shiftDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes()
  ).getTime();
}

/** The local midnights from `first` to `last`, both ends included. */
export function daysBetween(first: number, last: number): number[] {
  const days: number[] = [];
  for (let day = startOfDay(first); day <= last; day = dayBounds(day)[1]) {
    days.push(day);
  }
  return days;
}

/* ── Printing ───────────────────────────────────────────────────────────── */

/**
 * `2 小时 15 分` / `2 h 15 min` — the plain wording the whole log uses.
 *
 * Spelled out of the dictionary rather than handed to `Intl.RelativeTimeFormat`
 * or `Intl.DurationFormat`: the former is built for "in 2 hours", and the latter
 * is still too new to rely on inside a webview that ships with the OS.
 */
export function duration(ms: number, lang: Language): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return translate(lang, "focus.duration.minutes", { n: m });
  if (m === 0) return translate(lang, "focus.duration.hours", { n: h });
  return translate(lang, "focus.duration.hoursMinutes", { h, m });
}

/** `13:05` / `01:05 PM` — a moment as the reader's own locale writes it. The one
    place the log is turned into a clock face, so the rail, the sheet and the
    export can never disagree about what time it is. */
export function clockLabel(ms: number, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** `09:05` — the exact value an `<input type="time">` reads and writes,
    whatever the browser chooses to paint in that field. Nothing is shown this
    way: every reading the reader gets goes through `clockLabel`. */
export function clockValue(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** `上午9点` / `9 am` — an hour of the local day standing on its own, for the
    axes and the rules that name an hour rather than a moment. Midnight and noon
    both come back as `12`, which is what a dial shows. */
export function hourName(hour: number, lang: Language): string {
  const h = ((hour % 24) + 24) % 24;
  // Chinese reads the day in 24 hours on these axes — the same convention the
  // clock labels already follow under `zh-CN`, where "下午1点" beside a log
  // column printed "13:05" was the one mismatch on the sheet.
  if (lang === "zh") return translate(lang, "focus.hour.h24", { h });
  const face = h % 12 === 0 ? 12 : h % 12;
  return translate(lang, h < 12 ? "focus.hour.am" : "focus.hour.pm", {
    h: face,
  });
}

/** A time as the *end* of a stretch reads on a day it has been cut down to:
    `11:40 PM`, or the word for midnight when the stretch runs past the day's
    last minute. `clockLabel` alone would wrap that to `12:00 AM`, which reads as
    the start of the next day rather than the end of this one. */
export function endClockLabel(
  ms: number,
  dayEnd: number,
  lang: Language
): string {
  return ms >= dayEnd ? translate(lang, "focus.midnight") : clockLabel(ms, lang);
}

/** `2026年9月12日` / `Sep 12, 2026` — spelled out with the year, because the log
    reaches back further than the task lists do and a bare `9/12` is two
    different days depending on which side of the ocean it is read. */
export function stampDate(ms: number, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

/** `9月` / `Sep` — the axis label of a month bar. */
export function shortMonth(ms: number, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { month: "short" }).format(
    new Date(ms)
  );
}

/**
 * `W37` / `37周` — the axis label of a week bar. Weeks here start on Monday and
 * a bar carries only its first day, so a calendar date under the point would
 * read as a day rather than as the week it stands for; the ISO week number names
 * the whole run instead. Weeks beginning in late December can carry the next
 * year's count — that is what makes W1 the week holding the year's first
 * Thursday, and it is the ISO rule, not a slip.
 */
export function weekName(ms: number, lang: Language): string {
  // The ISO count hangs each week's number on its Thursday, so walk to that: the
  // Thursday of this week, then the year's first Thursday, whose week is W1. The
  // gap is taken over UTC — a plain millisecond difference across a
  // daylight-saving change would land a day out.
  const d = new Date(startOfDay(ms));
  const back = (d.getDay() + 6) % 7;
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const firstThursday = new Date(
    jan4.getFullYear(),
    0,
    4 - ((jan4.getDay() + 6) % 7) + 3
  );
  const weeks = Math.round(
    (Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()) -
      Date.UTC(
        firstThursday.getFullYear(),
        firstThursday.getMonth(),
        firstThursday.getDate()
      )) /
      (7 * 86_400_000)
  );
  return translate(lang, "focus.weekNumber", { n: 1 + weeks });
}

/** `9月8日 – 9月14日` / `Sep 8, 2026 – Sep 14, 2026` — the run of days a chart
    point stands for. `until` is exclusive: a week ending at next Monday reads
    through the Sunday before it. */
export function dateRange(from: number, until: number, lang: Language): string {
  const end = new Date(until);
  // The last day covered, walked through the calendar rather than back a fixed
  // count of millis, so a daylight-saving edge still lands on a date.
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1).getTime();
  // A single day reads plainly: a running week seen on its Monday covers today
  // and nothing more, and `8 – 8` would stumble over it.
  if (startOfDay(from) === startOfDay(b)) return stampDate(from, lang);
  return `${stampDate(from, lang)} – ${stampDate(b, lang)}`;
}

/* ── The rules a stretch is measured by ─────────────────────────────────── */

/** The end a stretch really counts up to. A closed stretch counts to exactly the
    end it carries — the cap was already applied when that end was written, and
    an end set by hand is honoured rather than silently trimmed. A running
    stretch has no end of its own, so it measures to the clock, and the cap is
    what keeps its green from creeping past eight hours while the switch is
    forgotten. */
export function cappedEnd(span: FocusSpan, fallback: number): number {
  return span.end ?? Math.min(fallback, span.start + MAX_USEFUL_MS);
}

/** Whether a stretch is work *as far as one day is concerned*.

    A stretch is cut at every midnight it crosses, and the five-minute floor is
    then applied per slice rather than once to the whole stretch: 11:00 pm →
    12:03 am is a session worth keeping, but the three minutes it left on the
    second day are on their own too short to be work, so that day does not count
    them — and stays grey through them. Without this the day's list and its total
    would disagree: the row would show three minutes that the total had already
    refused.

    The one exception is a slice that is still being written — the open end of a
    stretch that has not been switched off yet. It is credited as it goes and
    judged when it closes, so flipping to useful and opening the panel does not
    show an empty day for the first five minutes. */
export function countsOn(
  span: FocusSpan,
  from: number,
  to: number,
  now: number
): boolean {
  const end = cappedEnd(span, now);
  const start = Math.max(span.start, from);
  const stop = Math.min(end, to);
  if (stop <= start) return false;
  if (span.end === null && end < to) return true;
  return stop - start >= MIN_USEFUL_MS;
}

/** A day's share of a stretch, once the five-minute rule has had its say. */
interface Slice {
  day: number;
  from: number;
  to: number;
}

/** The parts of `span` that count as the day's work: cut at every midnight it
    crosses, and each judged against the five-minute floor on its own. The one
    place that rule is applied — the day totals, the list totals and the switch
    times all take their slices from here, so a day can never hold time that one
    of them saw and the other did not. */
function countingSlices(span: FocusSpan, now: number): Slice[] {
  const end = cappedEnd(span, now);
  const parts: Slice[] = [];

  for (let cursor = span.start; cursor < end; ) {
    const day = startOfDay(cursor);
    const dayEnd = dayBounds(cursor)[1];
    const sliceEnd = Math.min(end, dayEnd);
    if (countsOn(span, day, dayEnd, now)) {
      parts.push({ day, from: cursor, to: sliceEnd });
    }
    cursor = sliceEnd;
  }

  return parts;
}

/* ── Days and their figures ─────────────────────────────────────────────── */

/** Everything one day holds: the time, how many stretches touched it, and how
    many times the switch moved. */
export interface DayBucket {
  useful: number;
  spans: number;
  switches: number;
}

/** One pass over the log, cutting every stretch at each midnight it crosses, so
    that a day's figures are a lookup rather than a rescan — which is what makes
    the all-history periods affordable to open. */
export function bucketByDay(
  spans: FocusSpan[],
  now: number
): Map<number, DayBucket> {
  const buckets = new Map<number, DayBucket>();
  const at = (day: number): DayBucket => {
    const found = buckets.get(day);
    if (found) return found;
    const made: DayBucket = { useful: 0, spans: 0, switches: 0 };
    buckets.set(day, made);
    return made;
  };

  for (const span of spans) {
    const parts = countingSlices(span, now);
    for (const part of parts) {
      const bucket = at(part.day);
      bucket.useful += part.to - part.from;
      bucket.spans += 1;
    }

    // The switch moved once when the stretch opened and once when it closed; a
    // stretch still running has only made the first of the two. Either move is
    // counted only on a day that holds some of the work, which is what keeps a
    // stretch ending exactly at midnight from leaving a "1 switch, no time" day
    // behind it.
    const first = parts[0]?.day;
    const last = parts[parts.length - 1]?.day;
    if (first !== undefined) at(first).switches += 1;
    if (span.end !== null && last !== undefined) at(last).switches += 1;
  }

  return buckets;
}

/** One movement of the switch: when it happened, and which way it went. */
export interface SwitchMove {
  at: number;
  into: boolean;
}

/** Every movement of the switch, filed under the day that counts it — a move
    onto useful under the first day that counts the stretch it opened, a move
    back to rest under the last. Each day's list comes back in order.

    The moves a day holds are exactly the ones its `switches` count runs to, so
    "how many times" and "at what times" are two readings of one set of events
    rather than two tallies that could disagree. */
export function switchTimes(
  spans: FocusSpan[],
  now: number
): Map<number, SwitchMove[]> {
  const times = new Map<number, SwitchMove[]>();
  const file = (day: number, move: SwitchMove) => {
    const found = times.get(day);
    if (found) found.push(move);
    else times.set(day, [move]);
  };

  for (const span of spans) {
    const parts = countingSlices(span, now);
    const first = parts[0]?.day;
    const last = parts[parts.length - 1]?.day;
    if (first !== undefined) file(first, { at: span.start, into: true });
    if (span.end !== null && last !== undefined) {
      file(last, { at: span.end, into: false });
    }
  }

  for (const list of times.values()) list.sort((a, b) => a.at - b.at);
  return times;
}

/** The days the log holds, oldest first — the order anything that accumulates
    has to be walked in. */
export function daysAscending(buckets: Map<number, DayBucket>): number[] {
  return [...buckets.keys()].sort((a, b) => a - b);
}

/** The runs of back-to-back days that each hold some useful time, oldest first.
    Days are joined by their edges rather than by adding 24 h, so a change of
    daylight saving does not read as a day gone missing. */
export function dayRuns(buckets: Map<number, DayBucket>): number[][] {
  const runs: number[][] = [];

  for (const day of daysAscending(buckets)) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (last !== undefined && dayBounds(last)[1] === day) run.push(day);
    else runs.push([day]);
  }

  return runs;
}

/** The days the switch was still on at or after `hour`, local — the days a
    stretch was still running into that hour, whether or not anything was
    switched. Read from the slices rather than from the moves, because the hour
    can fall in the middle of a stretch: someone who starts at ten and stops at
    six never moves the switch at eleven, and was at it all the same. */
export function daysStillOnAt(
  spans: FocusSpan[],
  now: number,
  hour: number
): Set<number> {
  const days = new Set<number>();
  const mark = hour * 3_600_000;

  for (const span of spans) {
    for (const part of countingSlices(span, now)) {
      if (part.to - part.day > mark) days.add(part.day);
    }
  }

  return days;
}

/** The useful time held by a run of days. */
export function totalOver(
  days: number[],
  buckets: Map<number, DayBucket>
): number {
  let total = 0;
  for (const day of days) total += buckets.get(day)?.useful ?? 0;
  return total;
}

/* ── Periods ────────────────────────────────────────────────────────────── */

export type Period = "day" | "week" | "month" | "year" | "all";

/** The periods the averages can be read over, in the order they are offered.
    `labelKey` rather than a label, so the picker is named by the dictionary. */
export const PERIODS: { key: Period; labelKey: MessageKey }[] = [
  { key: "day", labelKey: "focus.period.day" },
  { key: "week", labelKey: "focus.period.week" },
  { key: "month", labelKey: "focus.period.month" },
  { key: "year", labelKey: "focus.period.year" },
  { key: "all", labelKey: "focus.period.all" },
];

/** The midnights a period covers: the ones elapsed so far, ending today. A
    period in progress is measured only over the days it has actually had.

    Week keeps its anchor at Monday — seven days is short enough that a blank
    Monday is a fact about the week rather than a distortion of it. Month and
    year do not: averaging a history three days old across a whole September, let
    alone a whole year, would read as a collapse the person never had, and the
    day count on the card would claim days they never logged. So those two begin
    no earlier than the first stretch on record. */
export function periodDays(
  spans: FocusSpan[],
  period: Period,
  now: number
): number[] {
  const today = startOfDay(now);
  const d = new Date(today);
  // Nothing logged yet: every period is a single day, so every average is simply
  // zero rather than a division by an empty history.
  const first = spans[0] === undefined ? today : startOfDay(spans[0].start);

  switch (period) {
    case "day":
      return [today];
    case "week":
      return daysBetween(startOfWeek(now), today);
    case "month":
      return daysBetween(
        Math.max(new Date(d.getFullYear(), d.getMonth(), 1).getTime(), first),
        today
      );
    case "year":
      return daysBetween(
        Math.max(new Date(d.getFullYear(), 0, 1).getTime(), first),
        today
      );
    case "all":
      return daysBetween(first, today);
  }
}

/** The four averages, all taken over the days the period covers, so "this week"
    means "per day of this week so far" and not "per day since forever". */
export interface Averages {
  days: number;
  useful: number;
  perDay: number;
  share: number;
  switches: number;
  stretch: number;
}

export function averageOver(
  days: number[],
  buckets: Map<number, DayBucket>
): Averages {
  let useful = 0;
  let spans = 0;
  let switches = 0;
  let shares = 0;

  for (const day of days) {
    const bucket = buckets.get(day);
    const [from, to] = dayBounds(day);
    useful += bucket?.useful ?? 0;
    spans += bucket?.spans ?? 0;
    switches += bucket?.switches ?? 0;
    shares += bucket === undefined ? 0 : bucket.useful / (to - from);
  }

  const count = days.length || 1;
  return {
    days: days.length,
    useful,
    perDay: useful / count,
    // The share is averaged as a share, not rebuilt from the totals: a 25-hour
    // day must not be counted as if it were a 24-hour one.
    share: shares / count,
    switches: switches / count,
    // Averaged over the stretches actually logged, which is what "a stretch"
    // means — not the average of the daily averages.
    stretch: spans === 0 ? 0 : useful / spans,
  };
}

export interface Bar {
  from: number;
  to: number;
  useful: number;
}

/** The last `count` weeks, oldest first, with this week running only up to
    today. */
export function weekBars(
  buckets: Map<number, DayBucket>,
  now: number,
  count: number
): Bar[] {
  const today = startOfDay(now);
  const bars: Bar[] = [];

  for (let back = count - 1; back >= 0; back--) {
    const from = shiftDays(startOfWeek(now), -back * 7);
    // The last day of the week, or today if the week is still running.
    const last = Math.min(shiftDays(from, 6), today);
    bars.push({
      from,
      to: shiftDays(from, 7),
      useful: totalOver(daysBetween(from, last), buckets),
    });
  }

  return bars;
}

/** The last `count` months, oldest first, with this month running to today. */
export function monthBars(
  buckets: Map<number, DayBucket>,
  now: number,
  count: number
): Bar[] {
  const today = new Date(startOfDay(now));
  const bars: Bar[] = [];

  for (let back = count - 1; back >= 0; back--) {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const from = d.getTime();
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const last = Math.min(new Date(to - 1).getTime(), today.getTime());
    bars.push({ from, to, useful: totalOver(daysBetween(from, last), buckets) });
  }

  return bars;
}

/** Useful time bucketed by hour of the local day, over the whole log. A stretch
    is cut at every hour boundary it crosses, so an hour is credited only with
    the minutes actually spent inside it. */
export function hourTotals(spans: FocusSpan[], now: number): number[] {
  const hours = new Array<number>(24).fill(0);

  for (const span of spans) {
    const end = cappedEnd(span, now);
    for (let cursor = span.start; cursor < end; ) {
      const d = new Date(cursor);
      const nextHour = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours() + 1
      ).getTime();
      const sliceEnd = Math.min(end, nextHour);
      // Only the hours that belong to a slice the day itself counts. A sliver of
      // a session that spilled past midnight is not work anywhere, so it is not
      // an hour either — the same rule the day totals run on.
      if (countsOn(span, startOfDay(cursor), dayBounds(cursor)[1], now)) {
        hours[d.getHours()] += sliceEnd - cursor;
      }
      cursor = sliceEnd;
    }
  }

  return hours;
}

/** Useful time bucketed by weekday and hour of the local day, over the whole
    log: seven rows, Monday first, each twenty-four cells wide. */
export function heatmap(spans: FocusSpan[], now: number): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

  for (const span of spans) {
    const end = cappedEnd(span, now);
    for (let cursor = span.start; cursor < end; ) {
      const d = new Date(cursor);
      const nextHour = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours() + 1
      ).getTime();
      const sliceEnd = Math.min(end, nextHour);
      if (countsOn(span, startOfDay(cursor), dayBounds(cursor)[1], now)) {
        // `getDay` counts from Sunday; the grid counts from Monday, so that it
        // reads down the page the way a week is written.
        grid[(d.getDay() + 6) % 7][d.getHours()] += sliceEnd - cursor;
      }
      cursor = sliceEnd;
    }
  }

  return grid;
}

/** The hour of the day that has swallowed the most useful time. */
export function peakHour(hours: number[]): number | null {
  let peak: number | null = null;
  for (let hour = 0; hour < hours.length; hour++) {
    if (hours[hour] > 0 && (peak === null || hours[hour] > hours[peak])) {
      peak = hour;
    }
  }
  return peak;
}

export interface Best {
  ms: number;
  start: number;
  end: number;
}

/** The longest single stretch ever logged. */
export function bestStretch(spans: FocusSpan[], now: number): Best | null {
  let best: Best | null = null;
  for (const span of spans) {
    const end = cappedEnd(span, now);
    const ms = end - span.start;
    if (ms > 0 && (best === null || ms > best.ms)) {
      best = { ms, start: span.start, end };
    }
  }
  return best;
}

/** The day that holds the most useful time. */
export function bestDay(
  buckets: Map<number, DayBucket>
): { day: number; useful: number } | null {
  let best: { day: number; useful: number } | null = null;
  for (const [day, bucket] of buckets) {
    if (bucket.useful > 0 && (best === null || bucket.useful > best.useful)) {
      best = { day, useful: bucket.useful };
    }
  }
  return best;
}

/* ── The list a reading is about ────────────────────────────────────────── */

/**
 * Which slice of the log a reading covers.
 *
 * Two sentinels and everything else is a list id. They cannot collide with a
 * real id (`uid("list")` never produces a leading `@`), and a flat string keeps
 * the scope usable as a `<Select>` value, which is where it is picked.
 */
export const SCOPE_ALL = "@all";
export const SCOPE_UNASSIGNED = "@unassigned";

export type Scope = string;

export function inScope(span: FocusSpan, scope: Scope): boolean {
  if (scope === SCOPE_ALL) return true;
  if (scope === SCOPE_UNASSIGNED) return span.listId === null;
  return span.listId === scope;
}

/** The log cut down to one list — the whole of what "the statistics follow the
    list" means. Every figure downstream takes this array and nothing else, so
    the period pickers, the charts, the milestones and the export all move
    together when the scope does. */
export function scopeSpans(spans: FocusSpan[], scope: Scope): FocusSpan[] {
  return scope === SCOPE_ALL ? spans : spans.filter((span) => inScope(span, scope));
}

/** One list's share of a run of days. */
export interface ListTotal {
  /** `null` is the unassigned bucket. */
  listId: string | null;
  useful: number;
  /** How many stretches touched those days, the way `DayBucket.spans` counts. */
  spans: number;
}

/** The days' useful time, broken down by the list it went to — the per-list card
    in the log. One pass over the slices rather than one `bucketByDay` per list,
    and it takes its slices from the same place every other reading does, so the
    rows here add up to exactly the total the card above them prints. */
export function totalsByList(
  spans: FocusSpan[],
  days: number[],
  now: number
): ListTotal[] {
  const wanted = new Set(days);
  const totals = new Map<string | null, ListTotal>();

  for (const span of spans) {
    for (const part of countingSlices(span, now)) {
      if (!wanted.has(part.day)) continue;
      const found = totals.get(span.listId) ?? {
        listId: span.listId,
        useful: 0,
        spans: 0,
      };
      found.useful += part.to - part.from;
      found.spans += 1;
      totals.set(span.listId, found);
    }
  }

  return [...totals.values()].sort((a, b) => b.useful - a.useful);
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

/** The log as the export writes it: one row a stretch, its list named in full. */
export function exportRow(
  span: FocusSpan,
  listName: string | null,
  lang: Language
): { start: string; end: string; minutes: string; list: string } {
  const end = span.end;
  return {
    start: stampWithSeconds(span.start),
    end: end === null ? "" : stampWithSeconds(end),
    // Minutes to a tenth: a whole number would read more calmly, but every row
    // would then lose up to half a minute, and a year of rows would sum to a
    // total that no longer matches the one the sheet shows for the same days.
    minutes: end === null ? "" : ((end - span.start) / 60_000).toFixed(1),
    list: listName ?? translate(lang, "focus.unassigned"),
  };
}

/** `2026-09-14 14:03:20` — a stamp a spreadsheet can sort and a person can read.
    Deliberately not ISO 8601: there is no `T`, no offset and no `Z`, because the
    file is meant to be opened rather than fed back into a program, and the log
    was kept in local time. */
function stampWithSeconds(ms: number): string {
  const at = new Date(ms);
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(
    at.getHours()
  )}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
}
