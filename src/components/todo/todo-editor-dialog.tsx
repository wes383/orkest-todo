import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import {
  DatePicker,
  type DatePickerShortcut,
} from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Kbd, KbdChord } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Hint, SubsectionLabel } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { addDays, fromISODate, todayISO, toISODate } from "@/lib/date";
import { useI18n, type I18nValue } from "@/lib/i18n";
import { weekdayName } from "@/lib/recur";
import { cn, MOD_KEY, uid } from "@/lib/utils";
import type { TodoDraft } from "@/lib/store";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  MAX_TAG_LENGTH,
  TITLE_MAX,
  paletteVar,
  type Priority,
  type Recur,
  type Subtask,
  type Todo,
  type TodoList,
} from "@/lib/types";

export interface TodoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` creates a new task. */
  todo: Todo | null;
  lists: TodoList[];
  defaultListId: string;
  /** Whether the dialog spells out the keys it answers to — Enter/Backspace by
      the subtask field, <mod>+Enter at its foot. See
      `AppSettings.hideShortcutHints`; both the field and the save still work. */
  hideShortcutHints: boolean;
  onSubmit: (draft: TodoDraft) => void;
}

/**
 * Due-date shortcuts.
 *
 * The component library's own default column is aimed at generic date picking
 * and includes 昨天 / 本周一 / 本月初 — all of which are in the past for most of
 * the week, and useless for a due date. These four are strictly today-or-later,
 * which is the only range a due date can sensibly occupy.
 *
 * A function of `t` rather than a constant, because the labels are UI copy and
 * the component cannot know the language at module scope.
 */
function dueShortcuts(t: I18nValue["t"]): DatePickerShortcut[] {
  return [
    { label: t("date.today"), getValue: () => fromISODate(todayISO()) },
    { label: t("date.tomorrow"), getValue: () => fromISODate(addDays(todayISO(), 1)) },
    { label: t("date.inDays", { n: 3 }), getValue: () => fromISODate(addDays(todayISO(), 3)) },
    { label: t("date.inWeek"), getValue: () => fromISODate(addDays(todayISO(), 7)) },
  ];
}

/** Weekday indexes for the repeat-day toggles: 0 = Sunday … 6 = Saturday. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

interface FormState {
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  listId: string;
  tags: string[];
  subtasks: Subtask[];
  recur: Recur | null;
}

function emptyForm(listId: string): FormState {
  return {
    title: "",
    notes: "",
    priority: "medium",
    dueDate: "",
    listId,
    tags: [],
    subtasks: [],
    recur: null,
  };
}

function formFromTodo(todo: Todo, fallbackListId: string): FormState {
  return {
    title: todo.title,
    notes: todo.notes,
    priority: todo.priority,
    dueDate: todo.dueDate ?? "",
    listId: todo.listId || fallbackListId,
    tags: [...todo.tags],
    subtasks: todo.subtasks.map((s) => ({ ...s })),
    recur: todo.recur ?? null,
  };
}

/**
 * TodoEditorDialog — the long-form counterpart to QuickAdd.
 *
 * The body is split into three labelled groups (内容 / 安排 / 拆解) using the
 * Orkest subsection label, and the middle scrolls so the footer actions stay
 * pinned. `Ctrl+Enter` saves from anywhere in the form.
 */
export function TodoEditorDialog({
  open,
  onOpenChange,
  todo,
  lists,
  defaultListId,
  hideShortcutHints,
  onSubmit,
}: TodoEditorDialogProps) {
  const { t, language, locale } = useI18n();
  const shortcuts = useMemo(() => dueShortcuts(t), [t]);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultListId));
  const [tagInput, setTagInput] = useState("");
  const [subtaskInput, setSubtaskInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      todo ? formFromTodo(todo, defaultListId) : emptyForm(defaultListId)
    );
    setTagInput("");
    setSubtaskInput("");
  }, [open, todo, defaultListId]);

  const patch = (next: Partial<FormState>) => setForm((f) => ({ ...f, ...next }));

  const addTag = () => {
    const value = tagInput.trim().replace(/^#/, "");
    // Unreachable through the field itself (`maxLength` stops typing at the
    // cap), but a pasted `#name` that trims longer than one tag allows is
    // refused rather than stored over the limit.
    if (!value || value.length > MAX_TAG_LENGTH || form.tags.includes(value)) {
      return;
    }
    patch({ tags: [...form.tags, value] });
    setTagInput("");
  };

  const addSubtask = () => {
    const value = subtaskInput.trim();
    if (!value) return;
    patch({
      subtasks: [...form.subtasks, { id: uid("sub"), title: value, done: false }],
    });
    setSubtaskInput("");
  };

  const canSubmit = form.title.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: form.title,
      notes: form.notes,
      priority: form.priority,
      dueDate: form.dueDate || null,
      listId: form.listId,
      tags: form.tags,
      subtasks: form.subtasks,
      recur: form.recur,
    });
    onOpenChange(false);
  };

  /** Latest submit in a ref so the global shortcut never reads a stale form. */
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {todo ? t("editor.editTitle") : t("editor.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {todo
              ? t("editor.editDescription")
              : t("editor.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(60vh,520px)] flex-col gap-6 overflow-y-auto px-7 pb-6 pt-4">
          {/* Content */}
          <section className="flex flex-col gap-4">
            <SubsectionLabel>{t("editor.sectionContent")}</SubsectionLabel>

            <div>
              <Label htmlFor="todo-title">{t("editor.titleLabel")}</Label>
              <Input
                id="todo-title"
                value={form.title}
                autoFocus
                maxLength={TITLE_MAX}
                placeholder={t("editor.titlePlaceholder")}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="todo-notes">{t("editor.notesLabel")}</Label>
              <Textarea
                id="todo-notes"
                value={form.notes}
                placeholder={t("editor.notesPlaceholder")}
                maxLength={500}
                showCount
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </section>

          <Separator />

          {/* Scheduling */}
          <section className="flex flex-col gap-4">
            <SubsectionLabel>{t("editor.sectionSchedule")}</SubsectionLabel>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("common.priority")}</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => patch({ priority: v as Priority })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("editor.priorityPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: `var(${PRIORITY_META[p].cssVar})` }}
                          />
                          {t(PRIORITY_META[p].labelKey)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t("editor.listLabel")}</Label>
                <Select value={form.listId} onValueChange={(v) => patch({ listId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("editor.listPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: paletteVar(list.color) }}
                          />
                          {list.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/*
             * A popover calendar replaces `<input type="date">`. The native
             * control renders the OS picker, which looks nothing like the rest of
             * the form and gives no way to express "明天" in one click; its
             * value is also `YYYY-MM-DD` in *UTC* semantics on some platforms,
             * which is a trap the app's local-calendar date helpers exist to
             * avoid. `dueDate` stays a plain ISO date string in state, so the
             * conversion happens only here at the edge.
             */}
            <div>
              <Label>{t("common.dueDate")}</Label>
              <DatePicker
                aria-label={t("common.dueDate")}
                placeholder={t("editor.duePlaceholder")}
                intlLocale={locale}
                /* `null`, not `undefined`, when empty: the DatePicker treats an
                 * `undefined` value prop as "uncontrolled", and the resulting
                 * mode flip is what once made the first Clear click a no-op. */
                value={form.dueDate ? fromISODate(form.dueDate) : null}
                onChange={(v) =>
                  patch({
                    dueDate: v instanceof Date ? toISODate(v) : "",
                    // A repeat is anchored to its due date; no date, no anchor.
                    ...(v instanceof Date ? {} : { recur: null }),
                  })
                }
                shortcuts={shortcuts}
              />
            </div>

            {/*
             * Repeat — a kind picker, then whatever that kind needs spelled
             * out. The select holds the *shape* of the rule and the widgets
             * beside it hold the parameters; the two together write one `Recur`
             * into the form. Switching kinds keeps the parameter that kind can
             * use (the interval stays an interval, the days stay days), so a
             * mis-picked kind is one click to undo, not a re-entry.
             */}
            <div>
              <Label htmlFor="todo-recur">{t("recur.label")}</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={form.recur ? form.recur.kind : "none"}
                  /* Recurring needs a due date to advance from, so the picker
                     sits idle until one exists — the hint below says why. */
                  disabled={!form.dueDate}
                  onValueChange={(v) => {
                    if (v === "none") {
                      patch({ recur: null });
                    } else if (v === "daily") {
                      patch({
                        recur: {
                          kind: "daily",
                          interval:
                            form.recur?.kind === "daily"
                              ? form.recur.interval
                              : 1,
                        },
                      });
                    } else if (v === "weekdays") {
                      patch({
                        recur: {
                          kind: "weekdays",
                          days:
                            form.recur?.kind === "weekdays" &&
                            form.recur.days.length > 0
                              ? form.recur.days
                              : [1],
                        },
                      });
                    } else {
                      // weekly / monthly / yearly carry no parameters.
                      patch({ recur: { kind: v } as Recur });
                    }
                  }}
                >
                  <SelectTrigger id="todo-recur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("recur.none")}</SelectItem>
                    <SelectItem value="daily">{t("recur.dailyItem")}</SelectItem>
                    <SelectItem value="weekly">{t("recur.weekly")}</SelectItem>
                    <SelectItem value="weekdays">
                      {t("recur.weekdaysItem")}
                    </SelectItem>
                    <SelectItem value="monthly">{t("recur.monthly")}</SelectItem>
                    <SelectItem value="yearly">{t("recur.yearly")}</SelectItem>
                  </SelectContent>
                </Select>

                {form.recur?.kind === "daily" && (
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    aria-label={t("recur.intervalLabel")}
                    className="w-24 shrink-0"
                    value={form.recur.interval}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      if (Number.isNaN(n)) return;
                      patch({
                        recur: {
                          kind: "daily",
                          interval: Math.min(365, Math.max(1, n)),
                        },
                      });
                    }}
                  />
                )}
              </div>

              {form.recur?.kind === "weekdays" && (
                <div
                  role="group"
                  aria-label={t("recur.weekdaysLabel")}
                  className="mt-3 flex flex-wrap gap-1.5"
                >
                  {WEEKDAYS.map((day) => {
                    const on = form.recur?.kind === "weekdays" && form.recur.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          if (form.recur?.kind !== "weekdays") return;
                          const days = on
                            ? form.recur.days.filter((d) => d !== day)
                            : [...form.recur.days, day];
                          patch({ recur: { kind: "weekdays", days } });
                        }}
                        className={cn(
                          "h-8 w-10 rounded-md border text-xs font-medium transition-colors duration-base",
                          on
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border text-foreground-subtle hover:bg-hover-bg"
                        )}
                      >
                        {weekdayName(day, language)}
                      </button>
                    );
                  })}
                </div>
              )}

              {form.recur ? (
                <Hint className="mt-2">{t("recur.hint")}</Hint>
              ) : (
                !form.dueDate && (
                  <Hint className="mt-2">{t("recur.needsDue")}</Hint>
                )
              )}
            </div>
          </section>

          <Separator />

          {/* Breakdown */}
          <section className="flex flex-col gap-4">
            <SubsectionLabel>{t("editor.sectionBreakdown")}</SubsectionLabel>

            <div>
              <Label htmlFor="todo-tags">{t("common.tags")}</Label>
              <Input
                id="todo-tags"
                value={tagInput}
                /*
                 * One more than the tag cap, so a leading `#` typed by hand
                 * never eats into the 30 characters the tag itself gets; the
                 * real cap is enforced again on the stripped value in
                 * `addTag`, which is the only thing that can commit one.
                 */
                maxLength={MAX_TAG_LENGTH + 1}
                placeholder={t("editor.tagsPlaceholder")}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  } else if (e.key === "Backspace" && !tagInput && form.tags.length) {
                    patch({ tags: form.tags.slice(0, -1) });
                  }
                }}
              />
              {/*
               * Sentence fragments around a `<Kbd>` rather than one message with
               * the key baked in: the two languages put the verb on opposite
               * sides of the key name ("按 Enter 添加" / "Press Enter to add"),
               * and the surrounding `inline-flex … gap-1.5` supplies the
               * spacing, so no message needs to carry a leading or trailing
               * space.
               *
               * Both clauses are key hints, so 隐藏快捷键提示 takes the whole row
               * rather than leaving fragments ("按 添加") behind.
               */}
              {!hideShortcutHints && (
                <Hint className="mt-2">
                  <span className="inline-flex items-center gap-1.5">
                    {t("editor.hintPress")}
                    <Kbd className="text-[10px]">Enter</Kbd>
                    {t("editor.hintAdd")}
                  </span>
                  <span aria-hidden="true" className="text-foreground-faint">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd className="text-[10px]">Backspace</Kbd>
                    {t("editor.hintRemoveLast")}
                  </span>
                </Hint>
              )}

              {form.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.tags.map((tag) => (
                    <Chip
                      key={tag}
                      onRemove={() =>
                        patch({ tags: form.tags.filter((t) => t !== tag) })
                      }
                    >
                      <span className="font-mono text-xs">#{tag}</span>
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="todo-subtask">{t("editor.subtasksLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="todo-subtask"
                  value={subtaskInput}
                  maxLength={TITLE_MAX}
                  placeholder={t("editor.subtaskPlaceholder")}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                />
                {/*
                 * `shrink-0` is load-bearing: `icon` is `h-10 w-10`, so this is
                 * only a circle while both axes stay at 40px. Tailwind's `Input`
                 * carries `w-full`, and flex items default to `flex-shrink: 1`,
                 * so without this the row's overflow was shared between the two
                 * by base width — the input gave up ~45px and the button ~3px,
                 * squashing a 40px circle into a ~37×40 oval.
                 */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label={t("editor.addSubtask")}
                  onClick={addSubtask}
                >
                  <Icon icon={Plus} />
                </Button>
              </div>

              {form.subtasks.length > 0 && (
                <ul className="mt-3 flex flex-col gap-0.5">
                  {form.subtasks.map((sub) => (
                    <li
                      key={sub.id}
                      className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-base hover:bg-hover-bg"
                    >
                      <Checkbox
                        checked={sub.done}
                        onCheckedChange={() =>
                          patch({
                            subtasks: form.subtasks.map((s) =>
                              s.id === sub.id ? { ...s, done: !s.done } : s
                            ),
                          })
                        }
                        aria-label={sub.title}
                      />
                      <span
                        className={
                          sub.done
                            ? "flex-1 text-sm text-foreground-subtle line-through"
                            : "flex-1 text-sm"
                        }
                      >
                        {sub.title}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editor.removeSubtask", {
                          title: sub.title,
                        })}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() =>
                          patch({
                            subtasks: form.subtasks.filter((s) => s.id !== sub.id),
                          })
                        }
                      >
                        <Icon icon={Trash2} size="sm" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          {!hideShortcutHints && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-foreground-subtle">
              {t("editor.hintPress")}
              <KbdChord keys={[MOD_KEY, "Enter"]} />
              {t("editor.hintSave")}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {todo ? t("editor.save") : t("editor.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
