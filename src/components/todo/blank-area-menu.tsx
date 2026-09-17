import type { ReactNode } from "react";
import {
  ArrowDownWideNarrow,
  Check,
  Flag,
  ListFilter,
  Plus,
  Tag,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { viewImpliedStatus, type Filters } from "@/lib/selectors";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  type SortKey,
  type StatusFilter,
} from "@/lib/types";

/** Keyed by `SortKey` so the submenu is built by iterating the keys — the
    option order *is* the declaration order. Shares its keys with the toolbar's
    sort select, so the two can never disagree about what a sort is called. */
const SORT_LABEL_KEYS: Record<SortKey, MessageKey> = {
  due: "toolbar.sort.due",
  priority: "toolbar.sort.priority",
  created: "toolbar.sort.created",
  title: "toolbar.sort.title",
};

const STATUS_OPTIONS: { value: StatusFilter; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "toolbar.status.all" },
  { value: "active", labelKey: "toolbar.status.active" },
  { value: "completed", labelKey: "toolbar.status.completed" },
];

/** A menu row whose right edge shows a check when it names the current value —
    the context menu's way of being a radio group without a radio primitive. */
function CheckedItem({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenuItem onSelect={onSelect}>
      {children}
      {active && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
    </ContextMenuItem>
  );
}

export interface BlankAreaMenuProps {
  filters: Filters;
  /** Every tag in the store, already sorted — the same list the toolbar's
      filter popover offers. */
  tags: string[];
  /** The same patch function the toolbar speaks — one vocabulary for queries,
      whichever surface issues them. */
  onChange: (patch: Partial<Filters>) => void;
  onCreate: () => void;
  children: ReactNode;
}

/**
 * BlankAreaMenu — the task list's body, right-clicked.
 *
 * The rows own their context menus (actions on a task); the space between and
 * around them owns this one (actions on the *list*): create a task, or shape
 * the query — status, priority, tag, sort. Every filter here writes through the
 * same `onChange` patch the toolbar uses, so the toolbar's chips, count badge
 * and reset button all reflect a pick made from a right-click, and vice versa.
 *
 * The status submenu is conditional exactly like the toolbar's segmented
 * control: in any view other than 全部任务 the view itself already decides
 * what done-ness means, and offering 全部/进行中/已完成 there would be a menu
 * of no-ops and traps.
 *
 * The trigger wraps the whole scrolling body, cards included — but the cards
 * stop the event from bubbling (`todo-item.tsx`), so a right-click on a task
 * opens the task's menu and never this one. The quick-add field also opts out,
 * to keep the native text menu (copy / paste) on the input.
 */
export function BlankAreaMenu({
  filters,
  tags,
  onChange,
  onCreate,
  children,
}: BlankAreaMenuProps) {
  const { t } = useI18n();
  const statusLocked = viewImpliedStatus(filters.view) !== null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onCreate}>
          <Icon icon={Plus} size="sm" />
          {t("app.newTask")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {!statusLocked && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon icon={ListFilter} size="sm" />
              {t("blank.filterStatus")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {STATUS_OPTIONS.map((option) => (
                <CheckedItem
                  key={option.value}
                  active={filters.status === option.value}
                  onSelect={() => onChange({ status: option.value })}
                >
                  {t(option.labelKey)}
                </CheckedItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Icon icon={Flag} size="sm" />
            {t("blank.filterPriority")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <CheckedItem
              active={filters.priority === "all"}
              onSelect={() => onChange({ priority: "all" })}
            >
              {t("common.all")}
            </CheckedItem>
            {PRIORITY_ORDER.map((p) => (
              <CheckedItem
                key={p}
                active={filters.priority === p}
                onSelect={() => onChange({ priority: p })}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `var(${PRIORITY_META[p].cssVar})` }}
                  aria-hidden="true"
                />
                {t(PRIORITY_META[p].labelKey)}
              </CheckedItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {tags.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon icon={Tag} size="sm" />
              {t("blank.filterTag")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <CheckedItem
                active={filters.tag === null}
                onSelect={() => onChange({ tag: null })}
              >
                {t("common.all")}
              </CheckedItem>
              {tags.map((tag) => (
                <CheckedItem
                  key={tag}
                  active={filters.tag === tag}
                  onSelect={() => onChange({ tag })}
                >
                  <span className="font-mono">#{tag}</span>
                </CheckedItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Icon icon={ArrowDownWideNarrow} size="sm" />
            {t("toolbar.sortPlaceholder")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {(Object.keys(SORT_LABEL_KEYS) as SortKey[]).map((key) => (
              <CheckedItem
                key={key}
                active={filters.sort === key}
                onSelect={() => onChange({ sort: key })}
              >
                {t(SORT_LABEL_KEYS[key])}
              </CheckedItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
