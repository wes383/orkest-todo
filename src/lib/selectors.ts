import { daysFromToday, todayISO } from "@/lib/date";
import { LOCALES, translate, type Language } from "@/lib/messages";
import {
  PRIORITY_META,
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
}

export const DEFAULT_FILTERS: Filters = {
  view: "all",
  listId: null,
  status: "all",
  priority: "all",
  tag: null,
  query: "",
  sort: "due",
};

const WEEK_AHEAD = 7;

function matchesView(todo: Todo, view: ViewId): boolean {
  const today = todayISO();
  switch (view) {
    case "all":
      return true;
    case "today":
      return !todo.done && todo.dueDate === today;
    case "upcoming": {
      if (todo.done || !todo.dueDate) return false;
      const diff = daysFromToday(todo.dueDate);
      return diff > 0 && diff <= WEEK_AHEAD;
    }
    case "overdue":
      return !todo.done && !!todo.dueDate && daysFromToday(todo.dueDate) < 0;
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
 * `matchesView` pins this down for four of the five views (今天 / 即将到期 /
 * 已逾期 / 已加星 all require `!todo.done`) and 已完成 requires `todo.done`. Only
 * `all` — with or without a list selected — can contain both, so a status filter
 * is only meaningful there. Anywhere else it is either a no-op (进行中) or
 * guarantees an empty list (已完成).
 */
export function viewImpliedStatus(view: ViewId): StatusFilter | null {
  if (view === "all") return null;
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

  const filtered = todos.filter((todo) => {
    if (!matchesView(todo, filters.view)) return false;
    if (filters.listId && todo.listId !== filters.listId) return false;
    if (status === "active" && todo.done) return false;
    if (status === "completed" && !todo.done) return false;
    if (filters.priority !== "all" && todo.priority !== filters.priority) {
      return false;
    }
    if (filters.tag && !todo.tags.includes(filters.tag)) return false;
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
    overdue: todos.filter(
      (t) => !t.done && !!t.dueDate && daysFromToday(t.dueDate) < 0
    ).length,
    today: todos.filter((t) => !t.done && t.dueDate === today).length,
    starred: todos.filter((t) => !t.done && t.starred).length,
    progress: todos.length === 0 ? 0 : Math.round((done / todos.length) * 100),
  };
}

export function viewCounts(todos: Todo[]): Record<ViewId, number> {
  return {
    all: todos.filter((t) => !t.done).length,
    today: todos.filter((t) => matchesView(t, "today")).length,
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

/** Groups tasks into 逾期 / 今天 / 明天 / 本周 / 以后 / 无日期 buckets. */
export interface TodoGroup {
  key: string;
  label: string;
  todos: Todo[];
}

export function groupByDue(todos: Todo[], lang: Language): TodoGroup[] {
  const buckets: TodoGroup[] = [
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
    if (!todo.done && diff < 0) index.overdue.todos.push(todo);
    else if (diff <= 0) index.today.todos.push(todo);
    else if (diff === 1) index.tomorrow.todos.push(todo);
    else if (diff <= 7) index.week.todos.push(todo);
    else index.later.todos.push(todo);
  }

  return buckets.filter((b) => b.todos.length > 0);
}
