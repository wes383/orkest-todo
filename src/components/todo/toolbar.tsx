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
import { viewImpliedStatus, type Filters } from "@/lib/selectors";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  type SortKey,
  type StatusFilter,
} from "@/lib/types";

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
const CONTROL = "h-10 text-sm";

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

  /** Only the two controls inside the popover — the trigger's badge reflects it. */
  const narrowingCount =
    (filters.priority !== "all" ? 1 : 0) + (filters.tag ? 1 : 0);

  /** True when the active view already decides the status for us. */
  const statusLocked = viewImpliedStatus(filters.view) !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
       * The status segmented control is only rendered in 全部任务.
       *
       * `matchesView` already pins the status in every other view — 今天 /
       * 即将到期 / 已逾期 / 已加星 require `!todo.done`, 已完成 requires
       * `todo.done` — so a status filter there can only do one of two useless
       * things: 进行中 changes nothing, 已完成 guarantees an empty list. Showing
       * a control whose every option is a no-op (or a trap) is worse than not
       * showing it, and the freed 200px goes to the search field.
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
           * with the 40px controls beside it.
           */}
          <TabsList className="h-10 shrink-0 gap-1 p-0">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-10 px-3.5 text-sm"
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

        <PopoverContent align="end" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
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

          {tags.length > 0 && (
            <div className="flex flex-col gap-2">
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
