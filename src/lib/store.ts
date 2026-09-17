import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "@/lib/utils";
import { translate, type Language } from "@/lib/messages";
import type { Priority, Recur, Subtask, Todo, TodoList } from "@/lib/types";
import { nextDueDate } from "@/lib/recur";

const STORAGE_KEY = "orkest-todo.v1";

export interface TodoDraft {
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string | null;
  listId: string;
  tags: string[];
  subtasks: Subtask[];
  /** `null` = does not repeat. */
  recur: Recur | null;
}

interface PersistedState {
  version: number;
  todos: Todo[];
  lists: TodoList[];
}

function newSubtask(title: string): Subtask {
  return { id: uid("sub"), title, done: false };
}

/**
 * The next occurrence of a repeating task — a fresh task with the rule's next
 * due date and an unticked checklist. `undefined` when the task does not
 * repeat, has no due date to advance from, or its rule names no next day.
 */
function spawnNextOccurrence(target: Todo): Todo | undefined {
  if (!target.recur || !target.dueDate) return undefined;
  const nextDue = nextDueDate(target.recur, target.dueDate);
  if (!nextDue) return undefined;
  return {
    ...target,
    id: uid("todo"),
    done: false,
    completedAt: null,
    createdAt: Date.now(),
    dueDate: nextDue,
    subtasks: target.subtasks.map((s) => newSubtask(s.title)),
  };
}

/** Copies `task` into `todos` directly after the task with id `afterId`. */
function insertAfter(todos: Todo[], afterId: string, task: Todo): Todo[] {
  const index = todos.findIndex((t) => t.id === afterId);
  if (index < 0) return todos;
  return [...todos.slice(0, index + 1), task, ...todos.slice(index + 1)];
}

/** Picks a due date relative to today so seeded data always looks current. */
function seedDueDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/*
 * Ids are fixed across languages; only the names move. Two reasons: a task's
 * `listId` must survive a language switch (the tasks are user data and are
 * never re-seeded), and `removeList` needs a fallback id it can name without
 * knowing which language the app is in.
 */
const WORK_LIST = "list-work";
const LIFE_LIST = "list-life";
const SHOPPING_LIST = "list-shopping";

/** Where tasks land when the last list is deleted and nothing replaces it. */
const FALLBACK_LIST_ID = WORK_LIST;

type SeedTodo = Partial<Todo> & Pick<Todo, "title" | "listId">;

interface Seed {
  lists: TodoList[];
  todos: SeedTodo[];
}

/**
 * Demo content, per language.
 *
 * Kept as data here rather than as ~40 message keys: this is sample *content*,
 * not UI chrome, and any user who has actually used the app has long since
 * replaced it. The language-free `make()` below turns these partials into real
 * todos, so the two versions stay structurally identical and only their words
 * differ.
 */
const SEED: Record<Language, Seed> = {
  zh: {
    lists: [
      { id: WORK_LIST, name: "工作", color: "indigo" },
      { id: LIFE_LIST, name: "生活", color: "emerald" },
      { id: SHOPPING_LIST, name: "购物", color: "amber" },
    ],
    todos: [
      {
        title: "完成 Q3 产品复盘材料",
        notes: "重点讲清楚留存曲线的变化原因，以及下季度的三个实验方向。",
        listId: WORK_LIST,
        priority: "urgent",
        dueDate: seedDueDate(0),
        starred: true,
        tags: ["汇报", "Q3"],
        subtasks: [
          newSubtask("整理核心指标环比数据"),
          newSubtask("画留存曲线对比图"),
          newSubtask("写结论与下季度规划"),
        ],
        createdAt: -1000 * 60 * 60 * 26,
      },
      {
        title: "给设计稿补充空态与加载态",
        notes: "列表空态、骨架屏、错误重试三种状态都要出图。",
        listId: WORK_LIST,
        priority: "high",
        dueDate: seedDueDate(1),
        tags: ["设计"],
        subtasks: [newSubtask("空态插画"), newSubtask("骨架屏规格标注")],
        createdAt: -1000 * 60 * 60 * 5,
      },
      {
        title: "预约牙医复诊",
        listId: LIFE_LIST,
        priority: "medium",
        dueDate: seedDueDate(-1),
        tags: ["健康"],
        createdAt: -1000 * 60 * 60 * 72,
      },
      {
        title: "买咖啡豆和燕麦奶",
        listId: SHOPPING_LIST,
        priority: "low",
        dueDate: seedDueDate(3),
        tags: ["日用品"],
        createdAt: -1000 * 60 * 90,
      },
      {
        title: "读完《设计中的设计》第三章",
        notes: "记两条可用于当前项目的启发。",
        listId: LIFE_LIST,
        priority: "low",
        starred: true,
        tags: ["阅读"],
        createdAt: -1000 * 60 * 60 * 50,
      },
      {
        title: "整理上周的会议纪要",
        listId: WORK_LIST,
        priority: "medium",
        done: true,
        completedAt: -1000 * 60 * 60 * 20,
        tags: ["协作"],
        createdAt: -1000 * 60 * 60 * 60,
      },
    ],
  },
  en: {
    lists: [
      { id: WORK_LIST, name: "Work", color: "indigo" },
      { id: LIFE_LIST, name: "Personal", color: "emerald" },
      { id: SHOPPING_LIST, name: "Shopping", color: "amber" },
    ],
    todos: [
      {
        title: "Finish the Q3 product review deck",
        notes:
          "Explain why the retention curve moved, and lay out three experiments for next quarter.",
        listId: WORK_LIST,
        priority: "urgent",
        dueDate: seedDueDate(0),
        starred: true,
        tags: ["review", "Q3"],
        subtasks: [
          newSubtask("Pull the core metric deltas"),
          newSubtask("Chart the retention curves side by side"),
          newSubtask("Write the takeaways and next quarter's plan"),
        ],
        createdAt: -1000 * 60 * 60 * 26,
      },
      {
        title: "Add empty and loading states to the mockups",
        notes:
          "The empty list, the skeleton and the error retry all need a screen.",
        listId: WORK_LIST,
        priority: "high",
        dueDate: seedDueDate(1),
        tags: ["design"],
        subtasks: [
          newSubtask("Empty-state illustration"),
          newSubtask("Annotate the skeleton spec"),
        ],
        createdAt: -1000 * 60 * 60 * 5,
      },
      {
        title: "Book the dentist follow-up",
        listId: LIFE_LIST,
        priority: "medium",
        dueDate: seedDueDate(-1),
        tags: ["health"],
        createdAt: -1000 * 60 * 60 * 72,
      },
      {
        title: "Buy coffee beans and oat milk",
        listId: SHOPPING_LIST,
        priority: "low",
        dueDate: seedDueDate(3),
        tags: ["groceries"],
        createdAt: -1000 * 60 * 90,
      },
      {
        title: "Finish chapter 3 of Designing Design",
        notes: "Note down two ideas worth borrowing for this project.",
        listId: LIFE_LIST,
        priority: "low",
        starred: true,
        tags: ["reading"],
        createdAt: -1000 * 60 * 60 * 50,
      },
      {
        title: "Tidy up last week's meeting notes",
        listId: WORK_LIST,
        priority: "medium",
        done: true,
        completedAt: -1000 * 60 * 60 * 20,
        tags: ["teamwork"],
        createdAt: -1000 * 60 * 60 * 60,
      },
    ],
  },
};

/**
 * `createdAt` / `completedAt` in the seed table are **offsets** from now, not
 * timestamps: they are written once at module load, but must resolve against
 * the moment the app actually starts, so the demo always looks "today".
 */
function seedTodos(lang: Language): Todo[] {
  const now = Date.now();
  return SEED[lang].todos.map((partial) => ({
    id: uid("todo"),
    title: partial.title,
    notes: partial.notes ?? "",
    done: partial.done ?? false,
    starred: partial.starred ?? false,
    priority: partial.priority ?? "medium",
    dueDate: partial.dueDate ?? null,
    listId: partial.listId,
    tags: partial.tags ?? [],
    subtasks: partial.subtasks ?? [],
    recur: partial.recur ?? null,
    createdAt: now + (partial.createdAt ?? 0),
    completedAt:
      partial.completedAt == null ? null : now + partial.completedAt,
  }));
}

function initialState(lang: Language): PersistedState {
  return {
    version: 1,
    todos: seedTodos(lang),
    lists: SEED[lang].lists,
  };
}

function load(lang: Language): PersistedState {
  if (typeof window === "undefined") return initialState(lang);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState(lang);
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!Array.isArray(parsed.todos) || !Array.isArray(parsed.lists)) {
      return initialState(lang);
    }
    return {
      version: 1,
      todos: parsed.todos,
      lists: parsed.lists.length > 0 ? parsed.lists : SEED[lang].lists,
    };
  } catch {
    return initialState(lang);
  }
}

/**
 * Todo state with localStorage persistence.
 *
 * Every mutation is expressed as an action so the persistence effect stays a
 * single, obvious write. Destructive actions return the removed records so the
 * caller can offer an undo toast.
 */
export function useTodoStore(lang: Language) {
  /*
   * Lazy initialiser on purpose: `load` reads localStorage and, on a fresh
   * install, seeds demo content in `lang`. It must run exactly once — if it ran
   * on every render, the `uid()`-based ids would change constantly.
   *
   * Deliberately *not* keyed on `lang`: the seed is created once, for whatever
   * language the app opened in, and everything after that is user data.
   * Switching to English must not rewrite the user's lists.
   */
  const [state, setState] = useState<PersistedState>(() => load(lang));
  const first = useRef(true);

  useEffect(() => {
    // Skip the very first write: `load()` already mirrors storage.
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — the app keeps working in memory */
    }
  }, [state]);

  const patchTodos = useCallback((fn: (todos: Todo[]) => Todo[]) => {
    setState((s) => ({ ...s, todos: fn(s.todos) }));
  }, []);

  const addTodo = useCallback(
    (draft: TodoDraft): Todo => {
      const todo: Todo = {
        id: uid("todo"),
        title: draft.title.trim(),
        notes: draft.notes.trim(),
        done: false,
        starred: false,
        priority: draft.priority,
        dueDate: draft.dueDate,
        listId: draft.listId,
        tags: draft.tags,
        subtasks: draft.subtasks,
        recur: draft.recur,
        createdAt: Date.now(),
        completedAt: null,
      };
      patchTodos((todos) => [todo, ...todos]);
      return todo;
    },
    [patchTodos]
  );

  const updateTodo = useCallback(
    (id: string, patch: Partial<Todo>) => {
      patchTodos((todos) =>
        todos.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
    },
    [patchTodos]
  );

  /**
   * Toggles a task, and — when the toggle *completes* a repeating one — spawns
   * its next occurrence straight after it.
   *
   * Returns the spawned task so the caller can offer an undo toast. The spawn
   * is resolved from current state *outside* the updater (the same pattern
   * `removeTodo` uses) because updater functions run during commit, not at
   * call time, and a return value has to be known now.
   *
   * The next occurrence is a fresh task, not the same one rolled forward: the
   * completed instance stays in 已完成 as history, and the new one starts with
   * an unticked checklist. Un-completing never spawns anything.
   */
  const toggleTodo = useCallback(
    (id: string): Todo | undefined => {
      const target = state.todos.find((t) => t.id === id);
      if (!target) return undefined;
      const completing = !target.done;
      const spawned = completing ? spawnNextOccurrence(target) : undefined;

      patchTodos((todos) => {
        const toggled = todos.map((t) =>
          t.id === id
            ? {
                ...t,
                done: !t.done,
                completedAt: !t.done ? Date.now() : null,
                // Completing a task completes its checklist too.
                subtasks: !t.done
                  ? t.subtasks.map((s) => ({ ...s, done: true }))
                  : t.subtasks,
              }
            : t
        );
        return spawned ? insertAfter(toggled, id, spawned) : toggled;
      });

      return spawned;
    },
    [patchTodos, state.todos]
  );

  const toggleStar = useCallback(
    (id: string) => {
      patchTodos((todos) =>
        todos.map((t) => (t.id === id ? { ...t, starred: !t.starred } : t))
      );
    },
    [patchTodos]
  );

  /**
   * Ticks one box. The parent follows its checklist — all boxes ticked ⇒ task
   * done — and completing the parent this way is still a completion: a
   * repeating task spawns its next occurrence here exactly as it would have
   * from the checkbox on the card, so the two completion paths stay in step.
   */
  const toggleSubtask = useCallback(
    (todoId: string, subtaskId: string): Todo | undefined => {
      const target = state.todos.find((t) => t.id === todoId);
      // Only a transition *into* done spawns; ticking a box on an already
      // complete parent (or unticking one) never does.
      const willComplete =
        target != null &&
        !target.done &&
        target.subtasks.some((s) => s.id === subtaskId && !s.done) &&
        target.subtasks.filter((s) => s.id !== subtaskId).every((s) => s.done);
      const spawned = willComplete ? spawnNextOccurrence(target) : undefined;

      patchTodos((todos) => {
        const mapped = todos.map((t) => {
          if (t.id !== todoId) return t;
          const subtasks = t.subtasks.map((s) =>
            s.id === subtaskId ? { ...s, done: !s.done } : s
          );
          const allDone = subtasks.length > 0 && subtasks.every((s) => s.done);
          return {
            ...t,
            subtasks,
            done: allDone,
            completedAt: allDone ? t.completedAt ?? Date.now() : null,
          };
        });
        return spawned ? insertAfter(mapped, todoId, spawned) : mapped;
      });

      return spawned;
    },
    [patchTodos, state.todos]
  );

  const removeTodo = useCallback(
    (id: string): Todo | undefined => {
      const target = state.todos.find((t) => t.id === id);
      patchTodos((todos) => todos.filter((t) => t.id !== id));
      return target;
    },
    [patchTodos, state.todos]
  );

  const duplicateTodo = useCallback(
    (id: string): Todo | undefined => {
      const source = state.todos.find((t) => t.id === id);
      if (!source) return undefined;
      const copy: Todo = {
        ...source,
        id: uid("todo"),
        title: translate(lang, "todo.duplicateTitle", { title: source.title }),
        done: false,
        completedAt: null,
        createdAt: Date.now(),
        subtasks: source.subtasks.map((s) => newSubtask(s.title)),
      };
      patchTodos((todos) => {
        const index = todos.findIndex((t) => t.id === id);
        const next = [...todos];
        next.splice(index + 1, 0, copy);
        return next;
      });
      return copy;
    },
    [patchTodos, state.todos, lang]
  );

  const restoreTodos = useCallback(
    (restored: Todo[]) => {
      if (restored.length === 0) return;
      patchTodos((todos) => {
        const existing = new Set(todos.map((t) => t.id));
        return [...restored.filter((t) => !existing.has(t.id)), ...todos];
      });
    },
    [patchTodos]
  );

  const clearCompleted = useCallback((): Todo[] => {
    const removed = state.todos.filter((t) => t.done);
    patchTodos((todos) => todos.filter((t) => !t.done));
    return removed;
  }, [patchTodos, state.todos]);

  /* ── Lists ───────────────────────────────────────────────── */

  const addList = useCallback((name: string, color: TodoList["color"]): TodoList => {
    const list: TodoList = { id: uid("list"), name: name.trim(), color };
    setState((s) => ({ ...s, lists: [...s.lists, list] }));
    return list;
  }, []);

  const updateList = useCallback((id: string, patch: Partial<TodoList>) => {
    setState((s) => ({
      ...s,
      lists: s.lists.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }, []);

  /**
   * Deletes a list and re-homes its tasks.
   *
   * The fallback list is resolved synchronously from current state (not inside
   * the updater) so the caller gets a usable id back — React runs updater
   * functions during commit, not at call time.
   */
  const removeList = useCallback(
    (id: string): { movedTo: string } => {
      const remaining = state.lists.filter((l) => l.id !== id);
      const fallback = remaining[0]?.id ?? FALLBACK_LIST_ID;
      setState((s) => ({
        ...s,
        // Deleting the very last list re-seeds the defaults rather than leaving
        // the app with no list to add a task to.
        lists: remaining.length > 0 ? remaining : SEED[lang].lists,
        todos: s.todos.map((t) =>
          t.listId === id ? { ...t, listId: fallback } : t
        ),
      }));
      return { movedTo: fallback };
    },
    [state.lists, lang]
  );

  return {
    todos: state.todos,
    lists: state.lists,
    addTodo,
    updateTodo,
    toggleTodo,
    toggleStar,
    toggleSubtask,
    removeTodo,
    duplicateTodo,
    restoreTodos,
    clearCompleted,
    addList,
    updateList,
    removeList,
  };
}

export type TodoStore = ReturnType<typeof useTodoStore>;
