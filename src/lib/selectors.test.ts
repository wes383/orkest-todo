import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  computeStats,
  effectiveStatus,
  groupByDue,
  selectTodos,
  viewCounts,
  type Filters,
} from "@/lib/selectors";
import { addDays, todayISO } from "@/lib/date";
import type { Todo } from "@/lib/types";

let seq = 0;
function todo(patch: Partial<Todo> & Pick<Todo, "title">): Todo {
  seq += 1;
  return {
    id: `t${seq}`,
    notes: "",
    done: false,
    starred: false,
    priority: "medium",
    dueDate: null,
    dueTime: null,
    remindBefore: null,
    listId: "list-work",
    tags: [],
    subtasks: [],
    recur: null,
    createdAt: seq,
    completedAt: null,
    ...patch,
  };
}

describe("selectTodos", () => {
  const today = todayISO();
  const todos = [
    todo({ title: "今天的事", dueDate: today }),
    todo({ title: "明天的事", dueDate: addDays(today, 1) }),
    todo({ title: "逾期的事", dueDate: addDays(today, -2) }),
    todo({ title: "做完的事", done: true, dueDate: today, completedAt: 1 }),
    todo({ title: "加星的事", starred: true }),
    todo({ title: "无日期", tags: ["杂"] }),
  ];

  it("buckets the smart views", () => {
    expect(viewCounts(todos)).toEqual({
      all: 5,
      today: 1,
      upcoming: 1,
      overdue: 1,
      starred: 1,
      completed: 1,
    });
  });

  it("a locking view wins over a stale status filter", () => {
    const filters = { ...DEFAULT_FILTERS, view: "completed" as const, status: "active" as const };
    expect(effectiveStatus(filters)).toBe("completed");
    expect(selectTodos(todos, filters, "zh")).toHaveLength(1);
  });

  it("today keeps the finished day, sunken", () => {
    // 今天的事 is due today and open; 做完的事 is due today and done. The
    // view holds both, done last — an accidental tick is undone in place.
    const filters = { ...DEFAULT_FILTERS, view: "today" as const };
    expect(effectiveStatus(filters)).toBe("all");
    expect(selectTodos(todos, filters, "zh").map((t) => t.title)).toEqual([
      "今天的事",
      "做完的事",
    ]);
  });

  it("search hits title, notes and tags", () => {
    const filters = { ...DEFAULT_FILTERS, query: "杂" };
    expect(selectTodos(todos, filters, "zh").map((t) => t.title)).toEqual(["无日期"]);
  });

  it("finished work sinks to the bottom whatever the sort", () => {
    const out = selectTodos(todos, { ...DEFAULT_FILTERS, sort: "title" }, "zh");
    expect(out[out.length - 1].done).toBe(true);
  });
});

describe("date filter", () => {
  const today = todayISO();

  it("filters by named day and by date existence", () => {
    const todos = [
      todo({ title: "今天的", dueDate: today }),
      todo({ title: "明天的", dueDate: addDays(today, 1) }),
      todo({ title: "无日期" }),
    ];
    const pick = (dateFilter: Filters["dateFilter"]) =>
      selectTodos(todos, { ...DEFAULT_FILTERS, dateFilter }, "zh").map(
        (t) => t.title
      );
    expect(pick("today")).toEqual(["今天的"]);
    expect(pick("tomorrow")).toEqual(["明天的"]);
    expect(pick("withDate")).toEqual(["今天的", "明天的"]);
    expect(pick("noDate")).toEqual(["无日期"]);
    expect(pick(null)).toHaveLength(3);
  });

  it("reads weeks Monday-first and never leaks across the boundary", () => {
    const todos = [
      todo({ title: "本周内", dueDate: today }),
      todo({ title: "下周的", dueDate: addDays(today, 7) }),
      todo({ title: "两周后", dueDate: addDays(today, 14) }),
    ];
    const pick = (
      dateFilter: Filters["dateFilter"],
      weekStartDow: 0 | 1 = 1
    ) =>
      selectTodos(
        todos,
        { ...DEFAULT_FILTERS, dateFilter },
        "zh",
        weekStartDow
      ).map((t) => t.title);
    // Whatever weekday today is, today+7 sits inside next week and today+14
    // sits outside it — the two assertions pin both edges of the span.
    expect(pick("thisWeek")).toEqual(["本周内"]);
    expect(pick("nextWeek")).toEqual(["下周的"]);
    // The same edges hold on a Sunday-first week, where the span shifts but
    // never widens past its own seven days.
    expect(pick("thisWeek", 0)).toEqual(["本周内"]);
    expect(pick("nextWeek", 0)).toEqual(["下周的"]);
  });
});

describe("computeStats", () => {
  it("counts the buckets and the progress", () => {
    const today = todayISO();
    const todos = [
      todo({ title: "a", dueDate: today }),
      todo({ title: "b", done: true, completedAt: 1 }),
    ];
    const stats = computeStats(todos);
    expect(stats.total).toBe(2);
    expect(stats.done).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.today).toBe(1);
    expect(stats.progress).toBe(50);
  });

  it("an empty list reports zero progress rather than NaN", () => {
    expect(computeStats([]).progress).toBe(0);
  });
});

describe("groupByDue", () => {
  const today = todayISO();

  it("buckets by the calendar, not the checkbox", () => {
    // A finished task due yesterday is still dated yesterday: it is history,
    // not today — and "today" must not swallow every past day just because
    // its filter reads `diff <= 0`.
    const groups = groupByDue(
      [
        todo({ title: "过期未完", dueDate: addDays(today, -2) }),
        todo({ title: "昨天做完", done: true, dueDate: addDays(today, -1), completedAt: 1 }),
        todo({ title: "今天的事", dueDate: today }),
        todo({ title: "明天的", dueDate: addDays(today, 1) }),
      ],
      "zh"
    );
    // History sits above overdue and takes all the finished past.
    expect(groups.map((g) => g.key)).toEqual([
      "history",
      "overdue",
      "today",
      "tomorrow",
    ]);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.todos]));
    expect(byKey.history.map((t) => t.title)).toEqual(["昨天做完"]);
    expect(byKey.overdue.map((t) => t.title)).toEqual(["过期未完"]);
    expect(byKey.today.map((t) => t.title)).toEqual(["今天的事"]);
    expect(byKey.tomorrow.map((t) => t.title)).toEqual(["明天的"]);
  });
});
