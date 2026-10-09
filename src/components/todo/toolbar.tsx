import type { ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, InputWithIcon } from "@/components/ui/input";
import { KbdChord } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubsectionLabel } from "@/components/ui/section";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, MOD_KEY } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { viewImpliedStatus, dateFilterApplies, type Filters } from "@/lib/selectors";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  type DateFilterKey,
  type SortKey,
  type StatusFilter,
} from "@/lib/types";

/** Keyed by `DateFilterKey` so the 日期 chips iterate like the sort menu —
    declaration order is chip order. The single-day options reuse the date
    vocabulary the due chips already speak. Exported for the blank-area
    menu's 日期 submenu, which shares both the keys and the order. */
export const DATE_FILTER_LABEL_KEYS: Record<
  Exclude<DateFilterKey, "today" | "tomorrow" | "dayAfter">,
  MessageKey
> = {
  thisWeek: "filter.date.thisWeek",
  nextWeek: "filter.date.nextWeek",
  thisMonth: "filter.date.thisMonth",
  nextMonth: "filter.date.nextMonth",
  thisYear: "filter.date.thisYear",
  withDate: "filter.date.withDate",
  noDate: "filter.date.noDate",
};

/**
 * Keyed by `SortKey` so the menu can be built by iterating the keys of this
 * record — the option order *is* the declaration order.
 */
const SORT_LABEL_KEYS: Record<SortKey, MessageKey> = {
  due: "toolbar.sort.due",
  priority: "toolbar.sort.priority",
  created: "toolbar.sort.created",
  title: "toolbar.sort.title",
};

const STATUS_TABS: { value: StatusFilter; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "toolbar.status.all" },
  { value: "active", labelKey: "toolbar.status.active" },
  { value: "completed", labelKey: "toolbar.status.completed" },
];

/** One control height across the whole bar keeps the row optically level. */
const CONTROL = "h-9 text-sm";

/**
 * A selectable pill. `Button` cannot express this — its variants are all
 * actions, not toggles — and `Chip` renders a `<span>`, so neither carries the
 * `aria-pressed` state a filter needs.
 */
function FilterChip({
  active,
  onClick,
  dotColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dotColor?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-base ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-border-strong bg-hover-bg-strong font-medium text-foreground"
          : "border-border bg-surface text-foreground-muted hover:bg-hover-bg hover:text-foreground"
      )}
    >
      {dotColor && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

export interface ToolbarProps {
  filters: Filters;
  tags: string[];
  activeFilterCount: number;
  /** Whether the search field prints the chord that reaches it. See
      `AppSettings.hideShortcutHints` — presentation only, nothing is unbound. */
  hideShortcutHints: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

/**
 * Toolbar — the entire query surface, on one row, inside the fixed header.
 *
 * It used to sit at the top of the scrolling body, which meant search, sort and
 * filter all slid out of view as soon as you scrolled into a long list. It now
 * owns the pinned header, so every way of narrowing the list stays reachable no
 * matter how far down you are, and the body is left to do exactly one job:
 * render rows.
 *
 * The row is query-only — creation lives next to the work (QuickAdd below,
 * Ctrl+N, the empty state), not in the chrome.
 *
 * Three broken-out `Select`s were the bulk of the old bar, so 优先级 and 标签
 * live behind one 筛选 trigger, leaving only 排序 in the open.
 *
 * The status segmented control is conditional: it appears only where a status
 * filter can actually do something (see the note at its render site).
 *
 * The result count is deliberately absent. `{n} 项` used to close this row, but
 * a number that describes the list reads better as the list's own footer than
 * as the last item in a row of controls — and here it also sat immediately
 * after the 筛选 button, where it looked like part of that control. It now
 * lives at the foot of the list in `App.tsx`.
 *
 * Those two are rendered as chips rather than selects on purpose: a Radix
 * `Select` inside a Radix `Popover` opens a second portal that the popover
 * reads as an outside interaction, so picking a value would close the panel.
 * Chips also let every option be visible at once.
 *
 * Widths are deliberately modest (search `flex-1` with a 180px floor, 136px
 * sort) because the window is resizable down to 940px, where the sidebar eats
 * 264px. The row wraps once it truly runs out of room rather than overflowing.
 */
export function Toolbar({
  filters,
  tags,
  activeFilterCount,
  hideShortcutHints,
  searchRef,
  onChange,
  onReset,
}: ToolbarProps) {
  const { t } = useI18n();

  /** Only the controls inside the popover — the trigger's badge reflects it. */
  const narrowingCount =
    (filters.priority !== "all" ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.dateFilter ? 1 : 0);

  /** True when the active view already decides the status for us. */
  const statusLocked = viewImpliedStatus(filters.view) !== null;

  /** 今天 / 已逾期 already are date answers; everywhere else the 日期
      chips are worth their row. */
  const showDateFilter = dateFilterApplies(filters.view);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/*
       * The status segmented control is only rendered where a status filter
       * can actually do something: 全部任务 and 今天 — the two views whose
       * scope holds finished and unfinished work alike (今天 keeps the
       * finished day, sunken) — and nowhere else. 即将到期 / 已逾期 / 已加星
       * already pin `!todo.done` and 已完成 pins `todo.done`, so a control
       * there could only offer no-ops or an empty list.
       *
       * `selectTodos` enforces the same rule on the data side, so the hidden
       * control can never leave a stale value quietly emptying the list.
       */}
      {statusLocked ? null : (
        <Tabs
          value={filters.status}
          onValueChange={(v) => onChange({ status: v as StatusFilter })}
        >
          {/*
           * No background on the list. `TabsTrigger` marks the active tab with
           * `bg-hover-bg`, so painting the same token on the track — as this did
           * — left the selection readable only by text colour. Orkest's own
           * showcase uses a bare `<TabsList>` for exactly that reason: the
           * floating pill *is* the track. Triggers go full height, and the list
           * drops its `p-1` padding, so the segmented control sits exactly level
           * with the 36px controls beside it.
           */}
          <TabsList className="h-9 shrink-0 gap-1 p-0">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-9 px-3 text-sm"
              >
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/*
       * The chord is written as separate keycaps (`Ctrl` `F`), and the field
       * pads for the wider slot: one cap reading "Ctrl F" was narrower than two
       * caps plus their gap, so the tail of a long query could slide underneath
       * the hint. `pr-20` is that gap plus the caps, measured at the widest the
       * two platforms print ("Ctrl"+"F", "⌘"+"F").
       *
       * 隐藏快捷键提示 takes the caps and the padding they measured together:
       * leaving the pad behind would reserve a slot for nothing, which is the
       * one thing a setting about reclaiming space must not do.
       */}
      <InputWithIcon
        size="sm"
        className="min-w-[180px] flex-1"
        leadingIcon={<Icon icon={Search} size="sm" />}
        trailingIcon={
          hideShortcutHints ? undefined : <KbdChord keys={[MOD_KEY, "F"]} />
        }
      >
        <Input
          ref={searchRef}
          size="sm"
          className={hideShortcutHints ? undefined : "pr-20"}
          value={filters.query}
          placeholder={t("toolbar.searchPlaceholder")}
          aria-label={t("toolbar.searchAria")}
          onChange={(e) => onChange({ query: e.target.value })}
        />
      </InputWithIcon>

      <Select
        value={filters.sort}
        onValueChange={(v) => onChange({ sort: v as SortKey })}
      >
        <SelectTrigger
          className={`${CONTROL} w-[136px] shrink-0`}
          aria-label={t("toolbar.sortAria")}
        >
          <SelectValue placeholder={t("toolbar.sortPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABEL_KEYS) as SortKey[]).map((key) => (
            <SelectItem key={key} value={key}>
              {t(SORT_LABEL_KEYS[key])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(CONTROL, "shrink-0 gap-2 px-4")}
            aria-label={t("toolbar.filterAria")}
          >
            <Icon icon={SlidersHorizontal} size="sm" />
            {t("toolbar.filter")}
            {narrowingCount > 0 && (
              <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                {narrowingCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <SubsectionLabel className="text-xs text-foreground-subtle">
              {t("common.priority")}
            </SubsectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={filters.priority === "all"}
                onClick={() => onChange({ priority: "all" })}
              >
                {t("common.all")}
              </FilterChip>
              {PRIORITY_ORDER.map((p) => (
                <FilterChip
                  key={p}
                  active={filters.priority === p}
                  dotColor={`var(${PRIORITY_META[p].cssVar})`}
                  onClick={() =>
                    onChange({ priority: filters.priority === p ? "all" : p })
                  }
                >
                  {t(PRIORITY_META[p].labelKey)}
                </FilterChip>
              ))}
            </div>
          </div>

          {showDateFilter && (
            <div className="flex flex-col gap-1.5">
              <SubsectionLabel className="text-xs text-foreground-subtle">
                {t("common.date")}
              </SubsectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={filters.dateFilter === null}
                  onClick={() => onChange({ dateFilter: null })}
                >
                  {t("common.all")}
                </FilterChip>
                <FilterChip
                  active={filters.dateFilter === "today"}
                  onClick={() =>
                    onChange({
                      dateFilter: filters.dateFilter === "today" ? null : "today",
                    })
                  }
                >
                  {t("date.today")}
                </FilterChip>
                <FilterChip
                  active={filters.dateFilter === "tomorrow"}
                  onClick={() =>
                    onChange({
                      dateFilter:
                        filters.dateFilter === "tomorrow" ? null : "tomorrow",
                    })
                  }
                >
                  {t("date.tomorrow")}
                </FilterChip>
                <FilterChip
                  active={filters.dateFilter === "dayAfter"}
                  onClick={() =>
                    onChange({
                      dateFilter:
                        filters.dateFilter === "dayAfter" ? null : "dayAfter",
                    })
                  }
                >
                  {t("date.dayAfter")}
                </FilterChip>
                {(
                  Object.keys(DATE_FILTER_LABEL_KEYS) as Exclude<
                    DateFilterKey,
                    "today" | "tomorrow" | "dayAfter"
                  >[]
                ).map((key) => (
                  <FilterChip
                    key={key}
                    active={filters.dateFilter === key}
                    onClick={() =>
                      onChange({
                        dateFilter: filters.dateFilter === key ? null : key,
                      })
                    }
                  >
                    {t(DATE_FILTER_LABEL_KEYS[key])}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <SubsectionLabel className="text-xs text-foreground-subtle">
                {t("common.tags")}
              </SubsectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={filters.tag === null}
                  onClick={() => onChange({ tag: null })}
                >
                  {t("common.all")}
                </FilterChip>
                {tags.map((tag) => (
                  <FilterChip
                    key={tag}
                    active={filters.tag === tag}
                    onClick={() =>
                      onChange({ tag: filters.tag === tag ? null : tag })
                    }
                  >
                    <span className="font-mono">#{tag}</span>
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <Icon icon={X} size="sm" />
              {t("toolbar.clearAllFilters")}
              <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                {activeFilterCount}
              </span>
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
