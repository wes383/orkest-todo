"use client";

/**
 * The focus statistics, as a page of its own.
 *
 * It began life as Pivot's drawer (`pivot/app/drawer.tsx`) — a sheet over the
 * switch — and was later promoted to a screen in the sidebar: the figures grew
 * into the thing people actually visit, so they got a place of their own. The
 * shape of the content is still the original's: the day's stretches down one
 * side with the averages and personal best beside them, then the trend, the
 * shape of the day, and the board of milestones. Every figure is derived from
 * the same log the switch writes, so
 *
 * nothing here can disagree with the rail.
 *
 * ── What this page adds to Pivot's ─────────────────────────────────────────
 *
 * A list, twice over:
 *
 *  - `By list` breaks the time down by where it went, and carries the scope
 *    picker: choosing a list rescales every card on the page at once, because
 *    every one of them is computed from the same `scoped` array. Nothing
 *    downstream has to know the scope changed. It stands in the top-left
 *    corner, because it is the one card that says where the hours went and the
 *    one the rest of the page is read against.
 *  - Every row of the stretch list wears its own list and lets it be changed —
 *    on any row, running or long finished, as many times as wanted. That is
 *    the same action the switch offers for the session it is running, reached
 *    from the row itself rather than the switch's.
 *
 * The CSV export does not live here — it belongs with the other whole-app
 * settings, in the settings page, where "everything the app holds" is a more
 * honest home for it than the foot of a page of charts.
 *
 * ── The task side ──────────────────────────────────────────────────────────
 *
 * After the trend sit three cards and a second board that read the todo set
 * instead of the log: completion (today / week / all time, per list), the
 * fourteen-day compare (focus time beside tasks done), and the filed-vs-
 * unfiled split of useful time. The milestone board carries the task ladders
 * behind the focus ones. The figures never mix — a completion is stamped when
 * a checkbox is ticked, a stretch when the switch is flipped — and the task
 * cards ignore the scope picker, which is a reading of the log, not of the
 * todos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Timer } from "lucide-react";
import { AddSpanDialog } from "@/components/focus/add-span-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Card, Heat, Line, Metric, Segmented, YearHeat } from "@/components/focus/focus-charts";
import {
  PERIODS,
  SCOPE_ALL,
  SCOPE_UNASSIGNED,
  averageOver,
  bestDay,
  bestStretch,
  bucketByDay,
  cappedEnd,
  clockLabel,
  clockValue,
  countsOn,
  dateRange,
  dayBounds,
  daysAscending,
  daysBetween,
  duration,
  durationWithSeconds,
  endClockLabel,
  heatmap,
  hourName,
  hourTotals,
  inScope,
  maxUsefulMs,
  monthBars,
  peakHour,
  periodDays,
  scopeSpans,
  shiftDays,
  shortMonth,
  stampDate,
  startOfDay,
  startOfWeek,
  totalOver,
  totalsByList,
  weekBars,
  weekName,
  type FocusSpan,
  type Period,
  type Scope,
} from "@/lib/focus-spans";
import {
  PERFECT_DAY_RULE_KEY,
  RICH_PCT,
  milestones,
  type Milestone,
  type MilestoneGroup,
} from "@/lib/focus-achievements";
import type { AddRefusal } from "@/lib/focus-store";
import { LOCALES, type Language } from "@/lib/messages";
import { useI18n } from "@/lib/i18n";
import {
  taskListBreakdown,
  taskStats,
  usefulSplit,
} from "@/lib/task-stats";
import { spanLimits } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { paletteVar, type Todo, type TodoList } from "@/lib/types";

/** The weekday names in the heat grid's own Monday-first order: 2024-01-01 was
    a Monday, so the names fall straight out of the platform's calendar rather
    than out of a second dictionary to keep in step. */
function weekdayNames(lang: Language): string[] {
  const format = new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(2024, 0, 1 + index))
  );
}

/* ── Milestones ───────────────────────────────────────────────────────────
   The ring, the name and the two lines under it. The name and the rule arrive
   as message keys with their variables, so a milestone is written in the
   reader's own language without the achievements layer knowing either. */

/** The circumference of a tile's ring — a 48px circle with a 4px stroke, so a
    radius of 22. Drawn as one dash this long, then shortened. */
const RING = 2 * Math.PI * 22;

/** The ring, which is the whole of the progress and the only colour the sheet
    spends on a milestone: the green the rest of it keeps for useful time, drawn
    whether or not the thing is done — an arc is progress, and progress is green
    here. What a finished milestone earns on top is the tick at the middle.

    Nothing is ever drawn as a dot, so the milestones that are simply on or off
    — the first switch, the early start, the late night — read as an empty ring
    or a full one and nothing in between; `focus-achievements.ts` hands those a
    progress of exactly 0 or 1. */
function Ring({ progress, reached }: { progress: number; reached: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-12 w-12 shrink-0">
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        strokeWidth="4"
        className="stroke-hover-bg-strong"
      />
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        // One dash as long as the ring, shortened by the offset: what is left
        // drawn is exactly the arc that has been earned.
        strokeDasharray={RING}
        strokeDashoffset={RING * (1 - progress)}
        // Begins at twelve rather than at three, the way a dial reads.
        transform="rotate(-90 24 24)"
        className="stroke-focus-useful"
      />
      {reached ? (
        // Inside the ring, in the ring's own green: there is nothing more to say
        // about a milestone that is done than that it is done.
        <path
          d="m16.8 24.6 4.8 4.8 9.6-10.8"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-focus-useful"
        />
      ) : null}
    </svg>
  );
}

/** What a milestone is called, standing on top of its ring, with the rule it
    asks for spelled out for anyone the label does not reach. */
function Name({ item }: { item: Milestone }) {
  const { t } = useI18n();
  return (
    <>
      <span
        className={cn(
          "mb-3 text-sm leading-tight",
          item.reached ? "text-foreground" : "text-foreground-muted"
        )}
      >
        {t(item.nameKey, item.nameVars)}
      </span>
      <span className="sr-only">{t(item.goalKey, item.goalVars)}</span>
    </>
  );
}

/** What a milestone has to say for itself, under the ring: the rule in a few
    words when the name does not already carry it, and then the one thing the
    reader wants next — the day it was reached, or how far along it is. */
function Face({ item }: { item: Milestone }) {
  const { t } = useI18n();
  return (
    <>
      {item.ruleKey === undefined ? null : (
        <div
          className={cn(
            "mt-1.5 text-xs leading-snug",
            item.reached ? "text-foreground-faint" : "text-foreground-subtle"
          )}
        >
          {t(item.ruleKey, item.ruleVars)}
        </div>
      )}
      {item.detailKey === undefined ? null : (
        <div
          className={cn(
            "mt-1.5 text-xs leading-snug tabular-nums",
            item.reached ? "text-foreground-faint" : "text-foreground-subtle"
          )}
        >
          {t(item.detailKey, item.detailVars)}
        </div>
      )}
    </>
  );
}

/** One milestone. Its width comes from the column it is laid into and its
    height from the grid row, so a row of tiles lines up on both edges whatever
    each one has to say. */
function MilestoneTile({ item }: { item: Milestone }) {
  return (
    <div className="flex h-full w-full flex-col items-center rounded-md bg-muted px-3 py-5 text-center">
      <Name item={item} />
      <Ring progress={item.progress} reached={item.reached} />
      {/* The name stands on the top padding, the ring hangs under it and the
          words stand on the floor, so the last line of every card meets the
          bottom edge at the same height whatever the card has to say. */}
      <div className="mt-auto flex w-full flex-col items-center pt-3">
        <Face item={item} />
      </div>
    </div>
  );
}

/** A group whose milestones are rungs of one ladder — 3, 7, 14 … days; a
    quarter of an hour, an hour, three … — walked one at a time rather than laid
    out side by side. It opens on the rung still to be reached, since finishing
    one is what brings the next forward, and rests on the last rung once every
    one of them is underfoot. The arrows are there for looking back up at what
    has been climbed. */
function MilestoneLadder({ group }: { group: MilestoneGroup }) {
  const { t } = useI18n();
  // Null until an arrow is used, so the rung it opens on is worked out afresh
  // from the log — the one that is actually next, not the one after whatever
  // was last looked at.
  const [picked, setPicked] = useState<number | null>(null);
  const next = group.items.findIndex((item) => !item.reached);
  const at = picked ?? (next === -1 ? group.items.length - 1 : next);
  const last = group.items.length - 1;
  const item = group.items[at];

  const arrow = (side: "left" | "right") => (
    <button
      type="button"
      onClick={() => setPicked(side === "left" ? at - 1 : at + 1)}
      disabled={side === "left" ? at === 0 : at === last}
      aria-label={t(
        side === "left" ? "focus.log.prevRung" : "focus.log.nextRung"
      )}
      // Held at the ends of the ladder as an invisible bar rather than dropped,
      // so the rung does not shift sideways as it is reached.
      className="flex w-6 shrink-0 items-center justify-center rounded-md text-foreground-faint transition-colors duration-base ease-out hover:bg-hover-bg-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d={side === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );

  return (
    <div className="flex h-full w-full items-stretch rounded-md bg-muted px-1 py-5">
      {arrow("left")}
      <div className="flex min-w-0 flex-1 flex-col items-center text-center">
        <Name item={item} />
        <Ring progress={item.progress} reached={item.reached} />
        {/* Like a lone milestone, the name stands on the top padding, the ring
            hangs below it and the words stand on the floor, with the dots
            printed under them. */}
        <div className="mt-auto flex w-full flex-col items-center pt-3">
          <Face item={item} />
          {/* Where on the ladder this rung sits: one dot a rung, green for the
              ones already underfoot. Pinned to the foot of the card, which is
              where a row of dots belongs — and it keeps them on one line across
              every ladder, whatever the rung above them has to say. */}
          <div className="flex items-center gap-1 pt-3">
            {group.items.map((rung, index) => (
              <span
                key={rung.id}
                aria-hidden="true"
                className={cn(
                  "h-1 w-1 rounded-full",
                  index === at
                    ? "bg-foreground"
                    : rung.reached
                      ? "bg-focus-useful"
                      : "bg-border-strong"
                )}
              />
            ))}
          </div>
        </div>
      </div>
      {arrow("right")}
    </div>
  );
}

/* ── The day's stretches ───────────────────────────────────────────────── */

/** One row of the day's list: a stretch already cut down to that day, together
    with the two ends that say whether an edge belongs to the day rather than to
    the stretch. A session that ran over midnight has a row on either side of it,
    and each row is only half of the story. */
interface Row {
  index: number;
  /** The day this row belongs to, as its local midnight. A time typed into the
      row is read on this day, which is what lets the first half of a session
      that ran over midnight be ended before midnight — an edit that cuts the
      session in two at the midnight below it. */
  dayStart: number;
  start: number;
  end: number;
  /** The day's own last minute, which is what an end cut off at midnight is
      written against. */
  dayEnd: number;
  spanStart: number;
  fromEarlier: boolean;
  intoLater: boolean;
}

/** The arrow between a stretch's two times, drawn rather than typed: a row that
    is only a fragment of a longer session gets a dashed shaft, which is the one
    signal that reads the same whether the missing part is before the row or
    after it. The `→` character has nothing to say about that. */
function Arrow({ fragment }: { fragment: boolean }) {
  return (
    <svg
      viewBox="0 0 16 8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-2 w-4 shrink-0 text-foreground-faint"
    >
      <path d="M1 4h11" strokeDasharray={fragment ? "2 2.5" : undefined} />
      <path d="M12 1.5 15 4l-3 2.5" />
    </svg>
  );
}

/** The live tally on the running row. It keeps a one-second beat of its own
    so the page's slow 30-second clock is not dragged along with it: only this
    badge re-renders each second, every other figure on the page stays put.
    The tally reads through the cap the same way the 30-second path does — a
    useful stretch left running is credited at most `maxUsefulMs`. */
function RunningBadge({
  start,
  language,
  label,
}: {
  start: number;
  language: Language;
  label: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    // Deferred by a hair rather than run in the effect body, where a
    // synchronous write would land mid-commit.
    const first = window.setTimeout(tick, 0);
    const beat = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(beat);
    };
  }, []);
  const closed = Math.min(now ?? start, start + maxUsefulMs());
  return (
    <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-muted px-2.5 text-xs font-medium text-foreground-muted">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-focus-useful"
      />
      {label}
      <span className="tabular-nums">
        {durationWithSeconds(closed - start, language)}
      </span>
    </span>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

export interface FocusStatsProps {
  /** The whole log, oldest first — the page reads it, never owns it. */
  spans: FocusSpan[];
  /** The whole todo set, done and not — the task-side cards read it, never
      own it. Milestones on it are lifetime figures and ignore the scope
      picker, which is a reading of the focus log, not of the todos. */
  todos: Todo[];
  lists: TodoList[];
  /** Move the end of the stretch at `index` in the log. */
  onReschedule: (index: number, end: number) => void;
  /** End the stretch at `index` at `end` and keep the rest of it as a second
      stretch, opening at the midnight that divided the two days. */
  onSplit: (index: number, end: number) => void;
  /** Drop the stretch at `index` in the log. */
  onDelete: (index: number) => void;
  /** File the stretch at `index` under a list — or under nothing, which is
      `null`. Open to any row at any time, running or long finished. */
  onSetList: (index: number, listId: string | null) => void;
  /** Write a stretch by hand — the log's 补记. Answers with the reason it was
      refused, or `null` when it was kept, so the dialog can print the log's own
      objection instead of guessing at one. */
  onAddManual: (start: number, end: number, listId: string | null) => AddRefusal | null;
}

export function FocusStats({
  spans,
  todos,
  lists,
  onReschedule,
  onSplit,
  onDelete,
  onSetList,
  onAddManual,
}: FocusStatsProps) {
  const { t, language, locale } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  // Today is what a log is opened to check, so the averages start there instead
  // of on the week.
  const [period, setPeriod] = useState<Period>("day");
  const [chart, setChart] = useState<"day" | "week" | "month">("week");
  /** Which slice of the log every reading on this sheet is about. */
  const [scope, setScope] = useState<Scope>(SCOPE_ALL);
  /** Which day the stretch list is showing, as a local midnight. `null` means
      today, and it is kept as a flag rather than as a captured timestamp so the
      list goes on meaning *today* once the clock rolls past midnight. */
  const [day, setDay] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [refused, setRefused] = useState<{
    index: number;
    message: string;
    nonce: number;
  } | null>(null);
  /** Bumped on every refusal, so a second bad edit remounts the field even when
      it happens in the same millisecond as the first. */
  const refusals = useRef(0);

  // The clock is read once the page is mounted rather than during a render — a
  // render has to stay pure and the time is not — and then kept honest with a
  // slow beat, so a page left open does not quietly drift.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    // Deferred by a hair rather than run in the effect body, where a
    // synchronous write would land mid-commit.
    const first = window.setTimeout(tick, 0);
    const beat = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(beat);
    };
  }, []);

  // A complaint is about the edit just attempted, so the next click anywhere
  // retires it — there is nothing to hunt for, and no stale verdict left sitting
  // under a row the reader has already moved on from. Captured on the way down so
  // that whatever was clicked still gets the click.
  useEffect(() => {
    if (refused === null) return;
    const dismiss = () => setRefused(null);
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [refused]);

  /** A scope pointing at a list that has since been deleted falls back to the
      whole log, which is the reading that is still true. */
  const effectiveScope: Scope =
    scope === SCOPE_ALL ||
    scope === SCOPE_UNASSIGNED ||
    lists.some((list) => list.id === scope)
      ? scope
      : SCOPE_ALL;

  /** The log cut down to the chosen list — the whole of what "the statistics
      follow the list" means. Every figure below takes this array and nothing
      else, so the period pickers, the charts, the milestones and the export all
      move together when the scope does. */
  const scoped = useMemo(
    () => scopeSpans(spans, effectiveScope),
    [spans, effectiveScope]
  );

  const buckets = useMemo(
    () => (now === null ? null : bucketByDay(scoped, now)),
    [scoped, now]
  );

  /* ── The year heatmap's year ───────────────────────────────── */

  /** The years the log reaches and this one — the two bounds the heatmap's
      year stepper walks between. Read off the same buckets as the grid, so a
      scope change moves the bounds with it. */
  const heatYearBounds = useMemo(() => {
    if (buckets === null || now === null) return null;
    const current = new Date(now).getFullYear();
    let first = current;
    for (const day of buckets.keys()) {
      const year = new Date(day).getFullYear();
      if (year < first) first = year;
    }
    return { first, current };
  }, [buckets, now]);

  /** `null` = the current year. The shown year is clamped against the bounds,
      so a scope change that shrinks the log cannot leave the grid on a year
      it no longer reaches. */
  const [heatYear, setHeatYear] = useState<number | null>(null);
  const heatYearShown =
    heatYearBounds === null
      ? null
      : Math.min(
          Math.max(heatYear ?? heatYearBounds.current, heatYearBounds.first),
          heatYearBounds.current
        );

  /** The year's total, worn as the card's hint — the figure the colours are
      fractions of. */
  const heatYearTotal = useMemo(() => {
    if (buckets === null || heatYearShown === null) return 0;
    let sum = 0;
    for (const [day, bucket] of buckets) {
      if (new Date(day).getFullYear() === heatYearShown) sum += bucket.useful;
    }
    return sum;
  }, [buckets, heatYearShown]);

  /** Everything that does not depend on the period selector. */
  const figures = useMemo(() => {
    if (now === null || buckets === null) return null;
    const today = startOfDay(now);
    // The last fourteen days, one bar a day — the finest grain the trend reads,
    // for the stretches of history that a week smoothes away.
    const days: { from: number; to: number; useful: number }[] = [];
    for (let back = 13; back >= 0; back--) {
      const from = shiftDays(today, -back);
      days.push({
        from,
        to: shiftDays(from, 1),
        useful: buckets.get(from)?.useful ?? 0,
      });
    }
    return {
      today,
      hours: hourTotals(scoped, now),
      heat: heatmap(scoped, now),
      best: bestStretch(scoped, now),
      topDay: bestDay(buckets),
      days,
      weeks: weekBars(buckets, now, 8),
      months: monthBars(buckets, now, 12),
    };
  }, [scoped, buckets, now]);

  /** The day the stretch list is on — today until another one is picked. */
  const view = day ?? figures?.today ?? null;

  /** The stretches that count towards that day, in order, each already cut down
      to the day it is listed under. A session that ran over midnight is a row on
      both days — `11:00 pm → midnight` on the first, `12:00 am → 2:00 am` on the
      second — so the rows of a day add up to exactly the total in the card's own
      header.

      Walked over the *unscoped* log on purpose: `index` is the stretch's place
      in the log, which is what an edit or a deletion travels by, and filtering
      first would renumber everything behind the removed rows. The scope is
      applied by testing each span as it goes by instead. */
  const rows = useMemo(() => {
    if (now === null || view === null) return [];
    const [from, to] = dayBounds(view);
    const out: Row[] = [];

    spans.forEach((span, index) => {
      if (!inScope(span, effectiveScope)) return;
      if (!countsOn(span, from, to, now)) return;
      const real = cappedEnd(span, now);
      const start = Math.max(span.start, from);
      const end = Math.min(real, to);
      out.push({
        index,
        dayStart: from,
        start,
        end,
        dayEnd: to,
        spanStart: span.start,
        // Which ends of this row are the day's edge rather than the stretch's.
        fromEarlier: start > span.start,
        intoLater: end < real,
      });
    });

    return out;
  }, [spans, now, view, effectiveScope]);

  /** The oldest day the log reaches back to, which is as far back as the
      stepper offers to go: before it there is nothing to look at. */
  const earliest = useMemo(() => {
    if (buckets === null) return null;
    let first: number | null = null;
    for (const key of buckets.keys()) {
      if (first === null || key < first) first = key;
    }
    return first;
  }, [buckets]);

  const averages = useMemo(() => {
    if (now === null || buckets === null) return null;
    return averageOver(periodDays(scoped, period, now), buckets);
  }, [scoped, buckets, period, now]);

  /** The period in progress against the same run of days one week (or month)
      earlier: comparing a half-finished week against a whole one would read as a
      collapse rather than as a week. The day window reads the last fourteen
      days against the fourteen before them — the same shift the day chart
      draws, so caption and bars never disagree. */
  const compare = useMemo(() => {
    if (now === null || buckets === null) return null;
    const today = startOfDay(now);

    // On the day grain the caption compares today with yesterday — the only
    // "previous period" a day has that says anything.
    const now0 = totalOver(daysBetween(today, today), buckets);
    const yesterday = totalOver(daysBetween(shiftDays(today, -1), shiftDays(today, -1)), buckets);

    const day = totalOver(daysBetween(shiftDays(today, -13), today), buckets);
    const dayBefore = totalOver(
      daysBetween(shiftDays(today, -27), shiftDays(today, -14)),
      buckets
    );

    const weekFrom = startOfWeek(now);
    const week = totalOver(daysBetween(weekFrom, today), buckets);
    const weekBefore = totalOver(
      daysBetween(shiftDays(weekFrom, -7), shiftDays(today, -7)),
      buckets
    );

    const d = new Date(today);
    const monthFrom = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const elapsed = daysBetween(monthFrom, today).length;
    const beforeFrom = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    const beforeLast = new Date(d.getFullYear(), d.getMonth(), 0).getTime();
    const month = totalOver(daysBetween(monthFrom, today), buckets);
    const monthBefore = totalOver(
      daysBetween(
        beforeFrom,
        Math.min(shiftDays(beforeFrom, elapsed - 1), beforeLast)
      ),
      buckets
    );

    return { today: now0, yesterday, day, dayBefore, week, weekBefore, month, monthBefore };
  }, [buckets, now]);

  /** The days' time, broken down by the list it went to. Read over the whole of
      the scoped history rather than over the averages' period, so the card
      answers "what has this gone on, all told" — the one question the period
      pickers are not already asking. */
  const listTotals = useMemo(() => {
    if (now === null || buckets === null) return [];
    return totalsByList(scoped, daysAscending(buckets), now);
  }, [scoped, buckets, now]);

  const fullestList = Math.max(...listTotals.map((total) => total.useful), 1);

  /** The todos cut down to the picker's list, the way the log is — the task
      figures follow the scope like every other reading on this page. A todo
      always wears a list, so "unassigned" can only catch tasks whose list was
      deleted out from under them; on "all" nothing is filtered. */
  const scopedTodos = useMemo(() => {
    if (effectiveScope === SCOPE_ALL) return todos;
    return todos.filter((todo) =>
      effectiveScope === SCOPE_UNASSIGNED
        ? todo.listId === "" || !lists.some((list) => list.id === todo.listId)
        : todo.listId === effectiveScope
    );
  }, [todos, effectiveScope, lists]);

  /** The task-side figures, over the scoped todo set — the picker decides
      which tasks count, same as it decides which stretches do. The milestone
      board stays on the whole set: a ladder is a lifetime record, not a
      reading of one list. */
  const tasks = useMemo(
    () => (now === null ? null : taskStats(scopedTodos, now)),
    [scopedTodos, now]
  );

  /** Task completions over the very windows the focus comparison reads — the
      count that rides beside the focus delta in the trend captions. Same
      halves-finished rule as the time side: a running week is matched against
      the same run of days one week earlier, the last fourteen days against the
      fourteen before them. */
  const taskCompare = useMemo(() => {
    if (now === null || tasks === null) return null;
    const today = startOfDay(now);
    // Inclusive of both ends — a day is in the window if its midnight is.
    const sum = (from: number, to: number) => {
      let total = 0;
      for (const { day, count } of tasks.daily) {
        if (day >= from && day <= to) total += count;
      }
      return total;
    };

    const now0 = sum(today, today);
    const yesterday = sum(shiftDays(today, -1), shiftDays(today, -1));

    const day = sum(shiftDays(today, -13), today);
    const dayBefore = sum(shiftDays(today, -27), shiftDays(today, -14));

    const weekFrom = startOfWeek(now);
    const week = sum(weekFrom, today);
    const weekBefore = sum(shiftDays(weekFrom, -7), shiftDays(today, -7));

    const d = new Date(today);
    const monthFrom = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const elapsed = daysBetween(monthFrom, today).length;
    const beforeFrom = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    const beforeLast = new Date(d.getFullYear(), d.getMonth(), 0).getTime();
    const month = sum(monthFrom, today);
    const monthBefore = sum(
      beforeFrom,
      Math.min(shiftDays(beforeFrom, elapsed - 1), beforeLast)
    );

    return { today: now0, yesterday, day, dayBefore, week, weekBefore, month, monthBefore };
  }, [tasks, now]);

  const taskRows = useMemo(
    () => taskListBreakdown(scopedTodos, lists),
    [scopedTodos, lists]
  );

  /** Where the logged focus time went, filed against unfiled — read over the
      scoped log, so the card follows the picker like every other card. */
  const split = useMemo(
    () => (now === null ? null : usefulSplit(scoped, now)),
    [scoped, now]
  );

  /** The milestones, grouped as they are shown, with the tally behind the
      card's corner: how many are earned out of how many there are. */
  const focusBoard = useMemo(
    () =>
      now === null || buckets === null
        ? []
        : milestones(scoped, buckets, now, language),
    [scoped, buckets, now, language]
  );
  const boardItems = focusBoard.flatMap((group) => group.items);
  const boardEarned = boardItems.filter((item) => item.reached).length;

  /** The name a list wears now, or `null` for the unassigned bucket — which the
      export and the sheet both print as "unassigned" rather than as a blank. */
  const nameOf = useCallback(
    (listId: string | null): string | null =>
      listId === null
        ? null
        : (lists.find((list) => list.id === listId)?.name ?? null),
    [lists]
  );

  const displayName = useCallback(
    (listId: string | null): string =>
      nameOf(listId) ?? t("focus.unassigned"),
    [nameOf, t]
  );

  /** The CSS colour of a list, or the deep grey of "no list at all" for the
      unassigned bucket and for a list that has been deleted since. */
  const colorOf = useCallback(
    (listId: string | null): string => {
      if (listId === null) return "var(--focus-unassigned)";
      const list = lists.find((entry) => entry.id === listId);
      return list ? paletteVar(list.color) : "var(--focus-unassigned)";
    },
    [lists]
  );

  /** `+3 小时 10 分 (26%)` — how a window sits against the one before it. */
  const delta = useCallback(
    (current: number, previous: number): string => {
      const diff = current - previous;
      if (diff === 0) return t("focus.delta.none");
      const sign = diff > 0 ? "+" : "−";
      const percent =
        previous > 0
          ? ` (${sign}${Math.round((Math.abs(diff) / previous) * 100)}%)`
          : "";
      return `${sign}${duration(Math.abs(diff), language)}${percent}`;
    },
    [t, language]
  );

  /** Settles the end of the stretch a row stands for. The typed time is read on
      the day the row belongs to — that day's midnight is the anchor — so the
      earlier half of a session that ran over midnight can be ended before
      midnight: a stretch running `11:00 pm → 2:00 am`, ended at `11:45 pm` on the
      first day, becomes `11:00 pm → 11:45 pm` there, while the tail goes on
      holding `12:00 am → 2:00 am` on the second. That is why this edit splits
      the record instead of moving its end: one stretch spread over two days has
      only the one end to move, and the two halves have to end up as two
      stretches to each keep a time of their own. */
  const onEditEnd = (row: Row, value: string) => {
    if (now === null) return;
    const { index, spanStart } = row;

    const refuse = (message: string) => {
      refusals.current += 1;
      setRefused({ index, message, nonce: refusals.current });
    };

    const [hours, minutes] = value.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      refuse(t("focus.log.refuse.notTime"));
      return;
    }

    const d = new Date(row.dayStart);
    const end = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      hours,
      minutes
    ).getTime();

    // The rules the log keeps everywhere else, enforced here as well so a hand
    // edit cannot talk it into something the switch itself would have refused:
    // after the start and at least the reader's own floor long, nothing in the
    // future, and nothing that runs into the stretch behind it. How long it may
    // run is not one of them — the cap bounds what a forgotten switch can
    // write, not what a correction may say.
    if (end < spanStart) {
      refuse(t("focus.log.refuse.beforeStart"));
      return;
    }
    // The stretch's own floor — the one it was closed under — not whatever
    // the setting says today, so an edit to an old stretch answers to the
    // rule it was recorded under.
    if (end - spanStart < (spans[index]?.minMs ?? spanLimits().minMs)) {
      refuse(t("focus.log.refuse.tooShort"));
      return;
    }
    if (end > now) {
      refuse(t("focus.log.refuse.future"));
      return;
    }
    const next = spans[index + 1]?.start;
    if (next !== undefined && end > next) {
      refuse(t("focus.log.refuse.overlap"));
      return;
    }

    setRefused(null);
    // Ending the half that ran on into the next day leaves the rest of that
    // session behind on the next day's list, so the record is cut in two at
    // midnight rather than shortened.
    if (row.intoLater) onSplit(index, end);
    else onReschedule(index, end);
  };

  /** Move the list to another day. Landing back on today clears the pick rather
      than pinning today's midnight, so today goes on meaning today. */
  const goToDay = (next: number | null) => {
    setConfirming(null);
    setRefused(null);
    setDay(next === null || next === figures?.today ? null : next);
  };

  /** One day either way, stopped at both ends of the log: nothing lies beyond
      the oldest stretch, and nothing lies past today. */
  const stepDay = (deltaDays: number) => {
    if (view === null || figures === null) return;
    const next = shiftDays(view, deltaDays);
    if (next > figures.today) return;
    if (earliest !== null && next < earliest) return;
    goToDay(next);
  };

  const hours = figures?.hours ?? [];
  const peak = peakHour(hours);
  // The strongest hour is an hour-of-day read across every week, so the day it
  // names comes off the heat grid: the weekday whose cell in that hour column
  // holds the most. Ties share the line.
  const peakDays =
    peak === null || figures === null
      ? []
      : (() => {
          const column = figures.heat.map((row) => row[peak]);
          const best = Math.max(...column);
          if (best <= 0) return [];
          return column.flatMap((ms, index) => (ms === best ? [index] : []));
        })();
  const peakDayNames = weekdayNames(language)
    .filter((_, index) => peakDays.includes(index))
    .join(language === "zh" ? "、" : ", ");
  const dayUseful =
    buckets === null || view === null ? 0 : (buckets.get(view)?.useful ?? 0);
  const onToday = figures !== null && view !== null && view === figures.today;
  const chartBars =
    figures === null
      ? []
      : chart === "week"
        ? figures.weeks
        : chart === "month"
          ? figures.months
          : figures.days;
  const chartValue =
    (chart === "day"
      ? compare?.today
      : chart === "week"
        ? compare?.week
        : compare?.month) ?? 0;
  const chartBefore =
    (chart === "day"
      ? compare?.yesterday
      : chart === "week"
        ? compare?.weekBefore
        : compare?.monthBefore) ?? 0;
  const chartDoneValue =
    (chart === "day"
      ? taskCompare?.today
      : chart === "week"
        ? taskCompare?.week
        : taskCompare?.month) ?? 0;
  const chartDoneBefore =
    (chart === "day"
      ? taskCompare?.yesterday
      : chart === "week"
        ? taskCompare?.weekBefore
        : taskCompare?.monthBefore) ?? 0;

  /** What the picker's grain calls the stretch of days in progress — "今日" on
      days, "本周" on weeks. The caption that measures against the one before
      uses a shorter word for the same span, so "上一个14天" reads as speech
      rather than as two labels glued together. */
  const rangeLabel =
    chart === "day"
      ? t("focus.log.today")
      : chart === "week"
        ? t("focus.log.thisWeek")
        : t("focus.log.thisMonth");
  const rangeWord =
    chart === "day"
      ? t("focus.log.range.day")
      : chart === "week"
        ? t("focus.log.thisWeek")
        : t("focus.log.thisMonth");
  const trendCaption =
    compare === null
      ? ""
      : chart === "day"
        ? chartValue === 0 && chartBefore === 0
          ? t("focus.log.trend.day.none")
          : t("focus.log.trend.day", {
              delta: delta(chartValue, chartBefore),
            })
        : chartValue === 0 && chartBefore === 0
          ? t("focus.log.trend.none", { range: rangeWord })
          : t("focus.log.trend.compare", {
              range: rangeWord,
              delta: delta(chartValue, chartBefore),
            });

  /** The same story for the completions: the count now against the count then,
      in its own sentence under the time's. */
  const taskDiff = chartDoneValue - chartDoneBefore;
  const taskTrendCaption =
    taskCompare === null
      ? ""
      : chart === "day"
        ? taskDiff === 0
          ? t("focus.log.trend.tasks.day.same")
          : t("focus.log.trend.tasks.day", {
              delta: `${taskDiff > 0 ? "+" : "−"}${Math.abs(taskDiff)}`,
            })
        : taskDiff === 0
          ? t("focus.log.trend.tasks.same", { range: rangeWord })
          : t("focus.log.trend.tasks.compare", {
              range: rangeWord,
              delta: `${taskDiff > 0 ? "+" : "−"}${Math.abs(taskDiff)}`,
            });

  /** `9/17` — the tick a day wears under the day chart. Built on the locale's
      own numeric date, so the shape follows the language. */
  const dayTick = useCallback(
    (day: number) =>
      new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" })
        .format(new Date(day)),
    [locale]
  );

  /** Completions summed over the same bars the focus trend draws — week or
      month, whichever the picker says — so the two lines sit on identical
      spans and can be read against each other honestly. A day with no
      completions simply adds nothing, and the running bar counts what today
      has already earned. */
  const chartDone = useMemo(() => {
    if (tasks === null) return [];
    return chartBars.map((bar) => {
      let sum = 0;
      for (const { day, count } of tasks.daily) {
        if (day >= bar.from && day < bar.to) sum += count;
      }
      return sum;
    });
  }, [chartBars, tasks]);

  const scopeOptions: {
    key: Scope;
    label: string;
    /** The dot's colour, already resolved to CSS. Absent on "all". */
    color?: string;
  }[] = [
    { key: SCOPE_ALL, label: t("focus.log.scopeAll") },
    ...lists.map((list) => ({
      key: list.id as Scope,
      label: list.name,
      color: paletteVar(list.color),
    })),
  ];

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      <h1 className="sr-only">{t("focus.log.title")}</h1>

      {/* The whole page scrolls — the cards travel to its top edge. The figures
          stop widening long before the page does — a table with the times at one
          edge and the buttons at the other is harder to read than a narrower
          one — so the column is capped like the sheet's was.

          `relative` is load-bearing: the cards hold absolutely-positioned
          `sr-only` labels, and an absolute box positions against the nearest
          positioned ancestor. Without one here they resolve against the
          document, escape this scroller's clip entirely, and stretch the page
          itself — a second scrollbar at the window's edge, one scroll level
          too far out. (Radix's ScrollArea.Root carries `relative` for exactly
          this reason, which is why the task list never showed the bug.) */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-5 pb-12 pt-6 sm:px-6 lg:px-8">
                {/* Two columns once there is room for two; one before that, in
                    the order of how often the thing is looked at. The breakdown
                    leads, in the corner the eye lands on first: it is the one
                    card that says where the hours went, and it carries the
                    scope picker that rescales every other card on the sheet. */}
                <div className="grid items-start gap-5 xl:grid-cols-12">
                  {/* Each column is its own stack so cards flow tightly: in
                      a shared row grid the row is held open by the tallest
                      card in it, stranding whitespace under short ones. */}
                  <div className="flex flex-col gap-5 xl:col-span-5">
                  <Card
                    title={t("focus.log.byList")}
                    action={
                      <Select
                        value={effectiveScope}
                        onValueChange={(next) => {
                          setConfirming(null);
                          setRefused(null);
                          setScope(next);
                        }}
                      >
                        <SelectTrigger
                          aria-label={t("focus.log.scope")}
                          className="h-8 w-auto min-w-[9rem] gap-1.5 rounded-md px-2.5 py-0 text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {scopeOptions.map((option) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.color !== undefined && (
                                <span
                                  aria-hidden="true"
                                  className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: option.color }}
                                />
                              )}
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  >
                    {listTotals.length === 0 ? (
                      <p className="text-sm text-foreground-muted">
                        {t("focus.log.byList.empty")}
                      </p>
                    ) : (
                      <>
                        {/* The time half gets its own caption, mirroring the
                            task half's below, so the card reads as two labeled
                            sections rather than one bare list. */}
                        <p className="mb-3 text-xs font-medium tracking-wide text-foreground-muted">
                          {t("focus.log.byList.time")}
                        </p>
                      {/* Filed against unfiled, read before the bars: how much
                          of the log the bars below actually account for. */}
                      <div className="grid grid-cols-3 gap-3">
                        <Metric
                          label={t("stats.split.filed")}
                          value={duration(split?.filed ?? 0, language)}
                        />
                        <Metric
                          label={t("stats.split.unfiled")}
                          value={duration(split?.unfiled ?? 0, language)}
                        />
                        <Metric
                          label={t("stats.split.share")}
                          value={`${Math.round((split?.ratio ?? 0) * 100)}%`}
                        />
                      </div>
                      <p className="mb-3 mt-5 text-xs font-medium tracking-wide text-foreground-muted">
                        {t("focus.log.byList.timeByList")}
                      </p>
                      <ul className="flex flex-col gap-3">
                        {listTotals.map((total) => (
                          <li key={total.listId ?? SCOPE_UNASSIGNED}>
                            <div className="flex items-baseline justify-between gap-4 text-sm">
                              <span className="truncate text-foreground">
                                {displayName(total.listId)}
                              </span>
                              <span className="shrink-0 tabular-nums text-foreground-muted">
                                {duration(total.useful, language)}
                              </span>
                            </div>
                            {/* One bar a list, measured against the fullest
                                one — the same reading the heat grid uses, so a
                                history a few days long still shows a shape
                                rather than a row of near-invisible slivers.
                                Each bar wears its list's own colour; the
                                unassigned bucket keeps the theme green. */}
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${Math.max(
                                    2,
                                    (total.useful / fullestList) * 100
                                  )}%`,
                                  backgroundColor: colorOf(total.listId),
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                      </>
                    )}

                    {/* The task side of the same question, filed under the
                        same picker: where the hours went above, what came out
                        of them below. A hairline divides the two so the card
                        reads as one list of readings rather than two cards
                        glued together. The figures follow the picker like the
                        durations do — pick a list, and both halves speak of
                        that list alone. */}
                    <div className="mt-6 border-t border-border pt-5">
                      <p className="text-xs font-medium tracking-wide text-foreground-muted">
                        {t("stats.tasks.title")}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <Metric
                          label={t("stats.tasks.today")}
                          value={t("stats.tasks.count", {
                            n: tasks?.todayDone ?? 0,
                          })}
                        />
                        <Metric
                          label={t("stats.tasks.week")}
                          value={t("stats.tasks.count", {
                            n: tasks?.weekDone ?? 0,
                          })}
                        />
                        <Metric
                          label={t("stats.tasks.total")}
                          value={t("stats.tasks.count", {
                            n: tasks?.totalDone ?? 0,
                          })}
                        />
                      </div>

                      {/* Per-list completion, in the sidebar's order, each bar
                          wearing its list's colour — the same shape the
                          duration bars above keep, so the two read as one
                          family. */}
                      {taskRows.length > 0 && (
                        <>
                          <p className="mb-3 mt-5 text-xs font-medium tracking-wide text-foreground-muted">
                            {t("stats.tasks.byList")}
                          </p>
                          <ul className="flex flex-col gap-3">
                            {taskRows.map((row) => (
                              <li key={row.listId}>
                                <div className="flex items-baseline justify-between gap-4 text-sm">
                                  <span className="truncate text-foreground">
                                    {displayName(row.listId)}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-foreground-muted">
                                    {t("stats.tasks.ofCount", {
                                      done: row.done,
                                      total: row.total,
                                    })}
                                    {" · "}
                                    {t("stats.tasks.pct", {
                                      pct: Math.round(row.rate * 100),
                                    })}
                                  </span>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <span
                                    className="block h-full rounded-full"
                                    style={{
                                      width: `${Math.max(2, row.rate * 100)}%`,
                                      backgroundColor: colorOf(row.listId),
                                    }}
                                  />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </Card>

                  <Card
                    title={t("focus.log.averages")}
                    hint={
                      averages === null
                        ? undefined
                        : t("focus.log.days", { n: averages.days })
                    }
                    action={
                      <Segmented
                        value={period}
                        options={PERIODS.map((option) => ({
                          key: option.key,
                          label: t(option.labelKey),
                        }))}
                        onChange={setPeriod}
                        label={t("focus.log.period")}
                      />
                    }
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Metric
                        label={t("focus.log.perDay")}
                        value={duration(averages?.perDay ?? 0, language)}
                      />
                      <Metric
                        label={t("focus.log.share")}
                        value={`${Math.round((averages?.share ?? 0) * 100)}%`}
                      />
                      <Metric
                        label={t("focus.log.switches")}
                        value={(averages?.switches ?? 0).toFixed(1)}
                      />
                      <Metric
                        label={t("focus.log.perStretch")}
                        value={duration(averages?.stretch ?? 0, language)}
                      />
                    </div>
                  </Card>

                  {/* Personal best under averages: the figure it reports is
                      read off the stretch list to its right, and the two
                      belong in one line of sight. */}
                  <Card title={t("focus.log.best")}>
                    {figures === null || figures.best === null ? (
                      <p className="text-sm text-foreground-muted">
                        {t("focus.log.bestNone")}
                      </p>
                    ) : (
                      <dl className="text-sm">
                        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                          <dt className="text-foreground-muted">
                            {t("focus.log.bestStretch")}
                          </dt>
                          <dd className="text-right text-foreground">
                            <span className="font-display font-semibold tabular-nums">
                              {duration(figures.best.ms, language)}
                            </span>
                            <span className="text-foreground-faint">
                              {" "}
                              · {stampDate(figures.best.start, language)}
                            </span>
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 pt-3">
                          <dt className="text-foreground-muted">
                            {t("focus.log.bestDay")}
                          </dt>
                          <dd className="text-right text-foreground">
                            {figures.topDay === null ? (
                              <span className="text-foreground-faint">—</span>
                            ) : (
                              <>
                                <span className="font-display font-semibold tabular-nums">
                                  {/* The day's useful time against the full
                                      24 hours, then a dot before the span. */}
                                  {Math.round(
                                    (figures.topDay.useful /
                                      (24 * 60 * 60 * 1000)) *
                                      100
                                  )}
                                  %{" · "}
                                  {duration(figures.topDay.useful, language)}
                                </span>
                                <span className="text-foreground-faint">
                                  {" "}
                                  · {stampDate(figures.topDay.day, language)}
                                </span>
                              </>
                            )}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 pt-3">
                          <dt className="text-foreground-muted">
                            {t("focus.log.bestDayTasks")}
                          </dt>
                          <dd className="text-right text-foreground">
                            <span className="font-display font-semibold tabular-nums">
                              {t("stats.tasks.count", {
                                n: tasks?.bestDayCount ?? 0,
                              })}
                            </span>
                            {tasks?.bestDay !== null &&
                              tasks?.bestDay !== undefined && (
                                <span className="text-foreground-faint">
                                  {" "}
                                  · {stampDate(tasks.bestDay, language)}
                                </span>
                              )}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </Card>
                  </div>

                  <div className="flex flex-col gap-5 xl:col-span-7">
                  <Card
                    title={t("focus.log.stretches")}
                    hint={dayUseful > 0 ? duration(dayUseful, language) : undefined}
                    // The day's own pages: a chevron either side for stepping
                    // through the log, and the date itself as a field so a day
                    // months back is one pick rather than thirty taps.
                    action={
                      view === null ? undefined : (
                        <div className="flex items-center gap-1.5">
                          {/* 补记 — a stretch the switch never saw, written by
                              hand into the day being viewed. Sits with the day
                              controls because it writes into that day. */}
                          <button
                            type="button"
                            onClick={() => setAddOpen(true)}
                            aria-label={t("focusLog.add")}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-base ease-out hover:bg-hover-bg hover:text-foreground"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => stepDay(-1)}
                            disabled={earliest === null || view <= earliest}
                            aria-label={t("focus.log.prevDay")}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-base ease-out hover:bg-hover-bg hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <DatePicker
                            mode="single"
                            value={new Date(view)}
                            minDate={
                              earliest === null ? undefined : new Date(earliest)
                            }
                            maxDate={new Date(figures?.today ?? view)}
                            // The chevrons already step a day at a time; the one
                            // shortcut worth its column is the way home.
                            shortcuts={[
                              {
                                label: t("date.today"),
                                getValue: () => new Date(figures?.today ?? view),
                              },
                            ]}
                            onChange={(next) => {
                              if (next instanceof Date) goToDay(next.getTime());
                            }}
                            intlLocale={locale}
                            aria-label={t("focus.log.day")}
                            size="sm"
                            className="h-8 w-[9rem] shrink-0 rounded-md text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => stepDay(1)}
                            disabled={figures === null || view >= figures.today}
                            aria-label={t("focus.log.nextDay")}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-base ease-out hover:bg-hover-bg hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      )
                    }
                  >
                    {rows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
                        <Timer
                          className="h-7 w-7 text-foreground-faint"
                          aria-hidden="true"
                        />
                        <p className="text-sm text-foreground-muted">
                          {onToday
                            ? t("focus.log.emptyToday")
                            : t("focus.log.emptyDay")}
                        </p>
                      </div>
                    ) : (
                      // Scrolls sideways rather than wrapping when the window is
                      // too narrow for a row: a time, an arrow and two buttons
                      // read as a line, and stacked they stop reading as one.
                      <div className="overflow-x-auto">
                        <ul>
                          {rows.map((row) => {
                            const {
                              index,
                              dayStart,
                              start,
                              end,
                              dayEnd,
                              spanStart,
                            } = row;
                            const span = spans[index];
                            // A row is a fragment when one of its edges is the
                            // day's rather than the stretch's. Only an edge that
                            // is the stretch's own can be running, or carry a
                            // field to edit it with.
                            const fragment = row.fromEarlier || row.intoLater;
                            const running = span.end === null && !row.intoLater;
                            const closed = span.end ?? now ?? span.start;
                            // Under a minute the row speaks in seconds: a
                            // 40-second run rounded up to "1 minute" would
                            // print a minute that never happened.
                            const elapsed = durationWithSeconds(
                              end - start,
                              language
                            );
                            const refusedHere =
                              refused?.index === index ? refused : null;
                            const asking = confirming === index;

                            return (
                              // Hairline-separated rows, the way a table reads —
                              // the whole row answers to the pointer.
                              <li
                                key={span.start}
                                className="border-b border-border px-3 py-2.5 transition-colors duration-base ease-out last:border-b-0 hover:bg-hover-bg"
                              >
                                <div className="flex items-center gap-3 text-sm">
                                  <span
                                    className={cn(
                                      "shrink-0 tabular-nums",
                                      // An edge that is only the day's boundary
                                      // is muted, so the times the stretch really
                                      // has are the ones that stand out.
                                      row.fromEarlier
                                        ? "text-foreground-muted"
                                        : "text-foreground"
                                    )}
                                  >
                                    {clockLabel(start, language)}
                                  </span>
                                  <Arrow fragment={fragment} />

                                  {running ? (
                                    // The one place the log says a stretch is
                                    // still open: a badge rather than a field,
                                    // because there is nothing to edit yet. It
                                    // carries its own tally, so the row can be
                                    // read without looking to the right edge —
                                    // and its own clock, so the tally walks
                                    // second by second.
                                    <RunningBadge
                                      start={span.start}
                                      language={language}
                                      label={t("focus.log.running")}
                                    />
                                  ) : row.intoLater && span.end === null ? (
                                    // A stretch still open has no end to move, so
                                    // the day it ran on into stays read-only here:
                                    // the box says where the day stopped and
                                    // nothing more. Switching back is what closes
                                    // it — then there is an end to correct.
                                    <span className="inline-flex h-9 w-[7.5rem] shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-center tabular-nums text-foreground-muted">
                                      {endClockLabel(end, dayEnd, language)}
                                    </span>
                                  ) : (
                                    // The end, as a field on this row's own day.
                                    // On the day a stretch ran on into, the end
                                    // it really has is not this day's to hold — a
                                    // time field cannot spell midnight — so the
                                    // field is left empty and the day's edge is
                                    // laid over it for as long as the pointer is
                                    // only passing through.
                                    <TimePicker
                                      // The key carries the day as well as the
                                      // refusal count. The same stretch is a
                                      // row on the day it began and on the day
                                      // it ran on into, and without the day in
                                      // the key React reuses the one field for
                                      // both: the second day's row has an end of
                                      // its own in there, and a field that has
                                      // been picked into keeps it — so the day's
                                      // edge on the first day came up wearing
                                      // the other day's end. A key per day keeps
                                      // this side blank until it is really picked
                                      // into.
                                      key={`end-${index}-${dayStart}-${
                                        refusedHere?.nonce ?? 0
                                      }`}
                                      defaultValue={
                                        row.intoLater ? "" : clockValue(closed)
                                      }
                                      onChange={(next) => onEditEnd(row, next)}
                                      aria-label={t("focus.log.endAria", {
                                        start: clockLabel(spanStart, language),
                                        date: stampDate(dayStart, language),
                                      })}
                                      intlLocale={locale}
                                      size="sm"
                                      className={cn(
                                        "h-9 w-[7.5rem] shrink-0 rounded-md text-xs",
                                        // Dashed, because it is the day that
                                        // stops here and not the stretch.
                                        row.intoLater &&
                                          "border-dashed border-border-strong"
                                      )}
                                      // A stretch running into the next day has
                                      // no end of its own on this day's wheel —
                                      // the placeholder is the day's edge, and
                                      // picking a time is what closes it.
                                      placeholder={
                                        row.intoLater
                                          ? endClockLabel(end, dayEnd, language)
                                          : undefined
                                      }
                                    />
                                  )}

                                  {/* The list this stretch is filed under — on
                                      every row, and open to change on every
                                      row. A stretch that finished last week is
                                      no less the reader's to file than the one
                                      running now, so nothing here is gated on
                                      the switch: the answer goes straight into
                                      the log the moment it is picked. */}
                                  <Select
                                    value={span.listId ?? SCOPE_UNASSIGNED}
                                    onValueChange={(next) =>
                                      onSetList(
                                        index,
                                        next === SCOPE_UNASSIGNED ? null : next
                                      )
                                    }
                                  >
                                    <SelectTrigger
                                      aria-label={t("focus.log.listAria", {
                                        start: clockLabel(spanStart, language),
                                      })}
                                      className={cn(
                                        "h-9 w-[8.5rem] shrink-0 gap-1.5 rounded-md px-2 text-xs",
                                        // Unassigned is an answer, but a
                                        // muted one: it is the state a row is
                                        // in until someone says otherwise.
                                        span.listId === null &&
                                          "text-foreground-muted"
                                      )}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={SCOPE_UNASSIGNED}>
                                        <span
                                          aria-hidden="true"
                                          className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-focus-unassigned"
                                        />
                                        {t("focus.unassigned")}
                                      </SelectItem>
                                      {lists.map((list) => (
                                        <SelectItem
                                          key={list.id}
                                          value={list.id}
                                        >
                                          <span
                                            aria-hidden="true"
                                            className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                                            style={{
                                              backgroundColor:
                                                paletteVar(list.color),
                                            }}
                                          />
                                          {list.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* A running stretch already carries its tally
                                      in the badge, so it is not said twice. */}
                                  {running ? null : (
                                    <span className="ml-auto shrink-0 tabular-nums text-foreground-muted">
                                      {elapsed}
                                    </span>
                                  )}

                                  {running ? null : asking ? (
                                    <span className="flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onDelete(index);
                                          setConfirming(null);
                                        }}
                                        className="rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium leading-none text-foreground transition-colors duration-base ease-out hover:bg-hover-bg-strong"
                                      >
                                        {t("focus.log.delete")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirming(null)}
                                        className="rounded-md px-2.5 py-1.5 text-xs leading-none text-foreground-muted transition-colors duration-base ease-out hover:text-foreground"
                                      >
                                        {t("focus.log.keep")}
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirming(index)}
                                      aria-label={t("focus.log.deleteAria", {
                                        start: clockLabel(spanStart, language),
                                      })}
                                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-faint transition-colors duration-base ease-out hover:bg-hover-bg-strong hover:text-foreground"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      >
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                      </svg>
                                    </button>
                                  )}
                                </div>

                                {refusedHere ? (
                                  <p className="mt-2 rounded-md bg-muted px-3 py-1.5 text-xs leading-snug text-foreground">
                                    {refusedHere.message}
                                  </p>
                                ) : null}

                                {fragment ? (
                                  // A dashed shaft says "this row is part of
                                  // something longer" to the eye and nothing at
                                  // all to a screen reader, so the missing side
                                  // is spelled out for it.
                                  <span className="sr-only">
                                    {row.fromEarlier
                                      ? t("focus.log.fragment.before")
                                      : t("focus.log.fragment.after")}
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {/* The floor under the whole list: a stretch shorter than the
                        minimum is dropped rather than drawn, and a reader who
                        switched for two minutes and then found no row for it
                        deserves to know why. The ceiling is in the same line: a
                        useful stretch left running is credited at most the cap,
                        so nobody loses a night to a forgotten switch. */}
                    <p className="mt-5 text-sm leading-snug text-foreground-muted">
                      {t("focus.log.foot", {
                        min: spanLimits().minMs / 60_000,
                        max: spanLimits().maxMs / 3_600_000,
                      })}
                    </p>
                  </Card>

                    <Card
                      title={t("focus.log.when")}
                      hint={t("focus.log.allHistory")}
                    >
                      <p className="text-sm leading-snug text-foreground-muted">
                        {peak === null
                          ? t("focus.log.when.none")
                          : t("focus.log.when.peak", {
                              days: peakDayNames,
                              from: hourName(peak, language),
                              to: hourName(peak + 1, language),
                              value: duration(hours[peak], language),
                            })}
                      </p>
                      <div className="mt-5">
                        <Heat
                          grid={figures?.heat ?? []}
                          lang={language}
                          read={(ms) => duration(ms, language)}
                        />
                      </div>
                    </Card>

                  {/* The right column's last card; keeping the span explicit
                      is cheaper than re-deriving the layout whenever a card
                      moves. */}
                  <Card
                    title={t("focus.log.trend")}
                    hint={t(
                      chart === "day"
                        ? "focus.log.days14"
                        : chart === "week"
                          ? "focus.log.weeks"
                          : "focus.log.months"
                    )}
                    action={
                      <Segmented
                        value={chart}
                        options={[
                          { key: "day" as const, label: t("focus.log.chart.day") },
                          {
                            key: "week" as const,
                            label: t("focus.log.chart.week"),
                          },
                          {
                            key: "month" as const,
                            label: t("focus.log.chart.month"),
                          },
                        ]}
                        onChange={setChart}
                        label={t("focus.log.chart.range")}
                      />
                    }
                  >
                    <p className="text-sm leading-snug text-foreground-muted">
                      {rangeLabel}
                      {": "}
                      <span className="font-medium tabular-nums text-foreground">
                        {duration(chartValue, language)}
                      </span>
                      <span className="text-foreground-faint">
                        {" · "}
                        <span className="font-medium tabular-nums text-foreground">
                          {t("stats.tasks.doneCount", { n: chartDoneValue })}
                        </span>
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-snug text-foreground-muted">
                      {trendCaption}
                    </p>
                    <p className="mt-1 text-sm leading-snug text-foreground-muted">
                      {taskTrendCaption}
                    </p>
                    {/* Two lines on the same bars — focus time over tasks
                        done, week by week or month by month. They never share
                        an axis (hours and counts do not), so each keeps its
                        own chart and its own label; the shared picker and the
                        shared spans are what make the pair readable as one. */}
                    <div className="mt-5 flex flex-col gap-5">
                      <div>
                        <p className="mb-2 text-xs font-medium tracking-wide text-foreground-muted">
                          {t("stats.compare.focus")}
                        </p>
                        <Line
                          values={chartBars.map((bar) => bar.useful)}
                          titles={chartBars.map(
                            (bar, index) =>
                              // The days the bar stands for, not just where it
                              // starts — and the one still running reads through
                              // today, since its tail has not happened yet.
                              `${dateRange(
                                bar.from,
                                index === chartBars.length - 1 && figures !== null
                                  ? shiftDays(figures.today, 1)
                                  : bar.to,
                                language
                              )} · ${duration(bar.useful, language)}`
                          )}
                          labels={chartBars.map((bar) =>
                            chart === "day"
                              ? dayTick(bar.from)
                              : chart === "week"
                                ? weekName(bar.from, language)
                                : shortMonth(bar.from, language)
                          )}
                          marked={chartBars.length - 1}
                        />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-medium tracking-wide text-foreground-muted">
                          {t("stats.compare.done")}
                        </p>
                        <Line
                          values={chartDone}
                          titles={chartBars.map(
                            (bar, index) =>
                              `${dateRange(
                                bar.from,
                                index === chartBars.length - 1 && figures !== null
                                  ? shiftDays(figures.today, 1)
                                  : bar.to,
                                language
                              )} · ${t("stats.tasks.count", { n: chartDone[index] })}`
                          )}
                          labels={chartBars.map((bar) =>
                            chart === "day"
                              ? dayTick(bar.from)
                              : chart === "week"
                                ? weekName(bar.from, language)
                                : shortMonth(bar.from, language)
                          )}
                          marked={chartBars.length - 1}
                        />
                      </div>
                    </div>
                  </Card>

                  </div>

                  {/* The year at a glance, between the period-bound figures
                      and the milestone board: one cell a day over a whole
                      calendar year, stepped back as far as the log reaches.
                      Read off the same buckets as everything above it, so the
                      scope picker rescales it too. */}
                  <Card
                    className="xl:col-span-12"
                    title={t("focus.log.yearHeat")}
                    hint={
                      heatYearTotal > 0
                        ? duration(heatYearTotal, language)
                        : undefined
                    }
                    action={
                      heatYearBounds !== null && heatYearShown !== null ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={t("focus.log.yearHeat.prevYear")}
                            disabled={heatYearShown <= heatYearBounds.first}
                            onClick={() => setHeatYear(heatYearShown - 1)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-base ease-out hover:bg-hover-bg hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <span className="min-w-16 text-center text-sm font-medium tabular-nums text-foreground">
                            {new Intl.DateTimeFormat(LOCALES[language], {
                              year: "numeric",
                            }).format(new Date(heatYearShown, 0, 1))}
                          </span>
                          <button
                            type="button"
                            aria-label={t("focus.log.yearHeat.nextYear")}
                            disabled={heatYearShown >= heatYearBounds.current}
                            onClick={() => setHeatYear(heatYearShown + 1)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-base ease-out hover:bg-hover-bg hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ) : undefined
                    }
                  >
                    {buckets !== null && now !== null && heatYearShown !== null && (
                      <YearHeat
                        buckets={buckets}
                        today={startOfDay(now)}
                        year={heatYearShown}
                        lang={language}
                        read={(ms) => duration(ms, language)}
                        lessLabel={t("focus.log.yearHeat.less")}
                        moreLabel={t("focus.log.yearHeat.more")}
                      />
                    )}
                  </Card>

                  <Card
                    className="xl:col-span-12"
                    title={t("focus.ms.focusTitle")}
                    hint={t("focus.ms.of", {
                      have: boardEarned,
                      target: boardItems.length,
                    })}
                  >
                    {/* As many cards to a row as the width allows, rather than
                        a fixed count: every card then fills its column instead
                        of sitting in the middle of a wide one with air around
                        it, and the last row is simply the one that ran out of
                        cards to fill it. Two to a row on a phone. */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
                      {focusBoard.map((group) =>
                        group.ladder ? (
                          <MilestoneLadder key={group.group} group={group} />
                        ) : (
                          group.items.map((item) => (
                            <MilestoneTile key={item.id} item={item} />
                          ))
                        )
                      )}
                    </div>
                    {/* What makes a day perfect, said once for the ladder that
                        counts them. Worn on every rung it would be the same line
                        twelve times over, and the count — `720 perfect days` —
                        never says on its own what one of those days had to be. */}
                    <p className="mt-5 text-sm leading-snug text-foreground-muted">
                      {t(PERFECT_DAY_RULE_KEY, { pct: RICH_PCT })}
                    </p>
                  </Card>
                </div>
              </div>
      </div>

      <AddSpanDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        lists={lists}
        onAdd={onAddManual}
      />
    </main>
  );
}
