import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { formatDate, toISODate } from "@/lib/date";
import { useI18n } from "@/lib/i18n";
import { paletteVar, type Todo, type TodoList } from "@/lib/types";

export interface GoalTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The goal whose history is shown — only its name and color are read. */
  list: TodoList;
  /** Every task filed into the goal; the timeline derives from it. */
  tasks: Todo[];
}

interface DayGroup {
  /** Local calendar date, `YYYY-MM-DD`. */
  iso: string;
  /** Completion timestamps within the day, newest first. */
  items: { id: string; title: string; completedAt: number }[];
}

/** `HH:MM`, 24-hour, from a timestamp. */
function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

/**
 * The goal timeline — a dialog that replays how the goal was actually chipped
 * away at, day by day.
 *
 * The data is the tasks' own `completedAt`: no separate history exists, so a
 * completion that is later unticked simply leaves the timeline. Days read
 * newest first; within a day, so do the tasks. The dots take the goal's
 * color, the same accent the sidebar row and the banner wear.
 */
export function GoalTimelineDialog({
  open,
  onOpenChange,
  list,
  tasks,
}: GoalTimelineDialogProps) {
  const { t, language } = useI18n();
  const [wasOpen, setWasOpen] = useState(false);

  /*
   * Groups are frozen when the dialog opens, not recomputed live: a clock
   * running mid-session would reshuffle the days under the reader. `wasOpen`
   * latches the open edge so the memo keeps the snapshot until the dialog is
   * gone — reopening re-derives from scratch.
   */
  if (open !== wasOpen) setWasOpen(open);

  const groups = useMemo<DayGroup[]>(() => {
    if (!wasOpen) return [];
    const done = tasks
      .filter((task) => task.done && task.completedAt != null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    const byDay = new Map<string, DayGroup>();
    for (const task of done) {
      const iso = toISODate(new Date(task.completedAt ?? 0));
      const group = byDay.get(iso) ?? { iso, items: [] };
      group.items.push({
        id: task.id,
        title: task.title,
        completedAt: task.completedAt ?? 0,
      });
      byDay.set(iso, group);
    }
    return [...byDay.values()];
  }, [wasOpen, tasks]);

  const todayIso = useMemo(
    () => toISODate(new Date()),
    // Re-derived only when the dialog opens; "today" cannot drift mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wasOpen]
  );

  const doneCount = tasks.filter((task) => task.done).length;
  const color = paletteVar(list.color);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * Same shape as the list dialog: header and footer hold their places,
       * the timeline itself is the scrolling middle.
       */}
      <DialogContent className="flex max-w-md flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{list.name}</DialogTitle>
          <DialogDescription>{t("goalTimeline.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(60vh,520px)] flex-col overflow-y-auto px-7 pb-5 pt-4">
          {groups.length === 0 ? (
            <Empty className="py-8">
              <EmptyTitle>{t("goalTimeline.empty")}</EmptyTitle>
              <EmptyDescription>{t("goalTimeline.emptyBody")}</EmptyDescription>
            </Empty>
          ) : (
            <>
              <p className="mb-5 font-mono text-xs tabular-nums text-foreground-subtle">
                {t("goalTimeline.summary", {
                  done: doneCount,
                  total: tasks.length,
                })}
              </p>
              <ol className="relative flex flex-col gap-6">
                {/* The spine: one hairline the day dots all sit on. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1 left-[5px] w-px bg-border"
                />
                {groups.map((group) => (
                  <li key={group.iso} className="relative pl-6">
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1 h-[11px] w-[11px] rounded-full border-2 border-surface"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {group.iso === todayIso
                          ? t("goalTimeline.today")
                          : formatDate(group.iso, language)}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                        +{group.items.length}
                      </span>
                    </div>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-baseline gap-2 text-sm"
                        >
                          <Check
                            className="h-3.5 w-3.5 shrink-0 translate-y-0.5"
                            style={{ color }}
                            strokeWidth={3}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 break-words text-foreground">
                            {item.title}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-foreground-subtle">
                            {clockTime(item.completedAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
