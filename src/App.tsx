import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Sidebar } from "@/components/todo/sidebar";
import { Toolbar } from "@/components/todo/toolbar";
import { QuickAdd, type QuickAddHandle } from "@/components/todo/quick-add";
import { TodoItem } from "@/components/todo/todo-item";
import {
  TodoEditorDialog,
} from "@/components/todo/todo-editor-dialog";
import { ListDialog } from "@/components/todo/list-dialog";
import { cn } from "@/lib/utils";
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
import { useTodayISO } from "@/lib/use-today";
import { useTrayBridge, type TrayCommand } from "@/lib/tray";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import type { PaletteName, Todo, TodoList, ViewId } from "@/lib/types";

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
  const { t, language } = useI18n();
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

  /*
   * The focus log, live — held here rather than inside the focus view so that
   * the session keeps running on the real clock no matter which screen is
   * showing. Closed away behind the todo list it is still a session: the switch
   * is a fact about the day, not about which tab happens to be open, and the
   * store's own timer is what closes a forgotten one at the cap.
   */
  const focus = useFocusStore();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  /** Whether the focus screen owns the main area. The sidebar never goes away
      — it is the way back — so this only decides what fills the space beside
      it. */
  const [focusMode, setFocusMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const quickAddRef = useRef<QuickAddHandle | null>(null);

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
    setFocusMode(false);
    setFilters({ ...DEFAULT_FILTERS, view });
  }, []);

  const selectList = useCallback((listId: string | null) => {
    setFocusMode(false);
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
   * The tray menu's click handler. Rust has already brought the window to the
   * front by the time this runs — all that is left is the part the native side
   * cannot express: what 今天 means, and where the caret should go.
   */
  const handleTrayCommand = useCallback(
    (command: TrayCommand) => {
      if (command.action === "new-task") {
        /*
         * The inline field, not the full editor. It is the app's fast path — the
         * same surface Ctrl+N leads to and the same one the empty state points
         * at — so a task caught from the tray lands identically to one caught
         * from the window.
         */
        quickAddRef.current?.focus();
        return;
      }

      selectView(command.view);
    },
    [selectView]
  );

  useTrayBridge(counts, language, handleTrayCommand);

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

  /* ── Keyboard shortcuts ──────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
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
  }, []);

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
          focusMode={focusMode}
          onSelectFocus={() => setFocusMode(true)}
          stats={stats}
          onSelectView={selectView}
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
         * The main area is one of two screens, never both. The focus screen is
         * not a layer over the tasks — it replaces them — which is what keeps
         * the switch the only thing in view while a session is running.
         */}
        {focusMode ? (
          <FocusView
            store={focus}
            lists={lists}
            sidebarListId={filters.listId}
          />
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
                searchRef={searchRef}
                onChange={patchFilters}
                onReset={resetFilters}
              />
            </div>
          </header>

          {/* Body */}
          <ScrollArea className="flex-1">
            <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-8 py-5">
              <QuickAdd
                ref={quickAddRef}
                listName={targetListName}
                onAdd={handleQuickAdd}
                onOpenFullEditor={openCreate}
              />

              {visible.length === 0 ? (
                emptyState
              ) : grouped ? (
                <div className="flex flex-col gap-6">
                  {grouped.map((group) => (
                    <section key={group.key} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-1">
                        <h2
                          className={cn(
                            "text-[13px] font-medium tracking-wide",
                            group.key === "overdue"
                              ? "text-red"
                              : "text-foreground-muted"
                          )}
                        >
                          {group.label}
                        </h2>
                        <span className="font-mono text-[11px] tabular-nums text-foreground-faint">
                          {group.todos.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.todos.map((todo) => (
                          <TodoItem
                            key={todo.id}
                            todo={todo}
                            list={listById.get(todo.listId)}
                            showList={showRowList}
                            onToggle={() => toggleTodo(todo.id)}
                            onStar={() => toggleStar(todo.id)}
                            onToggleSubtask={(subId) =>
                              toggleSubtask(todo.id, subId)
                            }
                            onEdit={() => openEdit(todo)}
                            onDuplicate={() => handleDuplicate(todo)}
                            onDelete={() => handleDelete(todo)}
                            onSetPriority={(p) =>
                              updateTodo(todo.id, { priority: p })
                            }
                            onSetDue={(d) => updateTodo(todo.id, { dueDate: d })}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {visible.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      list={listById.get(todo.listId)}
                      showList={showRowList}
                      onToggle={() => toggleTodo(todo.id)}
                      onStar={() => toggleStar(todo.id)}
                      onToggleSubtask={(subId) => toggleSubtask(todo.id, subId)}
                      onEdit={() => openEdit(todo)}
                      onDuplicate={() => handleDuplicate(todo)}
                      onDelete={() => handleDelete(todo)}
                      onSetPriority={(p) => updateTodo(todo.id, { priority: p })}
                      onSetDue={(d) => updateTodo(todo.id, { dueDate: d })}
                    />
                  ))}
                </div>
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
        </main>
        )}
      </div>

      {/* Dialogs */}
      <TodoEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        todo={editing}
        lists={lists}
        defaultListId={editing?.listId ?? targetListId}
        onSubmit={handleEditorSubmit}
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
