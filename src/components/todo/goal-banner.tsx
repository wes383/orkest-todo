import { useState } from "react";
import { History, Minus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { GoalTimelineDialog } from "@/components/todo/goal-timeline-dialog";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { paletteVar, type Todo, type TodoList } from "@/lib/types";

export interface GoalBannerProps {
  /** The selected goal — a list whose `goal` is non-null. */
  list: TodoList;
  /** Completion percent 0–100, derived in App. */
  progress: number;
  /** Done / total tasks in the list; read only for `metric: "tasks"`. */
  doneCount: number;
  totalCount: number;
  /** Every task filed into the goal — the timeline dialog's data. */
  tasks: Todo[];
  /** Writes a new `current` — the quick-edit stepper's whole point. */
  onUpdateCurrent: (value: number) => void;
  /** Opens the list dialog for the full edit (notes, target, color…). */
  onEdit: () => void;
}

/**
 * The goal banner — what sits at the top of the task list when the sidebar
 * has a goal selected.
 *
 * It restates what the goal *is* (name, description), where it *stands*
 * (progress bar, percent), and offers the one edit that is a daily act: the
 * current value, stepped or typed in place. Everything rarer — notes, target,
 * the metric itself, the color — stays behind the pencil, in the list dialog
 * the banner shares with every list.
 */
export function GoalBanner({
  list,
  progress,
  doneCount,
  totalCount,
  tasks,
  onUpdateCurrent,
  onEdit,
}: GoalBannerProps) {
  const { t } = useI18n();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const goal = list.goal;
  if (!goal) return null;

  const color = paletteVar(list.color);
  const reached = progress >= 100;

  const step = (delta: number) => {
    onUpdateCurrent(Math.max(0, goal.current + delta));
  };

  return (
    <section
      aria-label={list.name}
      className="relative rounded-lg border border-border bg-background px-4 py-3"
    >
      {/* Out of flow at the corner: tall buttons in the title's row would
          stretch the line and nudge the title down. Absolutely positioning
          the pair keeps the title's height independent of theirs. */}
      <div className="absolute right-1.5 top-1.5 flex gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("goalBanner.editGoal")}
          onClick={onEdit}
          className="rounded-md"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("goalBanner.timeline")}
          onClick={() => setTimelineOpen(true)}
          className="rounded-md"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate pr-16 text-sm font-medium text-foreground">
            {list.name}
          </h2>

          {goal.notes.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-foreground-subtle">
              {goal.notes}
            </p>
          )}

          {/* The percent rides the bar's own row, right-aligned: the number
              and the bar are one reading, not two. Without a description in
              between, the title-to-bar gap breathes a little wider. */}
          <div
            className={cn(
              "flex items-center gap-3",
              goal.notes.length > 0 ? "mt-2" : "mt-3"
            )}
          >
            <Progress value={progress} variant="thin" color={color} />
            <span
              className={cn(
                "shrink-0 font-mono text-sm tabular-nums",
                reached ? "text-green" : "text-foreground-subtle"
              )}
            >
              {progress}%
            </span>
          </div>

          {goal.metric === "number" ? (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="-1"
                  disabled={goal.current <= 0}
                  onClick={() => step(-1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Input
                  type="number"
                  min={0}
                  value={goal.current}
                  aria-label={t("listDialog.goalCurrent")}
                  onChange={(e) => {
                    const parsed = Math.floor(Number(e.target.value));
                    if (Number.isFinite(parsed) && parsed >= 0) {
                      onUpdateCurrent(parsed);
                    }
                  }}
                  className="h-7 w-16 px-2 text-center font-mono text-xs tabular-nums"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="+1"
                  onClick={() => step(1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <span className="text-xs text-foreground-subtle">
                {t("goalBanner.ofTarget", { target: goal.target })}
              </span>
            </div>
          ) : (
            <p className="mt-2.5 text-xs text-foreground-subtle">
              {t("goalBanner.tasksProgress", { done: doneCount, total: totalCount })}
            </p>
          )}
        </div>
      </div>

      <GoalTimelineDialog
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        list={list}
        tasks={tasks}
      />
    </section>
  );
}
