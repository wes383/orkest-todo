import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint, SubsectionLabel } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  PALETTE,
  LIST_NAME_MAX,
  paletteVar,
  type GoalConfig,
  type PaletteName,
  type TodoList,
} from "@/lib/types";
import { GoalMarker } from "@/components/todo/goal-marker";

export interface ListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing list to rename / recolor it; `null` creates a new one. */
  editing: TodoList | null;
  onSubmit: (name: string, color: PaletteName, goal: GoalConfig | null) => void;
}

/** Reads a positive integer off an input, falling back when empty or junk. */
function parseCount(value: string, fallback: number, floor: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= floor ? parsed : fallback;
}

/** Strips leading zeros off a typed count ("034" → "34", "0" stays "0"). */
function normalizeCount(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

export function ListDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: ListDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [color, setColor] = useState<PaletteName>("indigo");
  const [isGoal, setIsGoal] = useState(false);
  const [notes, setNotes] = useState("");
  const [metric, setMetric] = useState<GoalConfig["metric"]>("tasks");
  const [target, setTarget] = useState("100");
  const [current, setCurrent] = useState("0");
  const [unit, setUnit] = useState("");

  // Re-seed the form each time the dialog opens so stale values never leak in.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setColor(editing?.color ?? "indigo");
    const goal = editing?.goal;
    if (goal) {
      setIsGoal(true);
      setNotes(goal.notes);
      setMetric(goal.metric);
      setTarget(String(goal.target));
      setCurrent(String(goal.current));
      setUnit(goal.unit ?? "");
    } else {
      setIsGoal(false);
      setNotes("");
      setMetric("tasks");
      setTarget("100");
      setCurrent("0");
      setUnit("");
    }
  }, [open, editing]);

  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const goal: GoalConfig | null = isGoal
      ? {
          notes: notes.trim(),
          metric,
          target: parseCount(target, 100, 1),
          current: parseCount(current, 0, 0),
          unit: unit.trim(),
        }
      : null;
    onSubmit(name.trim(), color, goal);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * The editor dialog's shape: header and footer hold their places, and
       * only the middle scrolls — capped so a short window squeezes the body
       * instead of pushing the buttons off-screen. The goal fields make this
       * dialog tall enough to need it.
       */}
      <DialogContent className="flex max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("listDialog.editTitle") : t("listDialog.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("listDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(60vh,520px)] flex-col gap-4 overflow-y-auto px-7 pb-5 pt-4">
          <div>
            <Label htmlFor="list-name">{t("listDialog.nameLabel")}</Label>
            <Input
              id="list-name"
              value={name}
              autoFocus
              maxLength={LIST_NAME_MAX}
              placeholder={t("listDialog.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <div>
            <Label>{t("listDialog.colorLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  aria-pressed={color === p}
                  onClick={() => setColor(p)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-all duration-base ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    color === p
                      ? "ring-2 ring-foreground"
                      : "hover:scale-110"
                  )}
                  style={{ backgroundColor: paletteVar(p) }}
                >
                  {color === p && (
                    <Check
                      className="h-3.5 w-3.5 text-white drop-shadow"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            <Hint className="mt-3">{t("listDialog.colorHint")}</Hint>
          </div>

          {/*
           * The goal toggle. On, the same list grows intent — description and
           * a way to measure progress — and the sidebar row wears a bullseye.
           * Off, every goal field below folds away and the list stays a list.
           */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="list-goal">{t("listDialog.goalToggle")}</Label>
              <Hint className="mt-1">{t("listDialog.goalToggleHint")}</Hint>
            </div>
            <Switch
              id="list-goal"
              checked={isGoal}
              onCheckedChange={setIsGoal}
            />
          </div>

          {isGoal && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-3.5">
              <div>
                <Label htmlFor="goal-notes">{t("listDialog.goalNotes")}</Label>
                <Input
                  id="goal-notes"
                  value={notes}
                  maxLength={200}
                  placeholder={t("listDialog.goalNotesPlaceholder")}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>{t("listDialog.goalMetric")}</Label>
                <Select
                  value={metric}
                  onValueChange={(v) => setMetric(v as GoalConfig["metric"])}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tasks">
                      {t("listDialog.goalMetricTasks")}
                    </SelectItem>
                    <SelectItem value="number">
                      {t("listDialog.goalMetricNumber")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Hint className="mt-2">
                  {metric === "tasks"
                    ? t("listDialog.goalMetricTasksHint")
                    : t("listDialog.goalMetricNumberHint")}
                </Hint>
              </div>

              {metric === "number" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="goal-target">
                        {t("listDialog.goalTarget")}
                      </Label>
                      <Input
                        id="goal-target"
                      type="number"
                      min={1}
                      value={target}
                      onChange={(e) => setTarget(normalizeCount(e.target.value))}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="goal-current">
                        {t("listDialog.goalCurrent")}
                      </Label>
                      <Input
                        id="goal-current"
                      type="number"
                      min={0}
                      value={current}
                      onChange={(e) => setCurrent(normalizeCount(e.target.value))}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="goal-unit">{t("listDialog.goalUnit")}</Label>
                    <Input
                      id="goal-unit"
                      value={unit}
                      maxLength={10}
                      placeholder={t("listDialog.goalUnitPlaceholder")}
                      onChange={(e) => setUnit(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <SubsectionLabel>{t("listDialog.preview")}</SubsectionLabel>
            <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2.5">
              {isGoal ? (
                <GoalMarker color={paletteVar(color)} />
              ) : (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: paletteVar(color) }}
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  "truncate text-sm",
                  canSubmit ? "text-foreground" : "text-foreground-subtle"
                )}
              >
                {name.trim() || t("list.untitled")}
              </span>
              {isGoal && metric === "number" && (
                <span className="ml-auto font-mono text-xs tabular-nums text-foreground-subtle">
                  {Math.max(
                    0,
                    Math.round(
                      (parseCount(current, 0, 0) /
                        Math.max(1, parseCount(target, 100, 1))) *
                        100
                    )
                  )}
                  %
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {editing ? t("common.save") : t("listDialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
