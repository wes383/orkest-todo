import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  computeStats,
  effectiveStatus,
  selectTodos,
  viewCounts,
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

  it("search hits title, notes and tags", () => {
    const filters = { ...DEFAULT_FILTERS, query: "杂" };
    expect(selectTodos(todos, filters, "zh").map((t) => t.title)).toEqual(["无日期"]);
  });

  it("finished work sinks to the bottom whatever the sort", () => {
    const out = selectTodos(todos, { ...DEFAULT_FILTERS, sort: "title" }, "zh");
    expect(out[out.length - 1].done).toBe(true);
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
