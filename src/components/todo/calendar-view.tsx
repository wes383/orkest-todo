"use client";

/**
 * The calendar screen — the todo set laid out on the month it is due.
 *
 * A screen rather than a view, the same call the focus switch and the
 * statistics made: a view filters the list, this replaces it with a different
 * shape of the same data. Every task with a due date lands on its day; a task
 * without one does not appear at all — the calendar answers "when", and a
 * task with no date has no answer to give.
 *
 * The grid fills the window rather than scrolling the page: the month's weeks
 * share whatever height there is, the way a wall calendar does. A month draws
 * exactly as many rows as it spans (four to six), and the number of chips a
 * day shows is measured off the row's real height — a shorter window shows
 * fewer chips per day, never a scrollbar. What does not fit folds into a
 * "+N" row that opens the day's popover: every task of the day in one menu,
 * and a second click on any of them opens its card beside the menu. The
 * measured row height is what decides the count, so the "+N" row is charged
 * its real height — a shorter one than a chip's — and no space is wasted
 * under it.
 *
 * Interactions:
 *
 *  - Click a chip (or a task in the day's popover) for its card: everything
 *    the task holds, and the levers that matter — done, starred, subtasks —
 *    work right there. The card's 编辑 button is the door to the full editor.
 *  - Drag a task onto another day to reschedule it. The drop target lights up
 *    while the drag is over it; the move itself is made by the caller, which
 *    owns the store and the undo toast. (In-page drag-and-drop needs the
 *    window's OS file drop off — `dragDropEnabled: false` in
 *    `tauri.conf.json`, otherwise WebView2 claims every drag for itself. The
 *    drag carries a faithful copy of the chip, held at the same offset the
 *    pointer had inside it — not a browser-rendered snapshot, not a pill.)
 *  - The "+" beside a day's date creates a task whose due date is already
 *    that day. There is no double-click gesture: two fast clicks are how a
 *    menu is opened twice, not a way to write.
 *
 * Weeks run Monday-first, the way every other calendar-shaped thing in the
 * app reads (`focus-spans.ts`: "so the figures read the same in either
 * language").
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent as ReactDragEvent } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { LOCALES, type Language } from "@/lib/messages";
import {
  dueLabel,
  formatDate,
  fromISODate,
  relativeCreated,
  toISODate,
} from "@/lib/date";
import { useTodayISO } from "@/lib/use-today";
import {
  PRIORITY_META,
  paletteVar,
  type Todo,
  type TodoList,
} from "@/lib/types";

/* ── Geometry, in px ─────────────────────────────────────────────────────
   What a day can show is measured off the rendered grid — the cell, the
   chip and the "+N" row are all read from real layout (see `measure` in
   `CalendarView`), so the count cannot drift from the styles. These are the
   fallbacks for the first paint, before anything has been measured, and
   must agree with the classes below: a chip is `text-xs leading-5` (20) with
   `py-0.5` (4), the chips column is `gap-1`, the date row is `h-6`, the cell
   pads `p-1.5`, and the "+N" row is a chip's line box without the padding. */
const CHIP_H = 24;
/** Between two chips. The chips wear `py-0.5`, so the eye still reads a 6px
    break between one task and the next. */
const CHIP_GAP = 2;
/** The cell's own gap: the date row to the chips under it. */
const ROW_GAP = 4;
const MORE_H = 16;
const DATE_ROW_H = 24;
/** What a day shows before the first measurement lands, and the ceiling —
    eight of anything in one cell stops being a glance. */
const MAX_VISIBLE = 3;
const MAX_SHOWN = 8;

/** One row's real geometry, measured off the rendered grid. */
interface Metrics {
  /** The height a cell's chips share: the cell minus its padding, the date
      row and the gap under it. */
  area: number;
  /** A chip's height, as rendered. */
  chip: number;
  /** The "+N" row's height, as rendered, margins included — shorter than a
      chip, and every one of those pixels is a pixel the chips get back. */
  more: number;
  /** The chips column's own gap. */
  gap: number;
}

/** `2026-09` — the month the grid is showing, the slice of an ISO date that
    names one. */
type MonthKey = string;

function monthOf(iso: string): MonthKey {
  return iso.slice(0, 7);
}

function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const first = fromISODate(`${month}-01`);
  return toISODate(
    new Date(first.getFullYear(), first.getMonth() + delta, 1)
  ).slice(0, 7);
}

/**
 * The ISO dates of the weeks covering `month`, one inner array a week,
 * Monday-first. A month gets exactly as many rows as it spans — four to six —
 * so the grid is the month's own shape rather than a fixed six-row stencil.
 */
function gridWeeks(month: MonthKey): string[][] {
  const first = fromISODate(`${month}-01`);
  const back = (first.getDay() + 6) % 7;
  let cursor = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() - back
  );
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks: string[][] = [];
  while (cursor <= last) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(toISODate(cursor));
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1
      );
    }
    weeks.push(week);
  }
  return weeks;
}

/** The weekday names in Monday-first order — the same trick the heat grids
    use: 2024-01-01 was a Monday, so the names come from the platform's
    calendar rather than from a dictionary. */
function weekdayNames(lang: Language): string[] {
  const format = new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(2024, 0, 1 + index))
  );
}

/** The priority bar a chip and a day-menu row wear: the two loud priorities
    earn it, the two default ones do not — a chip is a glance, not a card. */
function PriorityBar({ priority }: { priority: Todo["priority"] }) {
  if (priority !== "urgent" && priority !== "high") return null;
  return (
    <span
      aria-hidden="true"
      className="h-3 w-0.5 shrink-0 rounded-full"
      style={{ backgroundColor: `var(${PRIORITY_META[priority].cssVar})` }}
    />
  );
}

/**
 * The task's card — the popover body both doors open: a chip in a cell, and
 * a row inside a day's popover. Everything the task holds, and the levers
 * that matter worked in place: done, starred, and the checklist each answer
 * from here without leaving the calendar.
 */
function TaskCard({
  todo,
  list,
  onEdit,
  onDelete,
  onToggle,
  onToggleStar,
  onToggleSubtask,
  onClose,
}: {
  todo: Todo;
  list: TodoList | undefined;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onToggle: (todoId: string) => void;
  onToggleStar: (todoId: string) => void;
  onToggleSubtask: (todoId: string, subtaskId: string) => void;
  /** Puts the card away — worn by the doors that leave it (edit, delete). */
  onClose: () => void;
}) {
  const { t, language } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-1">
        <h3
          className={cn(
            "min-w-0 flex-1 text-sm font-medium leading-snug",
            todo.done && "text-foreground-subtle line-through"
          )}
        >
          {todo.title}
        </h3>
        {/* The levers, in the order they are reached for: done, then starred. */}
        <button
          type="button"
          aria-label={t(
            todo.done ? "calendar.pop.markUndone" : "calendar.pop.markDone"
          )}
          aria-pressed={todo.done}
          onClick={() => onToggle(todo.id)}
          className={cn(ghostIcon, "h-7 w-7", todo.done && "text-[var(--green)]")}
        >
          <Icon icon={Check} size="sm" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label={t(
            todo.starred ? "calendar.pop.unstar" : "calendar.pop.star"
          )}
          aria-pressed={todo.starred}
          onClick={() => onToggleStar(todo.id)}
          className={cn(
            ghostIcon,
            "h-7 w-7",
            todo.starred && "text-[var(--amber)]"
          )}
        >
          <Icon
            icon={Star}
            size="sm"
            className={todo.starred ? "fill-current" : undefined}
          />
        </button>
        {/* The door onwards: the full editor, one glyph away. */}
        <button
          type="button"
          aria-label={t("calendar.pop.edit")}
          onClick={() => {
            onClose();
            onEdit(todo);
          }}
          className={ghostIcon}
        >
          <Icon icon={Pencil} size="sm" />
        </button>
        {/* The last of the levers, and the only destructive one: it names
            itself in the caller's toast, which carries the undo. */}
        <button
          type="button"
          aria-label={t("calendar.pop.delete")}
          onClick={() => {
            onClose();
            onDelete(todo);
          }}
          className={cn(ghostIcon, "hover:text-[var(--red)]")}
        >
          <Icon icon={Trash2} size="sm" />
        </button>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center gap-2">
          <dt className="w-14 shrink-0 text-xs text-foreground-faint">
            {t("common.priority")}
          </dt>
          <dd>
            <Badge variant={PRIORITY_META[todo.priority].badge} size="sm">
              {t(PRIORITY_META[todo.priority].labelKey)}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="w-14 shrink-0 text-xs text-foreground-faint">
            {t("calendar.pop.list")}
          </dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: paletteVar(list?.color ?? "gray") }}
            />
            <span className="truncate">
              {list?.name ?? t("list.untitled")}
            </span>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="w-14 shrink-0 text-xs text-foreground-faint">
            {t("common.dueDate")}
          </dt>
          <dd>{dueLabel(todo.dueDate ?? "", language)}</dd>
        </div>
        {todo.tags.length > 0 && (
          <div className="flex items-center gap-2">
            <dt className="w-14 shrink-0 text-xs text-foreground-faint">
              {t("common.tags")}
            </dt>
            <dd className="flex flex-wrap gap-1">
              {todo.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-foreground-muted"
                >
                  #{tag}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {todo.subtasks.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {todo.subtasks.map((sub) => (
            <li
              key={sub.id}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-base hover:bg-hover-bg"
            >
              <Checkbox
                checked={sub.done}
                onCheckedChange={() => onToggleSubtask(todo.id, sub.id)}
                aria-label={sub.title}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  sub.done && "text-foreground-subtle line-through"
                )}
              >
                {sub.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      {todo.notes && (
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-2.5 py-1.5 text-xs leading-relaxed text-foreground-muted">
          {todo.notes}
        </p>
      )}

      {todo.done && todo.completedAt !== null && (
        <p className="text-xs text-foreground-faint">
          {relativeCreated(todo.completedAt, language, "completed")}
        </p>
      )}
    </div>
  );
}

/** A day's chips: the unfinished first, then by priority, then by age — the
    order the task list's own sort would give them. */
function sortForDay(a: Todo, b: Todo): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const rank = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
  if (rank !== 0) return rank;
  return a.createdAt - b.createdAt;
}

/** The ghost icon button the month steppers and the card's levers share:
    just the glyph, no box — the way the statistics page's own steppers
    read. */
const ghostIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-base ease-out hover:bg-hover-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** One chip on a day: draggable onto another day to reschedule; a click
    opens the task's card beside the chip rather than taking the whole window
    to the editor — the calendar is for looking, the editor for changing. */
function TaskChip({
  todo,
  list,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onToggle,
  onToggleStar,
  onToggleSubtask,
  onDragStart,
  onDragEnd,
}: {
  todo: Todo;
  list: TodoList | undefined;
  /** The card's open state, held by the screen so one card at a time is
      ever up. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onToggle: (todoId: string) => void;
  onToggleStar: (todoId: string) => void;
  onToggleSubtask: (todoId: string, subtaskId: string) => void;
  onDragStart: (event: ReactDragEvent, todo: Todo) => void;
  onDragEnd: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          draggable
          // Measured by the screen to size a day: see `measure`.
          data-chip=""
          // Right-click opens the card too — the same window, just a
          // different hand on the door. The app swallows the native context
          // menu everywhere, so this is the only answer a right-click has.
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenChange(true);
          }}
          onDragStart={(event) => onDragStart(event, todo)}
          onDragEnd={onDragEnd}
          className={cn(
            "flex w-full shrink-0 cursor-grab items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5 text-left text-xs leading-5 transition-colors duration-base hover:bg-hover-bg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
            todo.done && "opacity-55"
          )}
        >
          {/* The list's dot, the same colour the sidebar and the task cards
              wear. */}
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: paletteVar(list?.color ?? "gray") }}
          />
          <PriorityBar priority={todo.priority} />
          <span
            className={cn(
              "truncate",
              todo.done && "text-foreground-subtle line-through"
            )}
          >
            {todo.title}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80">
        <TaskCard
          todo={todo}
          list={list}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onToggleStar={onToggleStar}
          onToggleSubtask={onToggleSubtask}
          onClose={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One row of a day's popover: the whole task list of the day, compact. A
    click opens the task's card beside the menu — the second of the two
    menus, nested the way a context menu opens off a menu item. */
function DayItem({
  todo,
  list,
  onEdit,
  onDelete,
  onToggle,
  onToggleStar,
  onToggleSubtask,
}: {
  todo: Todo;
  list: TodoList | undefined;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onToggle: (todoId: string) => void;
  onToggleStar: (todoId: string) => void;
  onToggleSubtask: (todoId: string, subtaskId: string) => void;
}) {
  /* Held here rather than left to Radix so the card's own doors — edit,
     delete — can put it away as they go. */
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The row's right-click opens its card, the way a chip's does.
          onContextMenu={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs leading-5 text-foreground transition-colors duration-base hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            todo.done && "opacity-55"
          )}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: paletteVar(list?.color ?? "gray") }}
          />
          <PriorityBar priority={todo.priority} />
          <span
            className={cn(
              "truncate",
              todo.done && "text-foreground-subtle line-through"
            )}
          >
            {todo.title}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80">
        <TaskCard
          todo={todo}
          list={list}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onToggleStar={onToggleStar}
          onToggleSubtask={onToggleSubtask}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface CalendarViewProps {
  todos: Todo[];
  lists: TodoList[];
  /** Opens the shared editor on a task — from the card's 编辑 button. */
  onEdit: (todo: Todo) => void;
  /** Opens the shared editor empty, its due date already set to `iso`. */
  onCreateFor: (iso: string) => void;
  /** Moves a task's due date to `iso`. The caller owns the toast and undo. */
  onReschedule: (todoId: string, iso: string) => void;
  /** Deletes a task — the caller owns the toast and the undo. */
  onDelete: (todo: Todo) => void;
  /** Toggles a task done — the same path the checkbox takes, so a repeating
      task spawns its next occurrence and the toast names it. */
  onToggle: (todoId: string) => void;
  onToggleStar: (todoId: string) => void;
  onToggleSubtask: (todoId: string, subtaskId: string) => void;
}

export function CalendarView({
  todos,
  lists,
  onEdit,
  onCreateFor,
  onReschedule,
  onDelete,
  onToggle,
  onToggleStar,
  onToggleSubtask,
}: CalendarViewProps) {
  const { t, language } = useI18n();
  const today = useTodayISO();
  const [month, setMonth] = useState<MonthKey>(() => monthOf(today));
  /** Whether finished tasks are drawn at all. A view choice like the
      sidebar's rail — on screen, and not persisted: the calendar is read at
      a glance, and most glances want the work that is left. */
  const [showDone, setShowDone] = useState(true);

  /* The id mid-drag, kept in state because `dataTransfer` is unreadable
     during `dragover` — the drop zones need to know a drag is theirs to
     answer before the drop itself arrives. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** The day the pointer is over, while dragging — the one that lights up. */
  const [dropIso, setDropIso] = useState<string | null>(null);
  /** The chip whose card is open. One at a time: a second click closes the
      first card before opening its own. */
  const [openChipId, setOpenChipId] = useState<string | null>(null);

  const listById = useMemo(() => {
    const map = new Map<string, TodoList>();
    for (const list of lists) map.set(list.id, list);
    return map;
  }, [lists]);

  /** Every dated task, bucketed by its day. Undated tasks are not the
      calendar's business — see the module comment — and neither are finished
      ones while 隐藏已完成 is on. */
  const byDay = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!todo.dueDate) continue;
      if (!showDone && todo.done) continue;
      const bucket = map.get(todo.dueDate);
      if (bucket) bucket.push(todo);
      else map.set(todo.dueDate, [todo]);
    }
    for (const bucket of map.values()) bucket.sort(sortForDay);
    return map;
  }, [todos, showDone]);

  const weeks = useMemo(() => gridWeeks(month), [month]);
  const weekNames = useMemo(() => weekdayNames(language), [language]);

  /* The month and year the grid is on, split for the two dropdowns. */
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;

  /** The twelve months in the reader's own words — the platform's calendar,
      the same source the weekday header uses. */
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(LOCALES[language], { month: "long" }).format(
          new Date(2024, i, 1)
        )
      ),
    [language]
  );

  /** The years worth offering: a decade either side of this one, stretched
      further wherever the dated tasks actually reach. The window is fixed
      on purpose — a dropdown fed only by the data would trap the reader in
      the years that already have tasks, with nowhere to plan ahead or look
      back at an empty year. */
  const yearOptions = useMemo(() => {
    const current = Number(today.slice(0, 4));
    let min = current - 10;
    let max = current + 10;
    for (const todo of todos) {
      if (!todo.dueDate) continue;
      const y = Number(todo.dueDate.slice(0, 4));
      if (y < min) min = y;
      if (y > max) max = y;
    }
    const out: number[] = [];
    for (let y = min; y <= max; y++) out.push(y);
    return out;
  }, [todos, today]);

  /*
   * What a row can hold, read off the rendered grid rather than assumed:
   * the first cell's own padding and gap, the height of a real chip, and the
   * height of a real "+N" row. An arithmetic guess at these was four pixels
   * out — one chip's worth of wasted space under every overflowed day — and
   * a guess is what it will be again the next time a class changes.
   */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const measure = useCallback(() => {
    const grid = gridRef.current;
    const cell = grid?.firstElementChild as HTMLElement | null | undefined;
    if (!grid || !cell) return;
    const style = getComputedStyle(cell);
    const padY =
      (parseFloat(style.paddingTop) || 0) +
      (parseFloat(style.paddingBottom) || 0);
    // The cell's gap (date row → chips) is not the chips' own gap, and since
    // the two stopped being the same width they are measured apart. Both
    // fall back to the design's number if a class ever goes missing.
    const rowGap = parseFloat(style.rowGap) || ROW_GAP;
    const chipsCol = cell.querySelector<HTMLElement>("[data-chips]");
    const gap =
      parseFloat(getComputedStyle(chipsCol ?? cell).rowGap) || CHIP_GAP;
    const dateRow = cell.querySelector<HTMLElement>("[data-date-row]");
    const chip = grid.querySelector<HTMLElement>("[data-chip]");
    const more = grid.querySelector<HTMLElement>("[data-more]");
    /* The "+N" is measured with its margins: a negative one tucks the line
       closer to the chip above it, and the arithmetic has to see the space
       that actually goes, not the box's own height. */
    const moreStyle = more ? getComputedStyle(more) : null;
    const moreH = more
      ? more.offsetHeight +
        (parseFloat(moreStyle?.marginTop ?? "0") || 0) +
        (parseFloat(moreStyle?.marginBottom ?? "0") || 0)
      : MORE_H;
    setMetrics({
      area:
        cell.offsetHeight -
        padY -
        (dateRow?.offsetHeight ?? DATE_ROW_H) -
        rowGap,
      chip: chip?.offsetHeight ?? CHIP_H,
      more: moreH,
      gap,
    });
  }, []);

  /* Measured on layout rather than after paint (the count is what the paint
     shows), and again whenever the row height can have moved: the window
     resized, the month's week count changed, or the tasks came and went. */
  useLayoutEffect(() => {
    measure();
    const node = gridRef.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, weeks.length, todos.length]);

  /** How many chips a day may show at the current row height. A day that
      holds more folds the rest into its "+N" row rather than scrolling: the
      cell keeps its shape, the popover holds the whole day.

      Two numbers, because an overflowing day spends a row on the "+N" and
      that row is shorter than a chip — measured, not assumed: charging the
      row a whole chip's height left a band of empty cell under every
      overflowed day that could have held one more task. */
  const capacity = useMemo(() => {
    if (metrics === null) {
      return { all: MAX_VISIBLE, withMore: MAX_VISIBLE - 1 };
    }
    const { area, chip, more, gap } = metrics;
    const all = Math.floor((area + gap) / (chip + gap));
    const withMore = Math.floor((area - more) / (chip + gap));
    return {
      all: Math.max(1, Math.min(all, MAX_SHOWN)),
      withMore: Math.max(0, Math.min(withMore, MAX_SHOWN)),
    };
  }, [metrics]);

  const handleDragStart = (event: ReactDragEvent, todo: Todo) => {
    event.dataTransfer.setData("text/plain", todo.id);
    event.dataTransfer.effectAllowed = "move";
    /*
     * The native drag image would be a browser-rendered translucent
     * snapshot. Instead the chip is cloned — the copy carries the same
     * classes, so the stylesheet paints it exactly as the original looks —
     * and the clone rides the pointer at the same offset the pointer had
     * inside the chip when the drag began. Painted offscreen so it never
     * flashes in the layout, captured synchronously, dropped on the next
     * tick.
     */
    const chip = event.currentTarget as HTMLElement;
    const ghost = chip.cloneNode(true) as HTMLElement;
    ghost.style.position = "fixed";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.width = `${chip.offsetWidth}px`;
    ghost.style.margin = "0";
    document.body.appendChild(ghost);
    const rect = chip.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      ghost,
      event.clientX - rect.left,
      event.clientY - rect.top
    );
    window.setTimeout(() => ghost.remove(), 0);
    setDraggingId(todo.id);
  };

  const endDrag = () => {
    setDraggingId(null);
    setDropIso(null);
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      <h1 className="sr-only">{t("screen.calendar")}</h1>

      {/* The page is the viewport: below the header nothing scrolls — the
          month's weeks share whatever height is left, and only an
          over-full day folds into its popover. */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-5 pb-5 pt-6 sm:px-6 lg:px-8">
        {/* Month navigation, on one line that never rewraps: the steppers
            hug two fixed-width dropdowns, so a long month or year name never
            shifts them — and a month far away is two clicks, not thirty
            taps. The order follows the language, the way the words would
            read: 2026 年 9 月 against September 2026. */}
        <div className="mb-4 flex shrink-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={t("calendar.prevMonth")}
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className={ghostIcon}
            >
              <Icon icon={ChevronLeft} size="sm" />
            </button>
            {/* The year comes first or second depending on the language. */}
            {language === "zh" && (
              <Select
                value={String(year)}
                onValueChange={(v) => setMonth(`${v}-${month.slice(5, 7)}`)}
              >
                <SelectTrigger
                  aria-label={t("calendar.yearLabel")}
                  hideChevron
                  className="h-9 w-28 shrink-0 justify-center border-0 bg-transparent px-1.5 font-display text-lg font-semibold tabular-nums hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>span]:flex-1 [&>span]:text-center"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent nativeScroll>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)} hideIndicator>
                      {new Intl.DateTimeFormat(LOCALES[language], {
                        year: "numeric",
                      }).format(new Date(y, 0, 1))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* No arrows on the menus either, only the theme's own scrollbar —
                see the comment on `nativeScroll` in `ui/select.tsx`. */}
            <Select
              value={String(monthIndex)}
              onValueChange={(v) =>
                setMonth(
                  `${month.slice(0, 4)}-${String(Number(v) + 1).padStart(2, "0")}`
                )
              }
            >
              <SelectTrigger
                aria-label={t("calendar.monthLabel")}
                hideChevron
                className="h-9 w-32 shrink-0 justify-center border-0 bg-transparent px-1.5 font-display text-lg font-semibold tracking-tight hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>span]:flex-1 [&>span]:text-center"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent nativeScroll>
                {monthNames.map((name, index) => (
                  <SelectItem key={name} value={String(index)} hideIndicator>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {language !== "zh" && (
              <Select
                value={String(year)}
                onValueChange={(v) => setMonth(`${v}-${month.slice(5, 7)}`)}
              >
                <SelectTrigger
                  aria-label={t("calendar.yearLabel")}
                  hideChevron
                  className="h-9 w-28 shrink-0 justify-center border-0 bg-transparent px-1.5 font-display text-lg font-semibold tabular-nums hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>span]:flex-1 [&>span]:text-center"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent nativeScroll>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)} hideIndicator>
                      {new Intl.DateTimeFormat(LOCALES[language], {
                        year: "numeric",
                      }).format(new Date(y, 0, 1))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button
              type="button"
              aria-label={t("calendar.nextMonth")}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className={ghostIcon}
            >
              <Icon icon={ChevronRight} size="sm" />
            </button>
          </div>
          {/* Always in the row, even on the current month — a button that
              appears and disappears shifts the whole line as it comes. */}
          <Button
            variant="outline"
            size="sm"
            disabled={month === monthOf(today)}
            onClick={() => setMonth(monthOf(today))}
          >
            {t("date.today")}
          </Button>
          {/* 隐藏已完成: same shape as the 今天 button beside it — one row of
              quiet controls, one style. The label itself says which way the
              filter is set. */}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-pressed={!showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            {t(showDone ? "calendar.hideDone" : "calendar.showDone")}
          </Button>
        </div>

        {/* Weekday header. */}
        <div className="grid shrink-0 grid-cols-7">
          {weekNames.map((name) => (
            <div
              key={name}
              className="px-2 pb-1.5 text-xs font-medium text-foreground-faint"
            >
              {name}
            </div>
          ))}
        </div>

        {/* The grid: hairlines painted by a `bg-border` wrapper showing
            through 1px gaps. The rows are the month's own weeks, sharing the
            leftover height equally. */}
        <div
          ref={gridRef}
          className="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border"
          style={{
            gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))`,
          }}
        >
          {weeks.flat().map((iso) => {
            const items = byDay.get(iso) ?? [];
            // A day that overflows keeps one task back for the "+N" row:
            // `withMore` is what can sit above that row.
            const shown =
              items.length <= capacity.all
                ? items
                : items.slice(
                    0,
                    Math.min(items.length - 1, capacity.withMore)
                  );
            const hidden = items.length - shown.length;
            const inMonth = monthOf(iso) === month;
            return (
              <div
                key={iso}
                onDragOver={
                  draggingId === null
                    ? undefined
                    : (event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (dropIso !== iso) setDropIso(iso);
                      }
                }
                onDragLeave={() => {
                  if (dropIso === iso) setDropIso(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain");
                  if (id) onReschedule(id, iso);
                  endDrag();
                }}
                className={cn(
                  "group flex min-h-0 flex-col gap-1 overflow-hidden p-1.5 transition-colors duration-base",
                  inMonth ? "bg-background" : "bg-muted/50",
                  dropIso === iso &&
                    draggingId !== null &&
                    "ring-2 ring-inset ring-ring"
                )}
              >
                <div
                  data-date-row=""
                  className="flex shrink-0 items-center justify-between px-0.5"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                      iso === today
                        ? "bg-foreground font-semibold text-background"
                        : inMonth
                          ? "text-foreground-muted"
                          : "text-foreground-faint"
                    )}
                  >
                    {Number(iso.slice(8))}
                  </span>
                  {/* The mouse path to a task on this day; the keyboard path
                      is the same button, reached by Tab. */}
                  <button
                    type="button"
                    aria-label={t("calendar.newTaskFor", {
                      date: formatDate(iso, language),
                    })}
                    onClick={() => onCreateFor(iso)}
                    className="rounded-sm p-0.5 text-foreground-faint opacity-0 transition-opacity duration-base hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  >
                    <Icon icon={Plus} size="sm" />
                  </button>
                </div>
                {/* The chips never scroll and never clip a neighbour: the
                    count above is measured, and what is left goes to the
                    popover. */}
                <div
                  data-chips=""
                  className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
                >
                  {shown.map((todo) => (
                    <TaskChip
                      key={todo.id}
                      todo={todo}
                      list={listById.get(todo.listId)}
                      open={openChipId === todo.id}
                      onOpenChange={(open) =>
                        setOpenChipId(open ? todo.id : null)
                      }
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onToggle={onToggle}
                      onToggleStar={onToggleStar}
                      onToggleSubtask={onToggleSubtask}
                      onDragStart={handleDragStart}
                      onDragEnd={endDrag}
                    />
                  ))}
                  {hidden > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          // Measured by the screen to size a day: see `measure`.
                          data-more=""
                          /* A tighter line box than the chips wear on purpose:
                             this row is a footnote, and the 4px it gives back
                             are the 4px that let one more task show. */
                          className="shrink-0 rounded-sm px-1.5 text-left text-xs leading-4 text-foreground-faint transition-colors duration-base hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {t("calendar.more", { n: hidden })}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 p-1.5">
                        <p className="px-1.5 pb-1 pt-0.5 text-xs font-medium text-foreground-faint">
                          {formatDate(iso, language)} · {items.length}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {items.map((todo) => (
                            <DayItem
                              key={todo.id}
                              todo={todo}
                              list={listById.get(todo.listId)}
                              onEdit={onEdit}
                              onDelete={onDelete}
                              onToggle={onToggle}
                              onToggleStar={onToggleStar}
                              onToggleSubtask={onToggleSubtask}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
