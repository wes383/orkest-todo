/**
 * The task side of the statistics page: what the todo list adds up to, read
 * the same way the focus figures are read.
 *
 * Everything here is worked out from the todos themselves, on every open —
 * none of it is stored, for the same reason the focus milestones are not: a
 * trophy pinned to storage would outlive the unchecking that took it away.
 * Completion history is read off `completedAt`, which the store stamps once,
 * when a task is first completed, so a task toggled back and forth counts on
 * the day it was actually finished.
 */

import {
  cappedEnd,
  shiftDays,
  startOfDay,
  startOfWeek,
  type FocusSpan,
} from "@/lib/focus-spans";
import { firstDayOfWeek, type FirstDayOfWeek } from "@/lib/settings";
import type { Priority, Todo, TodoList } from "@/lib/types";

export interface TaskStats {
  todayDone: number;
  weekDone: number;
  totalDone: number;
  bestDayCount: number;
  /** The local midnight of the best day, when there is one. */
  bestDay: number | null;
  longestStreak: number;
  /** Consecutive days with at least one completion, ending today — or
      yesterday, when today has not earned its place yet. */
  currentStreak: number;
  /** Completions per local midnight, days ascending, days with none left out. */
  daily: { day: number; count: number }[];
  /** Creations per local midnight — the backlog chart's other line. */
  createdDaily: { day: number; count: number }[];
  /** Completions per weekday, indexed in the week's own order (first day
      first), so the chart's columns read the way the week runs. */
  weekday: number[];
  /** Done tasks that carried a due date: finished on or before it, vs after. */
  onTimeCount: number;
  lateCount: number;
  /** Mean span from creation to completion, in days over the done tasks that
      know both ends; `null` until something has been finished. */
  avgDays: number | null;
  /** Done tasks finished the very day they were created. */
  sameDayCount: number;
  /** Completions per priority — the "what mattered" split. */
  priorityDone: Record<Priority, number>;
}

export function taskStats(
  todos: Todo[],
  now: number,
  firstDay: FirstDayOfWeek = firstDayOfWeek()
): TaskStats {
  const perDay = new Map<number, number>();
  const perCreatedDay = new Map<number, number>();
  const weekday = new Array<number>(7).fill(0);
  const priorityDone: Record<Priority, number> = {
    urgent: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  let totalDone = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let sameDayCount = 0;
  let spanMsTotal = 0;
  const weekStartDow = firstDay === "sunday" ? 0 : 1;

  // Creations are counted for every task; the completion figures below only
  // have a use for the ones that actually finished.
  for (const todo of todos) {
    const created = startOfDay(todo.createdAt);
    perCreatedDay.set(created, (perCreatedDay.get(created) ?? 0) + 1);

    if (!todo.done || todo.completedAt === null) continue;
    totalDone += 1;
    const day = startOfDay(todo.completedAt);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);

    // Weekday bucketed in the week's own order — `(dow - start + 7) % 7`
    // rotates either convention into "first day first".
    const dow = new Date(day).getDay();
    weekday[(dow - weekStartDow + 7) % 7] += 1;

    priorityDone[todo.priority] += 1;

    // Deadline keeping, at day grain: an all-day task due the 10th counts as
    // kept when it finished on the 10th, late from the 11th on.
    if (todo.dueDate !== null) {
      const d = new Date(todo.completedAt);
      const doneISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (doneISO > todo.dueDate) lateCount += 1;
      else onTimeCount += 1;
    }

    const span = todo.completedAt - todo.createdAt;
    if (span >= 0) {
      spanMsTotal += span;
      if (startOfDay(todo.createdAt) === day) sameDayCount += 1;
    }
  }

  const daily = [...perDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, count]) => ({ day, count }));
  const createdDaily = [...perCreatedDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, count]) => ({ day, count }));

  const today = startOfDay(now);
  const weekFrom = startOfWeek(now, firstDay);
  let weekDone = 0;
  for (const { day, count } of daily) {
    if (day >= weekFrom && day <= today) weekDone += count;
  }

  let bestDayCount = 0;
  let bestDay: number | null = null;
  for (const { day, count } of daily) {
    if (count > bestDayCount) {
      bestDayCount = count;
      bestDay = day;
    }
  }

  // Streaks walk the days with completions and split them into runs of
  // consecutive days. `shiftDays` steps the calendar, so the join is daylight
  // -saving-proof rather than a bare 86,400,000 ms apart.
  const runs: number[][] = [];
  let run: number[] = [];
  for (const { day } of daily) {
    const prev = run[run.length - 1];
    if (prev !== undefined && shiftDays(prev, 1) === day) {
      run.push(day);
    } else {
      if (run.length > 0) runs.push(run);
      run = [day];
    }
  }
  if (run.length > 0) runs.push(run);

  let longestStreak = 0;
  for (const entry of runs) {
    if (entry.length > longestStreak) longestStreak = entry.length;
  }

  // The current streak counts back from today; a day with nothing yet does not
  // break it until tomorrow — yesterday's work is still standing.
  let currentStreak = 0;
  const has = (day: number) => perDay.has(day);
  let cursor = has(today) ? today : shiftDays(today, -1);
  while (has(cursor)) {
    currentStreak += 1;
    cursor = shiftDays(cursor, -1);
  }

  return {
    todayDone: perDay.get(today) ?? 0,
    weekDone,
    totalDone,
    bestDayCount,
    bestDay,
    longestStreak,
    currentStreak,
    daily,
    createdDaily,
    weekday,
    onTimeCount,
    lateCount,
    avgDays:
      totalDone > 0
        ? Math.round((spanMsTotal / totalDone / 86_400_000) * 10) / 10
        : null,
    sameDayCount,
    priorityDone,
  };
}

/** Per-tag completions, busiest first. A tag is one row however many tasks
    wear it; the rate underneath reads against every task carrying it. */
export function taskTagBreakdown(todos: Todo[]) {
  const map = new Map<string, { done: number; total: number }>();
  for (const todo of todos) {
    for (const tag of todo.tags) {
      const row = map.get(tag) ?? { done: 0, total: 0 };
      row.total += 1;
      if (todo.done) row.done += 1;
      map.set(tag, row);
    }
  }
  return [...map.entries()]
    .map(([tag, row]) => ({ tag, ...row }))
    .filter((row) => row.total > 0)
    .sort(
      (a, b) =>
        b.done - a.done || b.total - a.total || a.tag.localeCompare(b.tag)
    );
}

/** Per-list completion, in the sidebar's list order. Lists with no tasks at
    all are left out — a 0/0 row says nothing worth the space. */
export function taskListBreakdown(todos: Todo[], lists: TodoList[]) {
  return lists
    .map((list) => {
      const mine = todos.filter((todo) => todo.listId === list.id);
      const done = mine.filter((todo) => todo.done).length;
      return {
        listId: list.id,
        done,
        total: mine.length,
        rate: mine.length > 0 ? done / mine.length : 0,
      };
    })
    .filter((row) => row.total > 0);
}

/** Where the logged focus time went, filed against unfiled. Every stretch in
    the log is useful time — the split is whether it was ever given a list. */
export function usefulSplit(
  spans: FocusSpan[],
  now: number
): { filed: number; unfiled: number; ratio: number } {
  let filed = 0;
  let unfiled = 0;
  for (const span of spans) {
    const ms = cappedEnd(span, now) - span.start;
    if (ms <= 0) continue;
    if (span.listId === null) unfiled += ms;
    else filed += ms;
  }
  const total = filed + unfiled;
  return { filed, unfiled, ratio: total > 0 ? filed / total : 0 };
}
