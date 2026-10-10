import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { Icon } from "@/components/ui/icon";
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
import { GoalMarker } from "@/components/todo/goal-marker";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatHM, todayISO } from "@/lib/date";
import {
  PRIORITY_META,
  paletteVar,
  type Todo,
  type TodoList,
} from "@/lib/types";

export interface ArchiveViewProps {
  /** Every archived list, most recently archived first. */
  lists: TodoList[];
  /** All tasks — the page picks out each list's own. */
  todos: Todo[];
  /** Puts a list back on the sidebar. */
  onUnarchive: (list: TodoList) => void;
  /** Deletes the list for good; its tasks re-home, its log goes unassigned. */
  onDelete: (list: TodoList) => void;
}

/**
 * The archive screen — where lists and their tasks rest after leaving the
 * sidebar.
 *
 * Deliberately a list, not a card wall: an archive is a record to scan, and
 * rows scan. Each archived list is one collapsible section — a header row
 * (marker, name, when it was archived, how many tasks it brought along, and
 * the one action that matters here, restore) with its tasks folded beneath,
 * closed by default. Expanded, a task row says more than its title: due date,
 * priority, tags.
 */
export function ArchiveView({
  lists,
  todos,
  onUnarchive,
  onDelete,
}: ArchiveViewProps) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** Neither action here is typos-proof — undo doesn't cover a deletion —
      so both ask first, and the row buttons only stage the question. */
  const [pending, setPending] = useState<
    { kind: "restore" | "delete"; list: TodoList } | null
  >(null);
  const today = todayISO();

  const todosByList = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      const bucket = map.get(todo.listId);
      if (bucket) bucket.push(todo);
      else map.set(todo.listId, [todo]);
    }
    return map;
  }, [todos]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      <h1 className="sr-only">{t("archive.title")}</h1>

      {/* `scrollbar-gutter: stable` reserves the scrollbar's width even when
          the content doesn't scroll yet — expanding a list raises a scrollbar,
          and without the reservation the centered column would jump left the
          moment it appears. */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-0.5 px-6 py-5">
          {lists.length === 0 ? (
            <Empty className="py-16">
              <EmptyTitle>{t("archive.empty")}</EmptyTitle>
            </Empty>
          ) : (
            lists.map((list) => {
              const inList = todosByList.get(list.id) ?? [];
              const open = expanded.has(list.id);
              return (
                <section
                  key={list.id}
                  aria-label={list.name}
                  className="py-1"
                >
                  {/* The list's own row — a record line, not a card. The
                      chevron and the name both toggle the tasks beneath. */}
                  <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => toggle(list.id)}
                      aria-expanded={open}
                      aria-label={list.name}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon
                        icon={open ? ChevronDown : ChevronRight}
                        size="sm"
                        className="shrink-0 text-foreground-subtle"
                      />
                      {list.goal ? (
                        <GoalMarker color={paletteVar(list.color)} />
                      ) : (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: paletteVar(list.color) }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {list.name}
                      </span>
                    </button>
                    <span className="shrink-0 text-xs text-foreground-subtle">
                      {t("archive.archivedAt", {
                        date: formatDate(
                          new Date(list.archivedAt ?? 0)
                            .toISOString()
                            .slice(0, 10),
                          language
                        ),
                      })}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-foreground-subtle">
                      {t("archive.taskCount", { count: inList.length })}
                    </span>
                    {/* Restore stages the question; the dialog answers it.
                        Delete is icon-only and destructive — the one button
                        on this page that ends something permanently. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("archive.delete")}
                      onClick={() => setPending({ kind: "delete", list })}
                      className="shrink-0 text-red hover:text-red"
                    >
                      <Icon icon={Trash2} size="sm" />
                      {t("archive.delete")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPending({ kind: "restore", list })}
                      className="shrink-0"
                    >
                      <Icon icon={Undo2} size="sm" />
                      {t("archive.restore")}
                    </Button>
                  </div>

                  {/* Its tasks, as plain rows — done ones struck through and
                      dimmed, the same reading as the tasks screen gives them.
                      A row carries its date, priority and tags so a scan of
                      the archive does not need the tasks screen. */}
                  {open && inList.length > 0 && (
                    <ul className="ml-6 border-l border-border pl-3">
                      {inList.map((todo) => {
                        const overdue =
                          !todo.done &&
                          todo.dueDate !== null &&
                          todo.dueDate < today;
                        const priority = PRIORITY_META[todo.priority];
                        return (
                          <li
                            key={todo.id}
                            className="flex items-center gap-2 py-1.5 text-sm"
                          >
                            {todo.done ? (
                              <CheckCircle2
                                className="h-3.5 w-3.5 shrink-0 text-green"
                                aria-hidden="true"
                              />
                            ) : (
                              <Circle
                                className="h-3.5 w-3.5 shrink-0 text-foreground-faint"
                                aria-hidden="true"
                              />
                            )}
                            <span
                              className={
                                todo.done
                                  ? "min-w-0 flex-1 truncate text-foreground-subtle line-through"
                                  : "min-w-0 flex-1 truncate text-foreground"
                              }
                            >
                              {todo.title}
                            </span>
                            {todo.dueDate !== null && (
                              <span
                                className={
                                  overdue
                                    ? "shrink-0 text-xs tabular-nums text-red"
                                    : "shrink-0 text-xs tabular-nums text-foreground-subtle"
                                }
                              >
                                {formatDate(todo.dueDate, language)}
                                {/* A time only ever rides a date, so this
                                    sits inside the date's span — the record
                                    says "10月10日 17:00", not a bare hour. */}
                                {todo.dueTime !== null &&
                                  ` ${formatHM(todo.dueTime, language)}`}
                              </span>
                            )}
                            <span
                              className="shrink-0 text-xs"
                              style={{ color: `var(${priority.cssVar})` }}
                            >
                              {t(priority.shortKey)}
                            </span>
                            {todo.tags.length > 0 && (
                              <span className="flex shrink-0 items-center gap-1">
                                {todo.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="font-mono text-xs text-foreground-subtle"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>

      {/* Restore: low stakes, but the user asked for the same ask as delete —
          and one rule for both buttons reads calmer than two. */}
      <AlertDialog
        open={pending?.kind === "restore"}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("archive.restoreTitle", { name: pending?.list.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("archive.restoreBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onUnarchive(pending.list);
                setPending(null);
              }}
            >
              {t("archive.restore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete: its own description, not the sidebar's — the consequence
          here is broader, the tasks go with the list. */}
      <AlertDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.deleteListTitle", { name: pending?.list.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("archive.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (pending) onDelete(pending.list);
                setPending(null);
              }}
            >
              {t("sidebar.deleteList")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
