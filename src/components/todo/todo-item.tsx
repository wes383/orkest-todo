import { Fragment, useState, type ReactNode } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleDashed,
  Copy,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Repeat,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Tag } from "@/components/ui/tag";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, dueLabel, dueTone, relativeCreated, todayISO } from "@/lib/date";
import { recurLabel } from "@/lib/recur";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  paletteVar,
  type Priority,
  type Todo,
  type TodoList,
} from "@/lib/types";

export interface TodoItemProps {
  todo: Todo;
  list: TodoList | undefined;
  /** Shown when the current view already spans multiple lists. */
  showList: boolean;
  onToggle: () => void;
  onStar: () => void;
  onToggleSubtask: (subtaskId: string) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetPriority: (priority: Priority) => void;
  onSetDue: (dueDate: string | null) => void;
}

/** Due-date pill tones, mapped onto the Orkest semantic scale. */
const dueToneClass: Record<string, string> = {
  overdue: "bg-red-soft text-red-fg border-red-border",
  today: "bg-orange-soft text-orange-fg border-orange-border",
  soon: "bg-blue-soft text-blue-fg border-blue-border",
  later: "border-border text-foreground-muted",
};

/** Reveal controls only once the row is hovered or focused. */
const revealOnHover =
  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

export function TodoItem({
  todo,
  list,
  showList,
  onToggle,
  onStar,
  onToggleSubtask,
  onEdit,
  onDuplicate,
  onDelete,
  onSetPriority,
  onSetDue,
}: TodoItemProps) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const priority = PRIORITY_META[todo.priority];
  const tone = dueTone(todo.dueDate, todo.done);
  const doneSubs = todo.subtasks.filter((s) => s.done).length;
  const hasDetail = todo.notes.length > 0 || todo.subtasks.length > 0;
  const subProgress =
    todo.subtasks.length === 0
      ? 0
      : Math.round((doneSubs / todo.subtasks.length) * 100);

  const hasPriority = todo.priority !== "low";
  /**
   * `dueToneClass` is keyed by tone, so the tone has to be resolved *with* the
   * date in one expression. Keeping them as two separate optionals would force
   * a non-null assertion inside the JSX, which silently rots if the guard ever
   * changes.
   */
  const due = todo.dueDate && tone ? { date: todo.dueDate, tone } : null;

  /**
   * The meta row states two different kinds of fact, and they used to share one
   * visual weight: 优先级 and 截止日期 are *state* — tinted pills you scan for
   * colour — while 子任务进度 / 清单 / 标签 are *metadata*, purely referential.
   * Giving the second group pill chrome of its own meant three competing chip
   * styles plus loose text on a single line, so nothing led.
   *
   * Metadata is therefore collected into one muted run, joined by `·` between
   * *groups* only. Tags form a single group with a tighter gap instead of
   * taking a separator each — `#汇报 #Q3` reads as one list of tags rather than
   * as two separate facts.
   */
  const metaGroups: ReactNode[] = [];

  if (todo.subtasks.length > 0) {
    metaGroups.push(
      <span
        key="subtasks"
        className="inline-flex items-center gap-1 font-mono tabular-nums"
      >
        <ListChecks className="h-3 w-3" aria-hidden="true" />
        {doneSubs}/{todo.subtasks.length}
      </span>
    );
  }

  if (showList && list) {
    metaGroups.push(
      <span key="list" className="inline-flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: paletteVar(list.color) }}
          aria-hidden="true"
        />
        {list.name}
      </span>
    );
  }

  if (todo.recur) {
    metaGroups.push(
      <span key="recur" className="inline-flex items-center gap-1">
        <Repeat className="h-3 w-3" aria-hidden="true" />
        {recurLabel(todo.recur, language)}
      </span>
    );
  }

  if (!expanded && todo.tags.length > 0) {
    metaGroups.push(
      <span key="tags" className="inline-flex flex-wrap items-center gap-x-1.5">
        {todo.tags.map((tag) => (
          <span key={tag} className="font-mono">
            #{tag}
          </span>
        ))}
      </span>
    );
  }

  /**
   * A card with no priority, no due date, no subtasks, no list and no tags
   * still rendered an empty meta row, and its `mt-1.5` was 6px of phantom
   * height that made the title sit visibly above the card's optical centre.
   * Render the row only when it has something to say.
   */
  const hasMetaRow = hasPriority || due !== null || metaGroups.length > 0;

  return (
    <Card
      className={cn(
        "group relative",
        todo.done && "opacity-55",
        expanded && "border-border-strong"
      )}
    >
      {/* Priority rail — the row's only always-on color signal */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full"
        style={{
          backgroundColor: `var(${priority.cssVar})`,
          opacity: todo.priority === "low" ? 0.35 : 1,
        }}
      />

      <div className="flex items-start gap-3 p-4 pl-5 pr-3">
        <Checkbox
          checked={todo.done}
          onCheckedChange={onToggle}
          aria-label={
            todo.done
              ? t("todo.markIncomplete", { title: todo.title })
              : t("todo.markComplete", { title: todo.title })
          }
          className="mt-0.5 h-5 w-5 rounded-full"
        />

        <button
          type="button"
          onClick={() => hasDetail && setExpanded((v) => !v)}
          aria-expanded={hasDetail ? expanded : undefined}
          className={cn(
            "min-w-0 flex-1 text-left",
            hasDetail ? "cursor-pointer" : "cursor-default"
          )}
        >
          <div className="flex items-start gap-2">
            {hasDetail && (
              <Icon
                icon={ChevronRight}
                size="sm"
                className={cn(
                  "mt-1 text-foreground-subtle transition-transform duration-base ease-out",
                  expanded && "rotate-90"
                )}
              />
            )}
            <span
              className={cn(
                "text-base leading-snug",
                todo.done && "text-foreground-muted line-through decoration-1"
              )}
            >
              {todo.title}
            </span>
          </div>

          {/* Meta row — state as tinted pills, metadata as one muted run */}
          {hasMetaRow && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
              {hasPriority && (
                <Badge variant={priority.badge} size="sm">
                  {t(priority.shortKey)}
                </Badge>
              )}

              {due && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                    dueToneClass[due.tone]
                  )}
                >
                  <CalendarClock className="h-3 w-3" aria-hidden="true" />
                  {dueLabel(due.date, language)}
                </span>
              )}

              {metaGroups.length > 0 && (
                <span className="ml-0.5 inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-subtle">
                  {metaGroups.map((group, i) => (
                    <Fragment key={i}>
                      {i > 0 && (
                        <span aria-hidden="true" className="text-foreground-faint">
                          ·
                        </span>
                      )}
                      {group}
                    </Fragment>
                  ))}
                </span>
              )}
            </div>
          )}
        </button>

        {/*
         * Row actions — `self-center` overrides the row's `items-start`.
         *
         * The checkbox stays pinned to the title's first line (that is what a
         * checkbox next to wrapped text should do), but the action cluster is
         * not tied to any line of text: it belongs to the card as a whole, so
         * it centres against whatever height the title + meta row produce.
         */}
        <div className="flex shrink-0 items-center gap-0.5 self-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={todo.starred ? t("todo.unstar") : t("todo.star")}
                aria-pressed={todo.starred}
                onClick={onStar}
                className={cn(
                  todo.starred ? "text-yellow" : `text-foreground-subtle ${revealOnHover}`
                )}
              >
                <Icon
                  icon={Star}
                  size="sm"
                  className={todo.starred ? "fill-current" : undefined}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {todo.starred ? t("todo.unstar") : t("todo.star")}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("todo.actions")}
                className={cn("text-foreground-subtle", revealOnHover)}
              >
                <Icon icon={MoreHorizontal} size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onEdit}>
                <Icon icon={Pencil} size="sm" />
                {t("todo.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Icon icon={Copy} size="sm" />
                {t("todo.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onStar}>
                <Icon icon={Star} size="sm" />
                {todo.starred ? t("todo.unstar") : t("todo.star")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CircleDashed className="h-4 w-4" aria-hidden="true" />
                  {t("common.priority")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {PRIORITY_ORDER.map((p) => (
                    <DropdownMenuItem key={p} onSelect={() => onSetPriority(p)}>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: `var(${PRIORITY_META[p].cssVar})` }}
                      />
                      {t(PRIORITY_META[p].labelKey)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {t("common.dueDate")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel>{t("todo.duePresets")}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => onSetDue(todayISO())}>
                    {t("date.today")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSetDue(addDays(todayISO(), 1))}>
                    {t("date.tomorrow")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSetDue(addDays(todayISO(), 7))}>
                    {t("date.inWeek")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onSetDue(null)}>
                    {t("todo.clearDueDate")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Icon icon={Trash2} size="sm" />
                {t("todo.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="animate-fade-in border-t border-border py-4 pl-[3.25rem] pr-5">
          {todo.notes && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
              {todo.notes}
            </p>
          )}

          {todo.subtasks.length > 0 && (
            <div className={cn(todo.notes && "mt-4")}>
              <div className="mb-3 flex items-center gap-3">
                <Progress
                  value={subProgress}
                  variant="thin"
                  className="flex-1"
                  color={subProgress === 100 ? "bg-green" : "bg-accent"}
                />
                <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                  {subProgress}%
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {todo.subtasks.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-2.5 py-0.5">
                    <Checkbox
                      checked={sub.done}
                      onCheckedChange={() => onToggleSubtask(sub.id)}
                      aria-label={sub.title}
                    />
                    <span
                      className={cn(
                        "text-sm",
                        sub.done && "text-foreground-subtle line-through"
                      )}
                    >
                      {sub.title}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {todo.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {todo.tags.map((tag) => (
                <Tag key={tag}>#{tag}</Tag>
              ))}
            </div>
          )}

          {/*
           * The completion stamp is its own call rather than a string replace
           * on the creation one: the two differ by a verb that leads in
           * English and trails in Chinese, so it has to be a lookup key, not a
           * substitution.
           */}
          <p className="mt-4 font-mono text-xs text-foreground-faint">
            {relativeCreated(todo.createdAt, language)}
            {todo.completedAt
              ? ` · ${relativeCreated(todo.completedAt, language, "completed")}`
              : ""}
          </p>
        </div>
      )}
    </Card>
  );
}
