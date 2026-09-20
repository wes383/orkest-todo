import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  ClipboardList,
  Plus,
  SearchX,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyIcon,
  EmptyTitle,
} from "@/components/ui/empty";
import { FocusView } from "@/components/focus/focus-view";
import { CommandPalette, PALETTE_ICONS, type PaletteCommand } from "@/components/command-palette";
import { VirtualTodoList } from "@/components/todo/virtual-todo-list";
import { useAppTheme } from "@/components/theme-provider";
import { useGlobalShortcuts } from "@/lib/global-shortcut";
/*
 * Code-split the screens that are not the task list: they are heavy (charts,
 * settings forms) and most sessions never open them. The main bundle keeps the
 * tasks screen; each lazy chunk arrives the first time its screen is picked.
 */
const FocusStats = lazy(() =>
  import("@/components/focus/focus-stats").then((m) => ({ default: m.FocusStats }))
);
const SettingsView = lazy(() =>
  import("@/components/settings/settings-view").then((m) => ({ default: m.SettingsView }))
);
/*
 * The editor brings the date/time pickers and react-day-picker with it —
 * none of which the task list needs. It renders only while open, so the chunk
 * loads on the first open and never before.
 */
const TodoEditorDialog = lazy(() =>
  import("@/components/todo/todo-editor-dialog").then((m) => ({
    default: m.TodoEditorDialog,
  }))
);
import { Sidebar } from "@/components/todo/sidebar";
import { Toolbar } from "@/components/todo/toolbar";
import { BlankAreaMenu } from "@/components/todo/blank-area-menu";
import { QuickAdd, type QuickAddHandle } from "@/components/todo/quick-add";
import { TodoItem } from "@/components/todo/todo-item";
import { ListDialog } from "@/components/todo/list-dialog";
import { useBrowserGuards } from "@/lib/browser-guards";
import type { QuickInput } from "@/lib/quick-input";
import {
  DEFAULT_FILTERS,
  collectTags,
  computeStats,
  effectiveStatus,
  groupByDue,
  listCounts as computeListCounts,
  selectTodos,
  viewCounts,
  viewImpliedStatus,
  type Filters,
} from "@/lib/selectors";
import { useTodoStore, type TodoDraft } from "@/lib/store";
import { useFocusStore } from "@/lib/focus-store";
import { useFocusWidgetBridge, useFocusWidgetVisibility } from "@/lib/focus-widget";
import { useAchievementToasts } from "@/lib/achievement-toasts";
import { useAutostart } from "@/lib/autostart";
import { useFocusSync } from "@/lib/sync/engine";
import { useCloseToTray, useQuitStopsFocus } from "@/lib/quit";
import { useSettings } from "@/lib/settings";
import { useTodayISO } from "@/lib/use-today";
import { useTrayBridge, type TrayCommand } from "@/lib/tray";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import type { PaletteName, Screen, Todo, TodoList, ViewId } from "@/lib/types";

/**
 * Titles only. Views used to carry a one-line hint too, but for the default
 * `all` view it just restated the title ("全部任务 / 所有还未归档的想法与待办")
 * while every other title is self-describing, so the subtitle slot now shows
 * the date instead — ambient information that is never redundant.
 *
 * The keys are the sidebar's own `view.*` messages, so the two surfaces that
 * name a view cannot drift apart.
 */
const VIEW_TITLE_KEYS: Record<ViewId, MessageKey> = {
  all: "view.all",
  today: "view.today",
  upcoming: "view.upcoming",
  overdue: "view.overdue",
  starred: "view.starred",
  completed: "view.completed",
};

export default function App() {
  const { t, language, setLanguage } = useI18n();
  // The webview stays a desktop window: no context menu, no browser chords,
  // no zoom. Runs before anything else below can mount.
  useBrowserGuards();
  const store = useTodoStore(language);
  const {
    todos,
    lists,
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
  } = store;

  /** Sidebar view visibility and the focus rules, persisted; the settings page
      edits them and the sidebar and the focus log read them, so the state
      lives here between them. Declared before the focus store: the store's
      auto-stop timer takes its cap from here. */
  const {
    settings,
    setViewVisible,
    setSpanLimits,
    setWidgetOpacity,
    setQuitStopsFocus,
    setCloseToTray,
    setGlobalShortcuts,
    setHideShortcutHints,
  } = useSettings();

  /*
   * The focus log, live — held here rather than inside the focus view so that
   * the session keeps running on the real clock no matter which screen is
   * showing. Closed away behind the todo list it is still a session: the switch
   * is a fact about the day, not about which tab happens to be open, and the
   * store's own timer is what closes a forgotten one at the cap.
   */
  /** The cap the running auto-stop timer is armed with, from settings — handed
      in so a change there re-arms the timer instead of leaving the old limit. */
  const focus = useFocusStore(settings.maxSpanHours * 3_600_000);

  // A milestone earned anywhere in the app announces itself, corner-side —
  // the log is watched here, not in the stats page, so the toast does not
  // wait for the reader to go looking for it.
  useAchievementToasts(focus.spans, language);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  /** Which screen fills the space beside the sidebar — the task list, the
      focus switch, the statistics, or settings. One at a time, never layered:
      each is a place, and picking another is how you leave. */
  const [screen, setScreen] = useState<Screen>("todos");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The OS-wide chord, live only while the setting says so — the registration
  // is a claim on the OS, so it must die the moment the switch flips off.
  useGlobalShortcuts(settings.globalShortcuts);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const quickAddRef = useRef<QuickAddHandle | null>(null);
  /*
   * The quick-add field lives on the tasks screen alone, so a request to focus
   * it can arrive while it does not exist — the tray's 新建任务 while settings
   * or the statistics fill the window. The count is a rendezvous: bumping it
   * schedules a focus for after the screen has switched back and React has
   * mounted the field, when the ref finally points at something.
   */
  const [quickAddFocusTicket, setQuickAddFocusTicket] = useState(0);

  useEffect(() => {
    if (quickAddFocusTicket > 0) {
      quickAddRef.current?.focus();
    }
  }, [quickAddFocusTicket]);

  /*
   * 快速添加 — the inline field, reached the same way from all three doors: the
   * palette, the tray's 新建任务 and ⌃⇧N.
   *
   * The screen goes back to the tasks first even when it is already there: the
   * field lives on that screen alone, and bumping the ticket *is* the focus
   * request — read by the effect above, which runs after the commit that
   * mounted the field and left the ref pointing at it. A branch that skipped
   * the bump and called `quickAddRef.current?.focus()` directly would only be
   * right on the one screen it was written for.
   *
   * Stable on purpose: the key listener below is attached once, so anything it
   * read out of state would be the state of the render that attached it.
   */
  const focusQuickAdd = useCallback(() => {
    setScreen("todos");
    setQuickAddFocusTicket((n) => n + 1);
  }, []);

  /* ── Derived data ────────────────────────────────────────── */

  /*
   * `stats`, `counts` and `visible` all classify against the current date
   * (`todayISO()` / `daysFromToday` inside `selectors.ts`) — they are the
   * 今天 / 已逾期 / 即将到期 buckets. Reading the clock inside a memo means the
   * result is only as fresh as the last dependency change, so `today` is listed
   * as a dependency even though it is never read here: its only job is to
   * expire these three when the day rolls over. Without it the tray-resident
   * instance keeps yesterday's numbers until the user happens to touch a task.
   *
   * `listCounts` and `tags` are date-independent and stay keyed on `todos`
   * (though `tags` still takes the language, for its sort order).
   */
  const today = useTodayISO();

  const stats = useMemo(() => computeStats(todos), [todos, today]);
  const counts = useMemo(() => viewCounts(todos), [todos, today]);
  const listCounts = useMemo(() => computeListCounts(todos), [todos]);
  const tags = useMemo(() => collectTags(todos, language), [todos, language]);
  const visible = useMemo(
    () => selectTodos(todos, filters, language),
    [todos, filters, today, language]
  );

  const grouped = useMemo(() => {
    const canGroup = filters.sort === "due" && filters.query.trim() === "";
    return canGroup ? groupByDue(visible, language) : null;
  }, [visible, filters.sort, filters.query, language]);

  const activeList = filters.listId
    ? lists.find((l) => l.id === filters.listId)
    : undefined;

  const heading = activeList
    ? activeList.name
    : t(VIEW_TITLE_KEYS[filters.view]);

  /**
   * A status filter only narrows anything in the 全部任务 scope. Every other view
   * already pins the status — four of them show unfinished work only, 已完成
   * shows finished work only — so counting it here would advertise a filter that
   * cannot change the list, and the control itself is hidden down in the toolbar.
   */
  const statusApplies = viewImpliedStatus(filters.view) === null;

  const activeFilterCount =
    (filters.priority !== "all" ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.query.trim() ? 1 : 0) +
    (statusApplies && filters.status !== "all" ? 1 : 0);

  /**
   * Whether the list on screen is made up entirely of finished tasks — reached
   * either through the sidebar's 已完成 view or, in 全部任务, through the status
   * tab. "清理已完成" is only offered then: it is a destructive action, and it
   * should act on what the user is actually looking at.
   */
  const canClearCompleted =
    effectiveStatus(filters) === "completed" &&
    stats.done > 0 &&
    visible.length > 0;

  /**
   * True when the list foot would print the same number twice.
   *
   * In the plain 已完成 scope the count line and the clear button's badge are
   * the same fact: every finished task is on screen, so `visible.length` and
   * `stats.done` agree. Only one of them should be printed.
   *
   * They diverge the moment another filter narrows the list — a list, a tag, a
   * search — because the button always acts on *every* finished task while the
   * count describes the rows on screen. In that case both are shown, since they
   * are no longer saying the same thing.
   */
  const footCountIsRepeated =
    canClearCompleted && visible.length === stats.done;

  /** List a brand-new task should land in. */
  const targetListId = filters.listId ?? lists[0]?.id ?? "";
  const targetListName =
    lists.find((l) => l.id === targetListId)?.name ?? t("list.defaultName");

  const listById = useMemo(() => {
    const map = new Map<string, TodoList>();
    lists.forEach((l) => map.set(l.id, l));
    return map;
  }, [lists]);

  /**
   * Whether a task's list name is worth printing on its row.
   *
   * This used to be a bare `filters.listId === null`, so every row in 全部任务
   * repeated its list name even when the whole view belonged to one list —
   * five identical labels down the column, none of them telling you anything.
   * The name only earns its place when the rows on screen actually differ, so
   * it now shows up exactly when it disambiguates.
   */
  const showRowList = useMemo(
    () =>
      filters.listId === null && new Set(visible.map((t) => t.listId)).size > 1,
    [filters.listId, visible]
  );

  /* ── Actions ─────────────────────────────────────────────── */

  const patchFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters((f) => ({ ...DEFAULT_FILTERS, view: f.view, listId: f.listId }));
  }, []);

  /*
   * Picking anything in the sidebar is also the way out of the focus screen:
   * the two are alternatives for the same space, and asking for a list of tasks
   * while the switch is up can only mean "show me the tasks".
   */
  const selectView = useCallback((view: ViewId) => {
    setScreen("todos");
    setFilters({ ...DEFAULT_FILTERS, view });
  }, []);

  const selectList = useCallback((listId: string | null) => {
    setScreen("todos");
    setFilters({ ...DEFAULT_FILTERS, listId });
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((todo: Todo) => {
    setEditing(todo);
    setEditorOpen(true);
  }, []);

  /*
   * Starting focus files the stretch under the list of the most recent
   * stretch — the thing the user was last focusing on — rather than the
   * sidebar's current selection. A list that has since been deleted falls
   * back to unassigned. Before the first ever session there is nothing to
   * remember, so that first stretch is unassigned too.
   */
  const lastFocusListId = useMemo(() => {
    const last = focus.spans[focus.spans.length - 1];
    if (!last) return null;
    return lists.some((list) => list.id === last.listId) ? last.listId : null;
  }, [focus.spans, lists]);

  /*
   * The tray menu's click handler. Rust has already brought the window to the
   * front by the time this runs — all that is left is the part the native side
   * cannot express: what 今天 means, where the caret should go, and which way
   * the focus switch should now stand.
   */
  const handleTrayCommand = useCallback(
    (command: TrayCommand) => {
      if (command.action === "new-task") {
        /*
         * The inline field, not the full editor: the tray's 新建任务 row is the
         * fast path, the same surface the empty state points at and the same
         * one ⌃⇧N leads to, so a task caught from the tray lands the way a task
         * caught from the keyboard does. Ctrl+N opens the full editor instead —
         * the one door that asks for more than a title.
         *
         * Nothing here raises the window: the tray's row calls
         * `reveal_main_window` in Rust before emitting this, and the global
         * chord that used to arrive from anywhere is gone.
         */
        focusQuickAdd();
        return;
      }

      if (command.action === "toggle-focus") {
        /*
         * The exact move the focus screen's own switch makes — same store, same
         * list filing (`lastFocusListId`, the most recent stretch's list) —
         * only fired from behind the window, which stays wherever it is.
         */
        focus.commit(
          focus.state === "useful" ? "idle" : "useful",
          lastFocusListId
        );
        return;
      }

      selectView(command.view);
    },
    [selectView, focus.commit, focus.state, lastFocusListId, focusQuickAdd]
  );

  useTrayBridge(counts, language, focus.state === "useful", handleTrayCommand);

  /*
   * 退出时自动结束专注 — the tray's 退出 is asked for, not taken, so that this
   * can answer it: the setting decides, and `stopForExit` closes the session
   * and writes it before the process goes. Off by default, in which case the
   * quit is simply answered straight away.
   *
   * The ✕ goes through the same ask whenever 「关闭窗口时最小化到托盘」 is off, so
   * one rule covers both ways out — which is why the close switch is pushed down
   * from here too: Rust has to know which of the two the ✕ is before it can
   * answer it.
   */
  useQuitStopsFocus(settings.quitStopsFocus, focus.stopForExit);
  useCloseToTray(settings.closeToTray);

  const focusWidget = useFocusWidgetVisibility();
  /** 开机自启 lives in the OS, not in a store here — the hook reads it from
      there and writes back to it; see `autostart.ts`. */
  const autostart = useAutostart();
  /** 同步 — the desktop half of the focus sync, held here the way `autostart`
      is so the settings page gets one handle and nothing else needs to know
      it exists; see `sync/engine.ts` for the cycle it runs. */
  const sync = useFocusSync(focus, lists, settings);
  // The widget's appearance is published with everything else it needs, so the
  // pill dims the moment the slider moves rather than on the next re-request.
  useFocusWidgetBridge(focus, language, lists, lastFocusListId, settings.widgetOpacity);

  const handleQuickAdd = useCallback(
    (draft: QuickInput) => {
      const todo = addTodo({
        title: draft.title,
        notes: "",
        // `p#` from the quick-add syntax, else keep the app's usual default.
        priority: draft.priority ?? "medium",
        dueDate: null,
        listId: targetListId,
        tags: draft.tags,
        subtasks: [],
        recur: null,
      });
      toast.success(t("toast.taskAdded"), {
        description: t("toast.taskAddedBody", {
          title: todo.title,
          list: targetListName,
        }),
        action: {
          label: t("common.undo"),
          onClick: () => removeTodo(todo.id),
        },
      });
    },
    [addTodo, removeTodo, targetListId, targetListName, t]
  );

  const handleEditorSubmit = useCallback(
    (draft: TodoDraft) => {
      if (editing) {
        updateTodo(editing.id, {
          title: draft.title.trim(),
          notes: draft.notes.trim(),
          priority: draft.priority,
          dueDate: draft.dueDate,
          listId: draft.listId,
          tags: draft.tags,
          subtasks: draft.subtasks,
          recur: draft.recur,
        });
        toast(t("toast.taskUpdated"), { description: draft.title.trim() });
      } else {
        addTodo(draft);
        toast.success(t("toast.taskCreated"), {
          description: draft.title.trim(),
        });
      }
    },
    [addTodo, editing, updateTodo, t]
  );

  const handleDelete = useCallback(
    (todo: Todo) => {
      removeTodo(todo.id);
      toast(t("toast.taskDeleted"), {
        description: todo.title,
        action: { label: t("common.undo"), onClick: () => restoreTodos([todo]) },
      });
    },
    [removeTodo, restoreTodos, t]
  );

  const handleDuplicate = useCallback(
    (todo: Todo) => {
      const copy = duplicateTodo(todo.id);
      if (!copy) return;
      toast.success(t("toast.taskDuplicated"), {
        description: copy.title,
        action: { label: t("common.undo"), onClick: () => removeTodo(copy.id) },
      });
    },
    [duplicateTodo, removeTodo, t]
  );

  /**
   * The one completion path. A repeating task completed here leaves its next
   * occurrence behind, and the toast names that fact — with an undo that
   * simply deletes the spawned task, leaving the original completed.
   */
  const handleToggle = useCallback(
    (id: string) => {
      const spawned = toggleTodo(id);
      if (!spawned) return;
      toast.success(t("toast.recurSpawned"), {
        description: spawned.title,
        action: {
          label: t("common.undo"),
          onClick: () => removeTodo(spawned.id),
        },
      });
    },
    [toggleTodo, removeTodo, t]
  );

  /** The checklist's way of completing a parent — same spawn-and-toast as the
      checkbox above, so the two paths never drift apart. */
  const handleToggleSubtask = useCallback(
    (todoId: string, subtaskId: string) => {
      const spawned = toggleSubtask(todoId, subtaskId);
      if (!spawned) return;
      toast.success(t("toast.recurSpawned"), {
        description: spawned.title,
        action: {
          label: t("common.undo"),
          onClick: () => removeTodo(spawned.id),
        },
      });
    },
    [toggleSubtask, removeTodo, t]
  );

  const handleClearCompleted = useCallback(() => {
    const removed = clearCompleted();
    setConfirmClearOpen(false);
    if (removed.length === 0) return;
    toast.success(t("toast.cleared", { n: removed.length }), {
      description: t("toast.clearedBody"),
      action: { label: t("common.undo"), onClick: () => restoreTodos(removed) },
    });
  }, [clearCompleted, restoreTodos, t]);

  const handleListSubmit = useCallback(
    (name: string, color: PaletteName) => {
      if (editingList) {
        updateList(editingList.id, { name, color });
        toast(t("toast.listUpdated"), { description: name });
      } else {
        const list = addList(name, color);
        toast.success(t("toast.listCreated"), { description: list.name });
      }
      setEditingList(null);
    },
    [addList, editingList, updateList, t]
  );

  const handleListDelete = useCallback(
    (list: TodoList) => {
      /*
       * The last list stays. The sidebar already refuses it in the UI (it shows
       * a dialog with no way through), but the rule belongs here too: any later
       * caller — tray, widget, a command palette — must not reach `removeList`'s
       * floor behaviour, which re-seeds the default lists and so makes the
       * delete look ignored rather than refused.
       */
      if (lists.length <= 1) {
        toast(t("sidebar.deleteLastTitle", { name: list.name }), {
          description: t("sidebar.deleteLastBody"),
        });
        return;
      }
      const { movedTo } = removeList(list.id);
      /*
       * The tasks move to a fallback list; the hours do not. A task re-homed is
       * still the same task, but time spent on 工作 did not become time spent on
       * whatever list happened to be first — so the log keeps those sessions and
       * only forgets the label, which is what the unassigned bucket is for.
       */
      focus.forgetList(list.id);
      // Written straight into the filters rather than through `selectList`: that
      // one is also the way out of the focus screen, and deleting the list you
      // were looking at is no reason to leave it.
      if (filters.listId === list.id) {
        setFilters((f) => ({ ...f, listId: null }));
      }
      const target = lists.find((l) => l.id === movedTo);
      toast(t("toast.listDeleted"), {
        description: target
          ? t("toast.listDeletedMoved", { name: target.name })
          : t("toast.listDeletedReassigned"),
      });
    },
    [filters.listId, lists, removeList, focus, t]
  );

  /* ── Command palette ─────────────────────────────────────── */

  const { setTheme } = useAppTheme();

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const go = (next: Screen) => () => setScreen(next);
    const view = (v: ViewId) => () => selectView(v);
    return [
      {
        id: "new-task",
        labelKey: "cmd.newTask",
        icon: PALETTE_ICONS.plus,
        run: focusQuickAdd,
      },
      {
        id: "new-task-full",
        labelKey: "cmd.newTaskFull",
        icon: PALETTE_ICONS.plus,
        run: openCreate,
      },
      {
        id: "toggle-focus",
        labelKey: "cmd.toggleFocus",
        icon: PALETTE_ICONS.timer,
        run: () =>
          focus.commit(focus.state === "useful" ? "idle" : "useful", lastFocusListId),
      },
      { id: "go-focus", labelKey: "cmd.screen.focus", icon: PALETTE_ICONS.timer, run: go("focus") },
      { id: "go-stats", labelKey: "cmd.screen.stats", icon: PALETTE_ICONS.stats, run: go("stats") },
      { id: "go-settings", labelKey: "cmd.screen.settings", icon: PALETTE_ICONS.settings, run: go("settings") },
      { id: "view-all", labelKey: "cmd.view.all", icon: PALETTE_ICONS.list, run: view("all") },
      { id: "view-today", labelKey: "cmd.view.today", icon: PALETTE_ICONS.list, run: view("today") },
      { id: "view-upcoming", labelKey: "cmd.view.upcoming", icon: PALETTE_ICONS.list, run: view("upcoming") },
      { id: "view-overdue", labelKey: "cmd.view.overdue", icon: PALETTE_ICONS.list, run: view("overdue") },
      { id: "view-starred", labelKey: "cmd.view.starred", icon: PALETTE_ICONS.list, run: view("starred") },
      { id: "view-completed", labelKey: "cmd.view.completed", icon: PALETTE_ICONS.list, run: view("completed") },
      { id: "theme-light", labelKey: "cmd.theme.light", icon: PALETTE_ICONS.sun, run: () => setTheme("light") },
      { id: "theme-dark", labelKey: "cmd.theme.dark", icon: PALETTE_ICONS.moon, run: () => setTheme("dark") },
      { id: "theme-system", labelKey: "cmd.theme.system", icon: PALETTE_ICONS.system, run: () => setTheme("system") },
      {
        id: "language",
        labelKey: "cmd.language",
        icon: PALETTE_ICONS.language,
        run: () => setLanguage(language === "zh" ? "en" : "zh"),
      },
      {
        id: "clear-completed",
        labelKey: "cmd.clearCompleted",
        icon: PALETTE_ICONS.trash,
        run: () => setConfirmClearOpen(true),
      },
    ];
  }, [selectView, openCreate, focus, lastFocusListId, setTheme, setLanguage, language, focusQuickAdd]);

  /* ── Keyboard shortcuts ──────────────────────────────────── */

  /*
   * The window's own chords, on one listener attached once. Every branch
   * reaches for a ref, a setter or `focusQuickAdd` — all of them stable — so
   * nothing here can go stale between renders.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "k" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // The search field itself, not the palette. Ctrl+F is the chord a browser
      // would spend on its own find bar, and `browser-guards.ts` is what stops
      // that bar from opening on the way here.
      if (mod && key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      // Two doors to a task, and they are not the same door: Ctrl+Shift+N lands
      // in the inline field the way the tray's 新建任务 does, Ctrl+N opens the
      // full editor.
      if (mod && e.shiftKey && key === "n") {
        e.preventDefault();
        focusQuickAdd();
        return;
      }
      if (mod && key === "n") {
        e.preventDefault();
        setEditing(null);
        setEditorOpen(true);
        return;
      }
      // Esc inside the search box clears the query without leaving the field.
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setFilters((f) => (f.query ? { ...f, query: "" } : f));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusQuickAdd]);

  /* ── Render ──────────────────────────────────────────────── */

  const emptyState =
    todos.length === 0 ? (
      <Empty className="py-16">
        <EmptyIcon>
          <ClipboardList className="h-9 w-9" aria-hidden="true" />
        </EmptyIcon>
        <EmptyTitle>{t("app.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("app.emptyBody")}</EmptyDescription>
        <EmptyActions>
          <Button onClick={openCreate}>
            <Icon icon={Plus} size="sm" />
            {t("app.newTask")}
          </Button>
        </EmptyActions>
      </Empty>
    ) : (
      <Empty className="py-16">
        <EmptyIcon>
          <SearchX className="h-9 w-9" aria-hidden="true" />
        </EmptyIcon>
        <EmptyTitle>{t("app.noMatchTitle")}</EmptyTitle>
        <EmptyDescription>{t("app.noMatchBody")}</EmptyDescription>
        <EmptyActions>
          <Button variant="outline" onClick={resetFilters}>
            {t("app.clearFilters")}
          </Button>
          <Button variant="ghost" onClick={openCreate}>
            <Icon icon={Plus} size="sm" />
            {t("app.newTask")}
          </Button>
        </EmptyActions>
      </Empty>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          lists={lists}
          counts={counts}
          listCounts={listCounts}
          activeView={filters.view}
          activeListId={filters.listId}
          screen={screen}
          settings={settings}
          onSelectFocus={() => setScreen("focus")}
          onSelectStats={() => setScreen("stats")}
          onSelectSettings={() => setScreen("settings")}
          onSelectView={selectView}
          onHideView={(view) => setViewVisible(view, false)}
          onSelectList={selectList}
          onCreateList={() => {
            setEditingList(null);
            setListDialogOpen(true);
          }}
          onEditList={(list) => {
            setEditingList(list);
            setListDialogOpen(true);
          }}
          onDeleteList={handleListDelete}
        />

        {/*
         * The main area shows one screen at a time, never layered: each is a
         * place, and picking another is how you leave. The focus screen in
         * particular replaces the tasks rather than covering them, which is
         * what keeps the switch the only thing in view while a session runs.
         */}
        {screen === "focus" ? (
          <FocusView
            store={focus}
            lists={lists}
            defaultListId={lastFocusListId}
            onOpenStats={() => setScreen("stats")}
            hideShortcutHints={settings.hideShortcutHints}
          />
        ) : screen === "stats" ? (
          <Suspense fallback={<main className="h-full min-w-0 flex-1 bg-background" />}>
            <FocusStats
              spans={focus.spans}
              todos={todos}
              lists={lists}
              onReschedule={focus.reschedule}
              onSplit={focus.split}
              onDelete={focus.remove}
              onSetList={focus.setList}
              onAddManual={focus.addManual}
            />
          </Suspense>
        ) : screen === "settings" ? (
          <Suspense fallback={<main className="h-full min-w-0 flex-1 bg-background" />}>
            <SettingsView
              spans={focus.spans}
              todos={todos}
              lists={lists}
              settings={settings}
              setViewVisible={setViewVisible}
              setSpanLimits={setSpanLimits}
              setWidgetOpacity={setWidgetOpacity}
              setQuitStopsFocus={setQuitStopsFocus}
              setCloseToTray={setCloseToTray}
              setGlobalShortcuts={setGlobalShortcuts}
              setHideShortcutHints={setHideShortcutHints}
              autostart={autostart}
              focusWidget={focusWidget}
              sync={sync}
              onDeleteAllData={() => {
                store.clearAll();
                focus.clearAll();
              }}
            />
          </Suspense>
        ) : (
        <main className="flex min-w-0 flex-1 flex-col">
          {/*
           * Pinned header — the whole query surface, and nothing else.
           *
           * The view title used to sit here, and every count and the progress
           * bar before it. All of that was already stated elsewhere: the sidebar
           * highlights the active view and carries a live count for each one,
           * and its footer owns overall progress. The title survives as a
           * screen-reader-only <h1> so the page still has a name without
           * spending 60px of vertical space on saying it.
           *
           * A 新建任务 button used to close this row too. It is gone: creating a
           * task already has three entry points that are closer to the work —
           * the QuickAdd field below (whose 详细 button opens the full editor),
           * Ctrl+N, and the empty state. A fourth one pinned to the chrome was
           * the least contextual of the four.
           *
           * The toolbar moved up out of the scrolling body, so search, sort and
           * filter no longer slide away the moment a long list is scrolled. The
           * body is now only QuickAdd + rows.
           *
           * 清理已完成 is absent on purpose — it is destructive and only ever
           * acts on finished tasks, so it lives at the foot of the list, and
           * only while that list is showing completed work.
           *
           * `no-select` was dropped from this band: it sets `user-select: none`,
           * and the header now holds a real text field.
           */}
          <header className="shrink-0 border-b border-border px-8 py-3">
            <div className="mx-auto w-full max-w-[880px]">
              <h1 className="sr-only">{heading}</h1>

              <Toolbar
                filters={filters}
                tags={tags}
                activeFilterCount={activeFilterCount}
                hideShortcutHints={settings.hideShortcutHints}
                searchRef={searchRef}
                onChange={patchFilters}
                onReset={resetFilters}
              />
            </div>
          </header>

          {/* Body */}
          <BlankAreaMenu
            filters={filters}
            tags={tags}
            onChange={patchFilters}
            onCreate={openCreate}
          >
            <ScrollArea className="flex-1">
            <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-8 py-5">
              <QuickAdd
                ref={quickAddRef}
                listName={targetListName}
                onAdd={handleQuickAdd}
                onOpenFullEditor={openCreate}
                hideShortcutHints={settings.hideShortcutHints}
              />

              {visible.length === 0 ? (
                emptyState
              ) : (
                <VirtualTodoList
                  items={visible}
                  groups={grouped}
                  renderTodo={(todo) => (
                    <TodoItem
                      todo={todo}
                      list={listById.get(todo.listId)}
                      showList={showRowList}
                      onToggle={() => handleToggle(todo.id)}
                      onStar={() => toggleStar(todo.id)}
                      onToggleSubtask={(subId) =>
                        handleToggleSubtask(todo.id, subId)
                      }
                      onEdit={() => openEdit(todo)}
                      onDuplicate={() => handleDuplicate(todo)}
                      onDelete={() => handleDelete(todo)}
                      onSetPriority={(p) => updateTodo(todo.id, { priority: p })}
                      onSetDue={(d) =>
                        // Clearing the date un-anchors any repeat, keeping the invariant
                        // "recurring ⇒ has a due date" true everywhere, not just in the editor.
                        updateTodo(todo.id, d ? { dueDate: d } : { dueDate: null, recur: null })
                      }
                    />
                  )}
                />
              )}

              {/*
               * List foot — the result count, and the one action that applies to
               * the whole list.
               *
               * The count used to close the toolbar row, immediately after the
               * 筛选 button, where it read as part of that control. It describes
               * what the filters *produced*, so it belongs to the list, not to
               * the row of controls that narrowed it. Not rendered on an empty
               * list — the empty state already says as much.
               */}
              {visible.length > 0 && (
                <div className="flex flex-col items-center gap-3 pt-1">
                  {!footCountIsRepeated && (
                    <p className="font-mono text-xs tabular-nums text-foreground-faint">
                      {t("app.itemCount", { n: visible.length })}
                    </p>
                  )}

                  {/*
                   * Clearing is offered only here, where every row above it is
                   * something the action will actually remove. Its badge counts
                   * finished tasks across the whole store, not the visible
                   * rows, because that is what the action deletes.
                   */}
                  {canClearCompleted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmClearOpen(true)}
                    >
                      <Icon icon={Trash2} size="sm" />
                      {t("app.clearCompleted")}
                      <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                        {stats.done}
                      </span>
                    </Button>
                  )}
                </div>
              )}
            </div>
            </ScrollArea>
          </BlankAreaMenu>
        </main>
        )}
      </div>

      {/* Dialogs — the palette and the list dialog are always in the tree
          (their mounts must be instant); the task editor loads on its first
          open. Rendering a lazy component behind `editorOpen` delays the
          import until the first time the dialog has a reason to exist. */}
      {editorOpen && (
        <Suspense fallback={null}>
          <TodoEditorDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            todo={editing}
            lists={lists}
            defaultListId={editing?.listId ?? targetListId}
            hideShortcutHints={settings.hideShortcutHints}
            onSubmit={handleEditorSubmit}
          />
        </Suspense>
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={paletteCommands}
        onQuickAdd={handleQuickAdd}
        hideShortcutHints={settings.hideShortcutHints}
      />

      <ListDialog
        open={listDialogOpen}
        onOpenChange={(open) => {
          setListDialogOpen(open);
          if (!open) setEditingList(null);
        }}
        editing={editingList}
        onSubmit={handleListSubmit}
      />

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("app.clearCompletedTitle", { n: stats.done })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("app.clearCompletedBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Icon icon={Undo2} size="sm" />
              {t("app.reconsider")}
            </AlertDialogCancel>
            <AlertDialogAction destructive onClick={handleClearCompleted}>
              {t("app.clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </TooltipProvider>
  );
}
