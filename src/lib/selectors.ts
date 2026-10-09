import { daysFromToday, fromISODate, isOverdue, todayISO, toISODate, addDays } from "@/lib/date";
import { LOCALES, translate, type Language } from "@/lib/messages";
import {
  PRIORITY_META,
  type DateFilterKey,
  type Priority,
  type SortKey,
  type StatusFilter,
  type Todo,
  type ViewId,
} from "@/lib/types";

export interface Filters {
  view: ViewId;
  /** `null` = every list */
  listId: string | null;
  status: StatusFilter;
  priority: Priority | "all";
  tag: string | null;
  query: string;
  sort: SortKey;
  /** `null` = every date. Only consulted where the toolbar offers it —
      今天 and 已逾期 are already date-shaped answers. */
  dateFilter: DateFilterKey | null;
}

export const DEFAULT_FILTERS: Filters = {
  view: "all",
  listId: null,
  status: "all",
  priority: "all",
  tag: null,
  query: "",
  sort: "due",
  dateFilter: null,
};

/** The views whose answer is already a date: a 日期 chip there could only
    fight the view's own promise. Everywhere else the chip is offered. */
export function dateFilterApplies(view: ViewId): boolean {
  return view !== "today" && view !== "overdue";
}

/** The ISO date span a named filter covers, `[start, end]` inclusive. Weeks
    run Monday-first; months and years are the calendar's own. */
function dateFilterRange(
  key: Exclude<DateFilterKey, "withDate" | "noDate">,
  today: string
): { start: string; end: string } {
  const now = fromISODate(today);
  switch (key) {
    case "today":
      return { start: today, end: today };
    case "tomorrow":
      return { start: addDays(today, 1), end: addDays(today, 1) };
    case "dayAfter":
      return { start: addDays(today, 2), end: addDays(today, 2) };
    case "thisWeek":
    case "nextWeek": {
      // Monday of this week — `(day + 6) % 7` days back from a Sunday-first
      // `getDay()`.
      const monday = addDays(today, -((now.getDay() + 6) % 7));
      const start = key === "thisWeek" ? monday : addDays(monday, 7);
      return { start, end: addDays(start, 6) };
    }
    case "thisMonth":
    case "nextMonth": {
      const y = key === "thisMonth" ? now.getFullYear() : now.getFullYear() + (now.getMonth() === 11 ? 1 : 0);
      const m = key === "thisMonth" ? now.getMonth() : (now.getMonth() + 1) % 12;
      const start = toISODate(new Date(y, m, 1));
      const end = toISODate(new Date(y, m + 1, 0));
      return { start, end };
    }
    case "thisYear": {
      const y = now.getFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
  }
}

function matchesDateFilter(todo: Todo, key: DateFilterKey, today: string): boolean {
  if (key === "withDate") return todo.dueDate !== null;
  if (key === "noDate") return todo.dueDate === null;
  if (!todo.dueDate) return false;
  const { start, end } = dateFilterRange(key, today);
  return todo.dueDate >= start && todo.dueDate <= end;
}

const WEEK_AHEAD = 7;

function matchesView(todo: Todo, view: ViewId): boolean {
  const today = todayISO();
  switch (view) {
    case "all":
      return true;
    case "today":
      // The whole day, not just the open work: what is done today sinks to
      // the bottom of this view rather than vanishing from it — an accidental
      // tick is undone in place, and the day keeps its receipts.
      return todo.dueDate === today;
    case "upcoming": {
      if (todo.done || !todo.dueDate) return false;
      const diff = daysFromToday(todo.dueDate);
      return diff > 0 && diff <= WEEK_AHEAD;
    }
    case "overdue":
      // Time-precise: a today-09:00 task still pending at noon is overdue
      // already, while an all-day task only turns tomorrow.
      return isOverdue(todo.dueDate, todo.done, todo.dueTime);
    case "starred":
      return !todo.done && todo.starred;
    case "completed":
      return todo.done;
  }
}

/**
 * The status a smart view is *already* restricted to, or `null` when the scope
 * can hold both finished and unfinished work.
 *
 * `matchesView` pins this down for three of the five views (即将到期 / 已逾期 /
 * 已加星 all require `!todo.done`) and 已完成 requires `todo.done`. 全部任务 and
 * 今天 can hold both — 今天 on purpose: the finished day sinks to the bottom
 * there rather than leaving the view — so a status filter is meaningful in
 * exactly those two.
 */
export function viewImpliedStatus(view: ViewId): StatusFilter | null {
  if (view === "all" || view === "today") return null;
  return view === "completed" ? "completed" : "active";
}

/**
 * The status filtering actually applies: a locking view wins over whatever the
 * status filter happens to hold, so a stale value can never silently empty the
 * list. The UI hides the control in that case; this is the matching guarantee
 * on the data side.
 */
export function effectiveStatus(filters: Filters): StatusFilter {
  return viewImpliedStatus(filters.view) ?? filters.status;
}

function compareByDue(a: Todo, b: Todo): number {
  if (a.dueDate && b.dueDate) {
    const byDate = a.dueDate.localeCompare(b.dueDate);
    if (byDate !== 0) return byDate;
    // Same day: a task with a moment sorts before an all-day task, and two
    // moments sort chronologically — "17:00" compares as itself because the
    // zero-padded `HH:mm` strings order like the times they name.
    if (a.dueTime && b.dueTime) {
      const byTime = a.dueTime.localeCompare(b.dueTime);
      if (byTime !== 0) return byTime;
    } else if (a.dueTime) {
      return -1;
    } else if (b.dueTime) {
      return 1;
    }
  } else if (a.dueDate) {
    return -1;
  } else if (b.dueDate) {
    return 1;
  }
  return PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
}

/**
 * Applies smart view → list → status → priority → tag → search → sort.
 *
 * `lang` is here only for the title sort. `localeCompare` with no locale
 * argument silently uses the *device* locale, so an app switched to English on
 * a Chinese machine would keep sorting titles by pinyin — the collation has to
 * follow the app's language, exactly like every other string.
 */
export function selectTodos(
  todos: Todo[],
  filters: Filters,
  lang: Language
): Todo[] {
  const query = filters.query.trim().toLowerCase();
  const status = effectiveStatus(filters);
  const today = todayISO();

  const filtered = todos.filter((todo) => {
    if (!matchesView(todo, filters.view)) return false;
    if (filters.listId && todo.listId !== filters.listId) return false;
    if (status === "active" && todo.done) return false;
    if (status === "completed" && !todo.done) return false;
    if (filters.priority !== "all" && todo.priority !== filters.priority) {
      return false;
    }
    if (filters.tag && !todo.tags.includes(filters.tag)) return false;
    // The same guard the UI uses: in 今天 / 已逾期 a stale date range could
    // only fight the view's own promise, so it is not consulted there.
    if (
      filters.dateFilter &&
      dateFilterApplies(filters.view) &&
      !matchesDateFilter(todo, filters.dateFilter, today)
    ) {
      return false;
    }
    if (query) {
      const haystack = [
        todo.title,
        todo.notes,
        ...todo.tags,
        ...todo.subtasks.map((s) => s.title),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  switch (filters.sort) {
    case "due":
      sorted.sort(compareByDue);
      break;
    case "priority":
      sorted.sort(
        (a, b) =>
          PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
          compareByDue(a, b)
      );
      break;
    case "created":
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title, LOCALES[lang]));
      break;
  }

  // Finished work always sinks to the bottom, whatever the sort key.
  return [
    ...sorted.filter((t) => !t.done),
    ...sorted.filter((t) => t.done),
  ];
}

export interface TodoStats {
  total: number;
  active: number;
  done: number;
  overdue: number;
  today: number;
  starred: number;
  /** 0–100, rounded. */
  progress: number;
}

export function computeStats(todos: Todo[]): TodoStats {
  const today = todayISO();
  const done = todos.filter((t) => t.done).length;
  const active = todos.length - done;
  return {
    total: todos.length,
    active,
    done,
    overdue: todos.filter((t) => isOverdue(t.dueDate, t.done, t.dueTime))
      .length,
    today: todos.filter((t) => !t.done && t.dueDate === today).length,
    starred: todos.filter((t) => !t.done && t.starred).length,
    progress: todos.length === 0 ? 0 : Math.round((done / todos.length) * 100),
  };
}

export function viewCounts(todos: Todo[]): Record<ViewId, number> {
  const today = todayISO();
  return {
    all: todos.filter((t) => !t.done).length,
    // The badge is a workload, not a history count: what is already done
    // today stays in the view but stays out of this number.
    today: todos.filter((t) => !t.done && t.dueDate === today).length,
    upcoming: todos.filter((t) => matchesView(t, "upcoming")).length,
    overdue: todos.filter((t) => matchesView(t, "overdue")).length,
    starred: todos.filter((t) => matchesView(t, "starred")).length,
    completed: todos.filter((t) => t.done).length,
  };
}

export function listCounts(todos: Todo[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const todo of todos) {
    if (todo.done) continue;
    counts[todo.listId] = (counts[todo.listId] ?? 0) + 1;
  }
  return counts;
}

export function collectTags(todos: Todo[], lang: Language): string[] {
  const tags = new Set<string>();
  todos.forEach((t) => t.tags.forEach((tag) => tags.add(tag)));
  return [...tags].sort((a, b) => a.localeCompare(b, LOCALES[lang]));
}

/** Groups tasks into 历史 / 逾期 / 今天 / 明天 / 本周 / 以后 / 无日期 buckets.
    历史 holds the finished past — kept apart from 逾期, which is a work
    list, not an archive. */
export interface TodoGroup {
  key: string;
  label: string;
  todos: Todo[];
}

export function groupByDue(todos: Todo[], lang: Language): TodoGroup[] {
  const buckets: TodoGroup[] = [
    { key: "history", label: translate(lang, "group.history"), todos: [] },
    { key: "overdue", label: translate(lang, "group.overdue"), todos: [] },
    { key: "today", label: translate(lang, "group.today"), todos: [] },
    { key: "tomorrow", label: translate(lang, "group.tomorrow"), todos: [] },
    { key: "week", label: translate(lang, "group.week"), todos: [] },
    { key: "later", label: translate(lang, "group.later"), todos: [] },
    { key: "none", label: translate(lang, "group.none"), todos: [] },
  ];
  const index: Record<string, TodoGroup> = Object.fromEntries(
    buckets.map((b) => [b.key, b])
  );

  for (const todo of todos) {
    if (!todo.dueDate) {
      index.none.todos.push(todo);
      continue;
    }
    const diff = daysFromToday(todo.dueDate);
    // The past is the past whatever the checkbox says — but where it lands
    // depends on it: a finished task dated yesterday is history, an
    // unfinished one is overdue work. "Today" must mean *this day*, not
    // "any day up to now".
    if (diff < 0) {
      (todo.done ? index.history : index.overdue).todos.push(todo);
    } else if (diff === 0) index.today.todos.push(todo);
    else if (diff === 1) index.tomorrow.todos.push(todo);
    else if (diff <= 7) index.week.todos.push(todo);
    else index.later.todos.push(todo);
  }

  return buckets.filter((b) => b.todos.length > 0);
}
