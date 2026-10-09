"use client";

/**
 * The statistics, as a page of its own — split into the two data domains it
 * reads, because a figure of hours and a figure of checkboxes answer different
 * questions and never mix:
 *
 *  - **专注** reads the focus log the switch writes: an overview row of plain
 *    numbers (today, this week, the streak, the longest session), then the day's
 *    stretches, where the hours went, when in the day they go, the fourteen-day
 *    trend and the year heatmap. The list scope picker lives on this tab and
 *    rescales every card on it — they are all computed from the same `scoped`
 *    array, so nothing downstream has to know the scope changed.
 *  - **任务** reads the todo set: an overview row (done today / this week / all
 *    time, open and overdue), then completion by list, the fourteen-day
 *    completion trend and the personal bests. It carries its own list filter —
 *    the focus picker is a reading of the log, not of the todos, and giving each
 *    domain its own filter is what keeps a pick on one tab from silently
 *    reshaping the other.
 *
 * Within a tab, figures come before charts: the overview row answers "how much"
 * in four numbers a glance can hold, and the cards below answer "when" and
 * "where". A completion is stamped when a checkbox is ticked, a stretch when
 * the switch is flipped — nothing here can disagree with the rail.
 *
 * The CSV export does not live here — it belongs with the other whole-app
 * settings, in the settings page, where "everything the app holds" is a more
 * honest home for it than the foot of a page of charts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Timer } from "lucide-react";
import { AddSpanDialog } from "@/components/focus/add-span-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Card, Heat, Line, Metric, YearHeat } from "@/components/focus/focus-charts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SCOPE_ALL,
  SCOPE_UNASSIGNED,
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
  peakHour,
  scopeSpans,
  shiftDays,
  stampDate,
  startOfDay,
  startOfWeek,
  totalOver,
  totalsByList,
  type FocusSpan,
  type Scope,
} from "@/lib/focus-spans";
import type { AddRefusal } from "@/lib/focus-store";
import { isOverdue } from "@/lib/date";
import { LOCALES, type Language } from "@/lib/messages";
import { useI18n } from "@/lib/i18n";
import {
  taskListBreakdown,
  taskStats,
} from "@/lib/task-stats";
import { spanLimits } from "@/lib/settings";
import type { FirstDayOfWeek } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { paletteVar, type Todo, type TodoList } from "@/lib/types";

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
  /** The whole todo set, done and not — the task tab's cards read it, never
      own it. They follow the task tab's own list filter, which is a pick the
      focus scope knows nothing about. */
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
  /** Which morning a week opens on — the 「本周」 figures, the heat grids'
      row order and the year grid's first column all read it. A prop rather
      than a mirror read, so a flip in the settings re-renders every week-
      shaped figure at once. */
  firstDay: FirstDayOfWeek;
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
  firstDay,
}: FocusStatsProps) {
  const { t, language, locale } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  /** Which domain the page is reading. The two never share a figure, so a
      switch here is a change of subject, not a filter. */
  const [tab, setTab] = useState<"focus" | "tasks">("focus");
  /** The task tab's own list filter — separate from the focus scope on
      purpose: a pick on one tab must not silently reshape the other. */
  const [taskScope, setTaskScope] = useState<string>("all");
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
      follow the list" means. Every figure on the focus tab takes this array
      and nothing else, so the overview, the charts and the day's list all
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

  /** Everything that does not depend on the tab. */
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
      heat: heatmap(scoped, now, firstDay),
      best: bestStretch(scoped, now),
      days,
    };
  }, [scoped, buckets, now, firstDay]);

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

  /** The fourteen days in progress against the fourteen before them — the
      window the trend card draws, so caption and bars never disagree. */
  const compare = useMemo(() => {
    if (now === null || buckets === null) return null;
    const today = startOfDay(now);
    const day = totalOver(daysBetween(shiftDays(today, -13), today), buckets);
    const dayBefore = totalOver(
      daysBetween(shiftDays(today, -27), shiftDays(today, -14)),
      buckets
    );
    const weekFrom = startOfWeek(now, firstDay);
    const week = totalOver(daysBetween(weekFrom, today), buckets);
    return { day, dayBefore, week };
  }, [buckets, now, firstDay]);

  /** Consecutive days with real focus time, ending today — or yesterday, when
      today has not earned its place yet. Walked off the same buckets the
      heatmap reads, so the scope picker moves it too. */
  const focusStreak = useMemo(() => {
    if (buckets === null || now === null) return 0;
    const today = startOfDay(now);
    let cursor =
      (buckets.get(today)?.useful ?? 0) > 0 ? today : shiftDays(today, -1);
    let streak = 0;
    while ((buckets.get(cursor)?.useful ?? 0) > 0) {
      streak += 1;
      cursor = shiftDays(cursor, -1);
    }
    return streak;
  }, [buckets, now]);

  /** Every minute the scoped log holds — the whole-history figure the
      overview row answers "what has this all added up to" with. */
  const totalFocus = useMemo(() => {
    if (buckets === null) return 0;
    let sum = 0;
    for (const bucket of buckets.values()) sum += bucket.useful;
    return sum;
  }, [buckets]);

  /** The longest run of consecutive days with real focus time, anywhere in
      the scoped history — the bar the current streak is measured against.
      Walked off the same buckets, sorted; a run continues only when the next
      active day is the very next one (`shiftDays`, so a DST day still
      compares as one day apart). */
  const bestFocusStreak = useMemo(() => {
    if (buckets === null) return 0;
    const active = [...buckets.keys()]
      .filter((day) => (buckets.get(day)?.useful ?? 0) > 0)
      .sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let prev: number | null = null;
    for (const day of active) {
      run = prev !== null && shiftDays(prev, 1) === day ? run + 1 : 1;
      if (run > best) best = run;
      prev = day;
    }
    return best;
  }, [buckets]);

  /** The days' time, broken down by the list it went to. Read over the whole
      of the scoped history, so the card answers "what has this gone on, all
      told" — the one question the overview row is not already asking. */
  const listTotals = useMemo(() => {
    if (now === null || buckets === null) return [];
    return totalsByList(scoped, daysAscending(buckets), now);
  }, [scoped, buckets, now]);

  const fullestList = Math.max(...listTotals.map((total) => total.useful), 1);

  /** The task tab's filter, kept honest: a pick pointing at a list that has
      since been deleted falls back to every list, which is the reading that
      is still true. */
  const effectiveTaskScope =
    taskScope === "all" || lists.some((list) => list.id === taskScope)
      ? taskScope
      : "all";

  /** The todos cut down to the task tab's own filter — separate from the
      focus scope above, so a pick on one tab never reshapes the other. */
  const scopedTodos = useMemo(() => {
    if (effectiveTaskScope === "all") return todos;
    return todos.filter((todo) => todo.listId === effectiveTaskScope);
  }, [todos, effectiveTaskScope]);

  /** The task-side figures, over the filtered todo set. */
  const tasks = useMemo(
    () => (now === null ? null : taskStats(scopedTodos, now, firstDay)),
    [scopedTodos, now, firstDay]
  );

  /** Completions over the fourteen days the trend draws, against the fourteen
      before them — the same shift the focus trend's caption uses, so the two
      tabs tell time the same way. */
  const taskCompare = useMemo(() => {
    if (now === null || tasks === null) return null;
    const today = startOfDay(now);
    const sum = (from: number, to: number) => {
      let total = 0;
      for (const { day, count } of tasks.daily) {
        if (day >= from && day <= to) total += count;
      }
      return total;
    };
    return {
      day: sum(shiftDays(today, -13), today),
      dayBefore: sum(shiftDays(today, -27), shiftDays(today, -14)),
    };
  }, [tasks, now]);

  const taskRows = useMemo(
    () => taskListBreakdown(scopedTodos, lists),
    [scopedTodos, lists]
  );

  /** The open work the overview row owns: not done yet, and of it, what is
      already past due. Read off the filtered set, so the filter moves them. */
  const taskOpen = useMemo(
    () => scopedTodos.filter((todo) => !todo.done).length,
    [scopedTodos]
  );
  const taskOverdue = useMemo(
    () =>
      scopedTodos.filter((todo) =>
        isOverdue(todo.dueDate, todo.done, todo.dueTime)
      ).length,
    [scopedTodos]
  );

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
  // The strongest hour of the day, read across the whole log at once: every
  // date's slice in that hour is already summed into one cell, so the reading
  // names an hour and nothing narrower.
  const peak = peakHour(hours);
  const dayUseful =
    buckets === null || view === null ? 0 : (buckets.get(view)?.useful ?? 0);
  const onToday = figures !== null && view !== null && view === figures.today;

  /** The overview row's first two numbers: the day's total and the week's,
      read off the same buckets and the same Monday-first week as every other
      card, so the scope picker moves them with the rest. */
  const todayFocus =
    buckets === null || figures === null
      ? 0
      : (buckets.get(figures.today)?.useful ?? 0);
  const weekFocus = compare?.week ?? 0;

  /** The focus trend's caption: the last fourteen days against the fourteen
      before them — the same window the bars below it draw. */
  const focusTrendCaption =
    compare === null
      ? ""
      : compare.day === 0 && compare.dayBefore === 0
        ? t("focus.log.trend.none", { range: t("focus.log.range.day") })
        : t("focus.log.trend.compare", {
            range: t("focus.log.range.day"),
            delta: delta(compare.day, compare.dayBefore),
          });

  /** The same story for the completions, counted rather than timed. */
  const taskDiff = (taskCompare?.day ?? 0) - (taskCompare?.dayBefore ?? 0);
  const taskDelta = `${taskDiff > 0 ? "+" : "−"}${Math.abs(taskDiff)}`;
  const taskTrendCaption =
    taskCompare === null
      ? ""
      : taskCompare.day === 0 && taskCompare.dayBefore === 0
        ? t("focus.log.trend.tasks.same", { range: t("focus.log.range.day") })
        : t("focus.log.trend.tasks.compare", {
            range: t("focus.log.range.day"),
            delta: taskDelta,
          });

  /** `9/17` — the tick a day wears under the trend. Built on the locale's
      own numeric date, so the shape follows the language. */
  const dayTick = useCallback(
    (day: number) =>
      new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" })
        .format(new Date(day)),
    [locale]
  );

  /** Completions summed over the same fourteen day-windows the focus trend
      draws, so both tabs' trends tell time identically. A day with no
      completions simply adds nothing. */
  const taskTrendValues = useMemo(() => {
    if (tasks === null || figures === null) return [];
    return figures.days.map((bar) => {
      let sum = 0;
      for (const { day, count } of tasks.daily) {
        if (day >= bar.from && day < bar.to) sum += count;
      }
      return sum;
    });
  }, [figures, tasks]);

  /*
   * The scope picker's menu. Active lists sit at the top level; archived ones
   * fold into a submenu — still selectable (history does not vanish when a
   * list is archived) but out of the way of the everyday choice.
   */
  const activeListOptions = useMemo(
    () => lists.filter((list) => list.archivedAt === null),
    [lists]
  );
  const archivedListOptions = useMemo(
    () => lists.filter((list) => list.archivedAt !== null),
    [lists]
  );

  const scopeLabel =
    effectiveScope === SCOPE_ALL
      ? t("focus.log.scopeAll")
      : effectiveScope === SCOPE_UNASSIGNED
        ? t("focus.unassigned")
        : (lists.find((list) => list.id === effectiveScope)?.name ??
          t("focus.log.scopeAll"));
  const scopeColor =
    effectiveScope === SCOPE_ALL || effectiveScope === SCOPE_UNASSIGNED
      ? undefined
      : paletteVar(lists.find((list) => list.id === effectiveScope)?.color ?? "indigo");

  /** The one menu body both the top level and the archive submenu share.
      A checkbox row rather than a plain item, so the scope in force wears
      the same left check the Select on the task tab puts on its pick —
      read against `effectiveScope`, so a deleted list's fallback to the
      whole log moves the check with it. */
  const scopeItem = (list: (typeof lists)[number]) => (
    <DropdownMenuCheckboxItem
      key={list.id}
      checked={effectiveScope === list.id}
      onSelect={() => setScope(list.id as Scope)}
    >
      <span
        aria-hidden="true"
        className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: paletteVar(list.color) }}
      />
      {list.name}
    </DropdownMenuCheckboxItem>
  );

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
        <div className="mx-auto w-full max-w-[1600px] px-5 pb-10 pt-5 sm:px-6 lg:px-8">
        {/* The domain switch first, then the pick that belongs to it, pushed
            to the far edge of the row: each tab owns its own filter, so a
            choice made here reshapes exactly the tab it was made on — and
            nothing on the other one. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Same control the task toolbar's 全部/进行中/已完成 uses — one
              segmented look across the app, the floating pill as the track. */}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "focus" | "tasks")}
          >
            <TabsList
              aria-label={t("stats.tab.label")}
              className="h-9 shrink-0 gap-1 p-0"
            >
              <TabsTrigger value="focus" className="h-9 px-3 text-sm">
                {t("stats.tab.focus")}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="h-9 px-3 text-sm">
                {t("stats.tab.tasks")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "focus" ? (
            <DropdownMenu>
              {/*
               * The trigger wears the Select's clothes, not the Button's: the
               * two tabs' pickers sit in the same slot, so a Button here —
               * font-medium, the press-down scale, the focus ring — read as a
               * different kind of control from the Select beside the tab.
               * A bare <button> copies the SelectTrigger tokens directly; the
               * menu stays a DropdownMenu because archived lists need the
               * submenu a Select cannot offer.
               */}
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("focus.log.scope")}
                  className="ml-auto flex h-9 w-40 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground transition-colors duration-base focus:outline-none focus:border-border-strong disabled:cursor-not-allowed"
                >
                  {scopeColor !== undefined && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: scopeColor }}
                    />
                  )}
                  <span className="flex-1 truncate text-left">
                    {scopeLabel}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 opacity-60"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuCheckboxItem
                  checked={effectiveScope === SCOPE_ALL}
                  onSelect={() => {
                    setConfirming(null);
                    setRefused(null);
                    setScope(SCOPE_ALL);
                  }}
                >
                  {t("focus.log.scopeAll")}
                </DropdownMenuCheckboxItem>
                {activeListOptions.map(scopeItem)}
                {archivedListOptions.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      {t("stats.archivedGroup")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {archivedListOptions.map(scopeItem)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Select
              value={effectiveTaskScope}
              onValueChange={setTaskScope}
            >
              <SelectTrigger
                aria-label={t("stats.tasks.scopeAria")}
                className="ml-auto h-9 w-40 shrink-0 rounded-md px-2.5 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("stats.tasks.scopeAll")}
                </SelectItem>
                {activeListOptions.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    <span
                      aria-hidden="true"
                      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: paletteVar(list.color) }}
                    />
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* The overview row — the tab's plain numbers before any chart:
            "how much" is the question every visit opens with, and it answers
            in a glance rather than in a graph. Both tabs carry six figures
            now — two rows of three, one row of six when the page is wide
            enough — so the grid never reshapes between tabs. */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {tab === "focus" ? (
            <>
              <Metric
                label={t("stats.focus.today")}
                value={duration(todayFocus, language)}
              />
              <Metric
                label={t("stats.focus.week")}
                value={duration(weekFocus, language)}
              />
              <Metric
                label={t("stats.focus.total")}
                value={duration(totalFocus, language)}
              />
              <Metric
                label={t("stats.focus.streak")}
                value={t("stats.focus.streakDays", { n: focusStreak })}
              />
              <Metric
                label={t("stats.focus.bestStreak")}
                value={t("stats.focus.streakDays", { n: bestFocusStreak })}
              />
              <Metric
                label={t("stats.focus.best")}
                value={duration(figures?.best?.ms ?? 0, language)}
              />
            </>
          ) : (
            <>
              <Metric
                label={t("stats.tasks.today")}
                value={t("stats.tasks.count", { n: tasks?.todayDone ?? 0 })}
              />
              <Metric
                label={t("stats.tasks.week")}
                value={t("stats.tasks.count", { n: tasks?.weekDone ?? 0 })}
              />
              <Metric
                label={t("stats.tasks.total")}
                value={t("stats.tasks.count", { n: tasks?.totalDone ?? 0 })}
              />
              <Metric
                label={t("stats.tasks.allCount")}
                value={t("stats.tasks.count", { n: scopedTodos.length })}
              />
              <Metric
                label={t("stats.tasks.bestDay")}
                value={t("stats.tasks.count", { n: tasks?.bestDayCount ?? 0 })}
              />
              <Metric
                label={t("stats.tasks.open")}
                value={`${taskOpen} / ${taskOverdue}`}
              />
            </>
          )}
        </div>

        {tab === "focus" ? (
        <div className="grid items-start gap-4 xl:grid-cols-12">
                  {/* Each column is its own stack so cards flow tightly: in
                      a shared row grid the row is held open by the tallest
                      card in it, stranding whitespace under short ones. */}
                  <div className="flex flex-col gap-4 xl:col-span-6">
                  <Card title={t("stats.focus.where")}>
                    {listTotals.length === 0 ? (
                      <p className="text-sm text-foreground-muted">
                        {t("focus.log.byList.empty")}
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 text-xs font-medium tracking-wide text-foreground-muted">
                          {t("focus.log.byList.timeByList")}
                        </p>
                      <ul className="flex flex-col gap-2.5">
                        {listTotals.map((total) => (
                          <li key={total.listId ?? SCOPE_UNASSIGNED}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
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
                  </Card>

                  {/* The trend under the breakdown, in the same column: both
                      answer "where did it go" at different altitudes — one by
                      list, one by day. */}
                  <Card
                    title={t("stats.focus.trend")}
                    hint={t("focus.log.days14")}
                  >
                    <p className="text-sm leading-snug text-foreground-muted">
                      {t("focus.log.days14")}
                      {": "}
                      <span className="font-medium tabular-nums text-foreground">
                        {duration(compare?.day ?? 0, language)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-snug text-foreground-muted">
                      {focusTrendCaption}
                    </p>
                    <div className="mt-4">
                      <Line
                        values={(figures?.days ?? []).map((bar) => bar.useful)}
                        titles={(figures?.days ?? []).map((bar, index) =>
                          `${dateRange(
                            bar.from,
                            figures !== null &&
                              index === figures.days.length - 1
                              ? shiftDays(figures.today, 1)
                              : bar.to,
                            language
                          )} · ${duration(bar.useful, language)}`
                        )}
                        labels={(figures?.days ?? []).map((bar) =>
                          dayTick(bar.from)
                        )}
                        marked={figures === null ? 0 : figures.days.length - 1}
                      />
                    </div>
                  </Card>
                  </div>

                  <div className="flex flex-col gap-4 xl:col-span-6">
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
                      <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border px-6 py-10 text-center">
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
                                className="border-b border-border px-3 py-2 transition-colors duration-base ease-out last:border-b-0 hover:bg-hover-bg"
                              >
                                <div className="flex items-center gap-2.5 text-sm">
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
                    <p className="mt-4 text-sm leading-snug text-foreground-muted">
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
                              from: hourName(peak, language),
                              to: hourName(peak + 1, language),
                              value: duration(hours[peak], language),
                            })}
                      </p>
                      <div className="mt-4">
                        <Heat
                          grid={figures?.heat ?? []}
                          lang={language}
                          firstDay={firstDay}
                          read={(ms) => duration(ms, language)}
                        />
                      </div>
                    </Card>

                  </div>

                {/* The year at a glance, closing the focus tab: one cell a day
                    over a whole calendar year, stepped back as far as the log
                    reaches. Read off the same buckets as everything above it,
                    so the scope picker rescales it too. */}
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
                        firstDay={firstDay}
                        read={(ms) => duration(ms, language)}
                        lessLabel={t("focus.log.yearHeat.less")}
                        moreLabel={t("focus.log.yearHeat.more")}
                      />
                    )}
                  </Card>
                </div>
                ) : (
                /* ── 任务 tab ───────────────────────────────────────────
                   The same grammar as the focus tab — overview row first,
                   then the cards — but reading the todo set, filtered by its
                   own list pick. A completion is stamped when a checkbox is
                   ticked; none of these figures touch the log. */
                <div className="grid items-start gap-4 xl:grid-cols-12">
                  <div className="flex flex-col gap-4 xl:col-span-6">
                    <Card
                      title={t("stats.tasks.trend")}
                      hint={t("focus.log.days14")}
                    >
                      <p className="text-sm leading-snug text-foreground-muted">
                        {t("focus.log.days14")}
                        {": "}
                        <span className="font-medium tabular-nums text-foreground">
                          {t("stats.tasks.count", { n: taskCompare?.day ?? 0 })}
                        </span>
                      </p>
                      <p className="mt-1 text-sm leading-snug text-foreground-muted">
                        {taskTrendCaption}
                      </p>
                      <div className="mt-4">
                        <Line
                          values={taskTrendValues}
                          titles={
                            figures === null
                              ? []
                              : figures.days.map(
                                  (bar, index) =>
                                    `${dateRange(
                                      bar.from,
                                      index === figures.days.length - 1
                                        ? shiftDays(figures.today, 1)
                                        : bar.to,
                                      language
                                    )} · ${t("stats.tasks.count", {
                                      n: taskTrendValues[index],
                                    })}`
                                )
                          }
                          labels={
                            figures?.days.map((bar) => dayTick(bar.from)) ?? []
                          }
                          marked={
                            figures === null ? 0 : figures.days.length - 1
                          }
                        />
                      </div>
                    </Card>
                  </div>

                  <div className="flex flex-col gap-4 xl:col-span-6">
                    <Card title={t("stats.tasks.byList")}>
                      {taskRows.length === 0 ? (
                        <p className="text-sm text-foreground-muted">
                          {t("stats.tasks.empty")}
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2.5">
                          {taskRows.map((row) => (
                            <li key={row.listId}>
                              <div className="flex items-baseline justify-between gap-3 text-sm">
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
                      )}
                    </Card>
                  </div>
                </div>
                )}
                </div>
      </div>

      <AddSpanDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        lists={activeListOptions}
        onAdd={onAddManual}
      />
    </main>
  );
}
