/**
 * Domain types for the Orkest Todo app.
 */

import type { MessageKey } from "@/lib/messages";

export type Priority = "urgent" | "high" | "medium" | "low";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Todo {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  /** Pinned to the "已加星" smart view. */
  starred: boolean;
  priority: Priority;
  /** Local calendar date, `YYYY-MM-DD`. `null` = no due date. */
  dueDate: string | null;
  listId: string;
  tags: string[];
  subtasks: Subtask[];
  /** Repeat rule; `null` = a one-off task. See `Recur` above. */
  recur: Recur | null;
  createdAt: number;
  completedAt: number | null;
}

/**
 * A task's repeat rule.
 *
 * `daily` carries its own interval — every 1 day is 每天, every 3 days is
 * 每 3 天 — while `weekdays` names whole weekdays (0 = Sunday … 6 = Saturday)
 * and repeats on whichever of them come next, in calendar order rather than in
 * the order picked. The bare kinds (`weekly` / `monthly` / `yearly`) advance
 * the due date by one of their unit, and a month or year that has no such day
 * (Jan 31 → Feb, Feb 29 → a common year) clamps to that unit's last day.
 *
 * `null` on a `Todo` means the task does not repeat.
 */
export type Recur =
  | { kind: "daily"; interval: number }
  | { kind: "weekly" }
  | { kind: "weekdays"; days: number[] }
  | { kind: "monthly" }
  | { kind: "yearly" };

export interface TodoList {
  id: string;
  name: string;
  /** Key into the Orkest 19-color project palette. */
  color: PaletteName;
}

/**
 * The longest a title may be typed out to.
 *
 * Two fields set a task's title — the quick-add bar and the editor — and they
 * have to agree, so the number lives here rather than beside either of them.
 * It is a ceiling on what a person can type, not a rule the store enforces:
 * data already saved is never truncated, and a title arriving from elsewhere is
 * shown as it is.
 */
export const TITLE_MAX = 50;

/** A list's name is read in a 264px sidebar, where it is truncated anyway, so
    it needs far less room than a title before it stops being a name. */
export const LIST_NAME_MAX = 40;

export type PaletteName =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose"
  | "gray"
  | "slate";

export const PALETTE: PaletteName[] = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "gray",
  "slate",
];

/** Smart views are derived from the todo set, not stored on the todo. */
export type ViewId =
  | "all"
  | "today"
  | "upcoming"
  | "overdue"
  | "starred"
  | "completed";

export const VIEW_ORDER: ViewId[] = [
  "all",
  "today",
  "upcoming",
  "overdue",
  "starred",
  "completed",
];

/**
 * What fills the main area. Every screen but `todos` is its own place rather
 * than another filter over the task list, which is why they are screens and
 * not views.
 */
export type Screen = "todos" | "focus" | "stats" | "settings";

export type StatusFilter = "all" | "active" | "completed";
export type SortKey = "due" | "priority" | "created" | "title";

export interface PriorityMeta {
  /**
   * Message keys, not strings. A priority is named in the filter chips, the
   * card badge, the card's "set priority" submenu and the editor's select, and
   * every one of those renders through `t` — so the dictionary has to be the
   * single owner of the wording, here as anywhere else.
   *
   * `keyof typeof zh` is checked against the dictionary, so a renamed message
   * breaks the build instead of silently printing the key.
   */
  labelKey: MessageKey;
  shortKey: MessageKey;
  /** Badge variant from `components/ui/badge`. */
  badge: "danger" | "warning" | "info" | "secondary";
  /** CSS var holding the accent color for this priority. */
  cssVar: string;
  rank: number;
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  urgent: {
    labelKey: "priority.urgent",
    shortKey: "priority.urgent.short",
    badge: "danger",
    cssVar: "--red",
    rank: 0,
  },
  high: {
    labelKey: "priority.high",
    shortKey: "priority.high.short",
    badge: "warning",
    cssVar: "--orange",
    rank: 1,
  },
  medium: {
    labelKey: "priority.medium",
    shortKey: "priority.medium.short",
    badge: "info",
    cssVar: "--blue",
    rank: 2,
  },
  low: {
    labelKey: "priority.low",
    shortKey: "priority.low.short",
    badge: "secondary",
    cssVar: "--foreground-subtle",
    rank: 3,
  },
};

export const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];

/** `var(--color-*)` for a palette name — used for list dots and tag chips. */
export function paletteVar(name: PaletteName): string {
  return `var(--color-${name})`;
}
