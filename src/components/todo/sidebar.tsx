import * as React from "react";
import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  EyeOff,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Star,
  Timer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SubsectionLabel } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  HIDEABLE_VIEWS,
  type AppSettings,
  type HideableView,
} from "@/lib/settings";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MessageKey } from "@/lib/messages";
import type { TodoList, ViewId } from "@/lib/types";
import { paletteVar } from "@/lib/types";
import type { Screen } from "@/lib/types";

interface ViewDef {
  id: ViewId;
  /** Message keys, shared with the tray rows so the two can never diverge. */
  labelKey: MessageKey;
  icon: typeof Inbox;
}

const VIEWS: ViewDef[] = [
  { id: "all", labelKey: "view.all", icon: Inbox },
  { id: "today", labelKey: "view.today", icon: CalendarDays },
  { id: "upcoming", labelKey: "view.upcoming", icon: CalendarClock },
  { id: "overdue", labelKey: "view.overdue", icon: AlertTriangle },
  { id: "starred", labelKey: "view.starred", icon: Star },
  { id: "completed", labelKey: "view.completed", icon: CheckCircle2 },
];

/** Shared shape for every row in the sidebar — views, lists, everything. */
const rowLayout =
  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The same shape as an icon rail: the same box, narrowed to a square and
    centred, so a collapsed row cannot drift from the row it replaced. No
    `px-3` — the width is the square's. */
const rowLayoutRail = cn(rowLayout, "justify-center px-0 py-0 h-9 w-9");

/** The icons keep their colour with no text to tint, and hover still paints the
    row — the one signal an icon-only rail can carry. */
const rowIdleRail = "text-foreground-muted hover:bg-hover-bg hover:text-foreground";
const rowActiveRail = "bg-hover-bg-strong text-foreground";

const rowIdle = "text-foreground-muted hover:bg-hover-bg hover:text-foreground";
const rowActive = "bg-hover-bg-strong font-medium text-foreground";

/** Text-only variants, for rows whose background is painted by a wrapper. */
const rowIdleText = "text-foreground-muted";
const rowActiveText = "font-medium text-foreground";

/** Expanded rail width and the collapsed one. The collapsed value is one
    decision, not two: the aside's own padding and the row's fixed `w-9` only
    put the icon on the centre line at this width. */
const widthExpanded = "w-[264px]";
const widthCollapsed = "w-14";

/**
 * The hover caption for one row, in the rail only.
 *
 * Expanded, a row prints its own name, so a tooltip would only repeat what is
 * already on screen; nothing is rendered and the row is returned untouched.
 * Collapsed, that name is gone and this is the only thing left able to carry
 * it.
 *
 * `side="right"`: a rail square sits in a narrow column with the whole main
 * area to its right, which is where a caption belongs.
 *
 * ## Why the button and the menu are two separate props
 *
 * `TooltipTrigger asChild` hands its props to Radix's `Slot`, which does
 * `React.cloneElement(children, mergedProps)` — it merges onto whatever element
 * it is *given*. Only a real element that forwards its props to a DOM node will
 * therefore work. A Radix Root such as `ContextMenu` is the trap: it renders a
 * provider, spreads the props it receives into that provider, and puts no DOM
 * on the screen at all — so the hover handlers are accepted, dropped, and the
 * row goes silently inert with no error to find.
 *
 * Hence `button` and `menu` are taken apart here and re-assembled in the one
 * order that works: every `asChild` chain must bottom out on the real `button`,
 * and no Root may ever sit *inside* one. Concretely, for a row with a menu:
 *
 *   ContextMenu > Tooltip > TooltipTrigger asChild
 *                        > ContextMenuTrigger asChild > button
 *
 * Both triggers clone the same `button`, each merging its own props onto it —
 * the tooltip's hover handlers and the menu's `onContextMenu` coexist. Ordering
 * the menu *outside* the tooltip is what keeps `ContextMenu` out of the clone
 * chain; putting it inside (or handing it directly to `asChild`) is the version
 * that silently swallows the handlers and leaves the row inert.
 */
function RailTip({
  label,
  collapsed,
  button,
  menu,
  wrapperClass,
}: {
  label: string;
  collapsed: boolean;
  /** The row itself, built with the label it should carry when collapsed. */
  button: (railLabel?: string) => React.ReactElement;
  /** The right-click menu content, if the row has one. */
  menu?: React.ReactNode;
  /** Extra classes for the `group relative` wrapper the expanded list rows
      need — it is what paints their background so the hover survives the
      pointer stepping onto the ⋯ button. */
  wrapperClass?: string;
}) {
  const row = button(collapsed ? label : undefined);

  if (!collapsed) {
    // The wrapper is what the pointer actually hovers once it reaches the ⋯
    // button, so it has to sit outside the row but inside the menu trigger.
    const wrapped = wrapperClass ? (
      <div className={wrapperClass}>{row}</div>
    ) : (
      row
    );
    if (!menu) return wrapped;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{wrapped}</ContextMenuTrigger>
        <ContextMenuContent className="w-40">{menu}</ContextMenuContent>
      </ContextMenu>
    );
  }

  /*
   * The rail always gets the tooltip; the menu is optional. Both triggers have
   * to be handed the `button` itself, so they are stacked rather than nested —
   * `ContextMenuTrigger` is what the tooltip trigger clones, and it passes the
   * merged props straight down to the button.
   */
  const tipped = (
    <Tooltip>
      <TooltipTrigger asChild>
        {menu ? (
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        ) : (
          row
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  if (!menu) return tipped;
  return (
    <ContextMenu>
      {tipped}
      <ContextMenuContent className="w-40">{menu}</ContextMenuContent>
    </ContextMenu>
  );
}

export interface SidebarProps {
  lists: TodoList[];
  counts: Record<ViewId, number>;
  listCounts: Record<string, number>;
  activeView: ViewId;
  activeListId: string | null;
  /** Which screen fills the main area — the sidebar never leaves, so it needs
      to know what it is sitting beside. */
  screen: Screen;
  /** Which views are hidden, straight from the settings page. */
  settings: AppSettings;
  onSelectFocus: () => void;
  onSelectStats: () => void;
  onSelectSettings: () => void;
  onSelectView: (view: ViewId) => void;
  /** Right-click on a hideable view row: the same hide the settings page
      offers, without the trip there. */
  onHideView: (view: HideableView) => void;
  onSelectList: (listId: string | null) => void;
  onCreateList: () => void;
  onEditList: (list: TodoList) => void;
  onDeleteList: (list: TodoList) => void;
}

export function Sidebar({
  lists,
  counts,
  listCounts,
  activeView,
  activeListId,
  screen,
  settings,
  onSelectFocus,
  onSelectStats,
  onSelectSettings,
  onSelectView,
  onHideView,
  onSelectList,
  onCreateList,
  onEditList,
  onDeleteList,
}: SidebarProps) {
  const { t } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<TodoList | null>(null);
  /*
   * The rail is a mode, not a preference. It lives here rather than in settings
   * because the state is its own explanation — the toggle that sets it is on
   * screen, so nobody has to be told they chose it. The cost is deliberate: a
   * reload brings the sidebar back at full width.
   */
  const [collapsed, setCollapsed] = useState(false);

  /*
   * The last list cannot be deleted. Quick-add needs a list to file a task
   * into — and `removeList` at its floor would resurrect the seeded defaults,
   * so the delete would look *ignored* rather than refused. Choosing 删除清单
   * on the last row therefore still opens a dialog; that dialog just has no way
   * through. The menu items stay enabled on purpose: a prompt states the rule,
   * a greyed-out row only hints at one.
   */
  const lastList = pendingDelete !== null && lists.length <= 1;

  /** The two forms every row in the sidebar takes: the full-width row with its
      label, or the square the rail shows. Each caller passes the strings its
      own row already uses, so the rail cannot invent a style of its own. */
  const rowClass = (active: boolean) =>
    collapsed
      ? cn(rowLayoutRail, active ? rowActiveRail : rowIdleRail)
      : cn(rowLayout, active ? rowActive : rowIdle);

  /** The row's own colour classes when a wrapper paints the background: the
      list rows expanded, and nothing in the rail, where the row paints it. */
  const rowTextClass = (active: boolean) =>
    collapsed ? undefined : active ? rowActiveText : rowIdleText;

  return (
    <aside
      className={cn(
        "no-select flex shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar transition-[width] duration-slow ease-out",
        collapsed ? widthCollapsed : widthExpanded
      )}
    >
      <ScrollArea className="flex-1">
        <div
          className={cn(
            "flex flex-col",
            collapsed ? "items-center gap-2 px-3 py-4" : "gap-6 px-3 py-5"
          )}
        >
          {/* Smart views */}
          <section className={collapsed ? "w-9" : undefined}>
            {/* Expanded, this caption names the group. Collapsed, it has nothing
                to say and no room to say it — and the hairline that replaced it
                had nothing above it to separate, so the rail simply starts with
                the rows. The views/lists divider below is still printed: that one
                does separate two groups. */}
            {!collapsed && (
              <SubsectionLabel className="px-3 text-xs text-foreground-subtle">
                {t("sidebar.sectionViews")}
              </SubsectionLabel>
            )}
            <nav
              className={cn(
                "flex flex-col gap-0.5",
                !collapsed && "mt-2",
                collapsed && "items-center"
              )}
            >
              {VIEWS.map((view) => {
                // A view switched off in settings simply has no row. The count
                // still exists (the tray uses it); the sidebar just stops
                // printing it.
                if (
                  HIDEABLE_VIEWS.includes(view.id as never) &&
                  settings.hiddenViews[view.id as never]
                ) {
                  return null;
                }

                // Nothing below the hairline is "current" while the focus screen
                // has the main area: these views all describe a list of tasks
                // that is not on screen.
                const active =
                  screen === "todos" &&
                  activeView === view.id &&
                  activeListId === null;
                const count = counts[view.id];
                const alarming = view.id === "overdue" && count > 0;

                /*
                 * Right-click hides a view — but only a hideable one. 全部任务
                 * and 今天 are the app's spine; a context menu offering to
                 * remove them would be an offer the settings page would refuse,
                 * so those two rows simply have no menu at all.
                 */
                const row = (railLabel?: string) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => onSelectView(view.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={railLabel}
                    className={rowClass(active)}
                  >
                    <Icon
                      icon={view.icon}
                      size="sm"
                      className={alarming ? "text-red" : undefined}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate text-left">
                          {t(view.labelKey)}
                        </span>
                        {count > 0 && (
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              alarming ? "text-red" : "text-foreground-subtle"
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );

                /*
                 * Right-click hides a view — but only a hideable one. 全部任务
                 * and 今天 are the app's spine; a context menu offering to
                 * remove them would be an offer the settings page would refuse,
                 * so those two rows simply have no menu at all.
                 */
                const hideItem = HIDEABLE_VIEWS.includes(view.id as never) ? (
                  <ContextMenuItem
                    onSelect={() => onHideView(view.id as HideableView)}
                  >
                    <Icon icon={EyeOff} size="sm" />
                    {t("sidebar.hideView")}
                  </ContextMenuItem>
                ) : undefined;

                return (
                  <RailTip
                    key={view.id}
                    label={t(view.labelKey)}
                    collapsed={collapsed}
                    button={row}
                    menu={hideItem}
                  />
                );
              })}
            </nav>
          </section>

          {/* Lists */}
          <section className={collapsed ? "w-9" : undefined}>
            {collapsed ? (
              <hr className="mb-2 border-border" />
            ) : (
              <div className="flex items-center justify-between pl-3 pr-1">
                <SubsectionLabel className="text-xs text-foreground-subtle">
                  {t("sidebar.sectionLists")}
                </SubsectionLabel>
                <RailTip
                  label={t("sidebar.newList")}
                  collapsed={collapsed}
                  button={() => (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("sidebar.newList")}
                      onClick={onCreateList}
                    >
                      <Icon icon={Plus} size="sm" />
                    </Button>
                  )}
                />
              </div>
            )}

            <nav
              className={cn(
                "flex flex-col gap-0.5",
                !collapsed && "mt-2",
                collapsed && "items-center"
              )}
            >
              <RailTip
                label={t("sidebar.allLists")}
                collapsed={collapsed}
                button={(railLabel) => (
                  <button
                    type="button"
                    onClick={() => onSelectList(null)}
                    aria-label={railLabel}
                    className={rowClass(
                      screen === "todos" && activeListId === null
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-foreground-faint" />
                    {!collapsed && (
                      <span className="flex-1 truncate text-left">
                        {t("sidebar.allLists")}
                      </span>
                    )}
                  </button>
                )}
              />

              {lists.map((list) => {
                const active = screen === "todos" && activeListId === list.id;
                const count = listCounts[list.id] ?? 0;
                /*
                 * Right-click on a list row speaks the same language as its ⋯
                 * button: rename, delete. One context menu wrapping the whole
                 * row — the little trigger stays where it was, hover-revealed
                 * and unchanged.
                 *
                 * In the rail that trigger is gone outright: 28px of card that
                 * appear on hover do not fit in a 36px square, and a control
                 * that only exists while the pointer is on it has nowhere to be
                 * in a column of icons. It shares its trigger with the right
                 * click, which the rail keeps — so nothing is lost, only moved.
                 */
                const listRow = (railLabel?: string) => (
                  <button
                    type="button"
                    onClick={() => onSelectList(list.id)}
                    aria-current={active ? "true" : undefined}
                    aria-label={railLabel}
                    className={cn(
                      rowClass(active),
                      rowTextClass(active),
                      !collapsed && "pr-9"
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: paletteVar(list.color) }}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate text-left">
                          {list.name}
                        </span>
                        {count > 0 && (
                          <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                            {count}
                          </span>
                        )}
                      </>
                    )}

                    {!collapsed && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("sidebar.listActions", {
                              name: list.name,
                            })}
                            className="absolute right-1 h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          >
                            <Icon icon={MoreHorizontal} size="sm" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onSelect={() => onEditList(list)}>
                            <Icon icon={Pencil} size="sm" />
                            {t("sidebar.renameList")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setPendingDelete(list)}
                          >
                            <Icon icon={Trash2} size="sm" />
                            {t("sidebar.deleteList")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </button>
                );

                return (
                  <RailTip
                    key={list.id}
                    label={list.name}
                    collapsed={collapsed}
                    button={listRow}
                    wrapperClass={cn(
                      "group relative flex items-center rounded-md transition-colors duration-base ease-out",
                      active ? "bg-hover-bg-strong" : "hover:bg-hover-bg"
                    )}
                    menu={
                      <>
                        <ContextMenuItem onSelect={() => onEditList(list)}>
                          <Icon icon={Pencil} size="sm" />
                          {t("sidebar.renameList")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete(list)}
                        >
                          <Icon icon={Trash2} size="sm" />
                          {t("sidebar.deleteList")}
                        </ContextMenuItem>
                      </>
                    }
                  />
                );
              })}

              {/* The rail's only door to a new list, below the lists so the
                  colour dots keep the column they have when expanded. */}
              {collapsed && (
                <RailTip
                  label={t("sidebar.newList")}
                  collapsed
                  button={() => (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("sidebar.newList")}
                      onClick={onCreateList}
                      className="mt-1"
                    >
                      <Icon icon={Plus} size="sm" />
                    </Button>
                  )}
                />
              )}
            </nav>
          </section>
        </div>
      </ScrollArea>

      {/*
       * Footer — the three doors that are not filters over the tasks. The old
       * footer (overall progress, percent, the language and appearance menus)
       * is gone: the progress belonged to a view of the tasks, and both menus
       * have a roomier home on the settings page now. What stays is a trio of
       * plain rows, styled like every other row above them — 专注, 统计 and
       * 设置 are screens, not toggles, and the row shape says so. Pinned below
       * the scroll area so they hold their place no matter how long the lists
       * above them grow.
       */}
      <div
        className={cn(
          "border-t border-border",
          collapsed ? "flex flex-col items-center gap-0.5 px-3 py-3" : "px-3 py-3"
        )}
      >
        <nav
          className={cn(
            "flex flex-col gap-0.5",
            collapsed && "items-center"
          )}
        >
          {/* No count on focus, either. Every view row above carries a number
              of tasks; the focus screen has none to carry, and a `0` there
              would be a lie rather than an absence. And no green on the icon —
              every row here lets its icon take the row's colour. */}
          <RailTip
            label={t("focus.title")}
            collapsed={collapsed}
            button={(railLabel) => (
              <button
                type="button"
                onClick={onSelectFocus}
                aria-current={screen === "focus" ? "page" : undefined}
                aria-label={railLabel}
                className={rowClass(screen === "focus")}
              >
                <Icon icon={Timer} size="sm" />
                {!collapsed && (
                  <span className="flex-1 truncate text-left">
                    {t("focus.title")}
                  </span>
                )}
              </button>
            )}
          />
          <RailTip
            label={t("screen.stats")}
            collapsed={collapsed}
            button={(railLabel) => (
              <button
                type="button"
                onClick={onSelectStats}
                aria-current={screen === "stats" ? "page" : undefined}
                aria-label={railLabel}
                className={rowClass(screen === "stats")}
              >
                <Icon icon={BarChart3} size="sm" />
                {!collapsed && (
                  <span className="flex-1 truncate text-left">
                    {t("screen.stats")}
                  </span>
                )}
              </button>
            )}
          />
          <RailTip
            label={t("screen.settings")}
            collapsed={collapsed}
            button={(railLabel) => (
              <button
                type="button"
                onClick={onSelectSettings}
                aria-current={screen === "settings" ? "page" : undefined}
                aria-label={railLabel}
                className={rowClass(screen === "settings")}
              >
                <Icon icon={Settings} size="sm" />
                {!collapsed && (
                  <span className="flex-1 truncate text-left">
                    {t("screen.settings")}
                  </span>
                )}
              </button>
            )}
          />

          {/*
           * The rail's own door. It sits with 专注 / 统计 / 设置 rather than
           * with the lists because it is not a filter over the tasks — it is a
           * thing you do to the window, which is what this end of the sidebar
           * is for. It is the only control here that is not a screen, so it is
           * the only one with no active state to show.
           */}
          <RailTip
            label={t("sidebar.expand")}
            collapsed={collapsed}
            button={(railLabel) => (
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                aria-expanded={!collapsed}
                aria-label={railLabel ?? t("sidebar.collapse")}
                className={rowClass(false)}
              >
                <Icon
                  icon={collapsed ? ChevronsRight : ChevronsLeft}
                  size="sm"
                />
                {!collapsed && (
                  <span className="flex-1 truncate text-left">
                    {t("sidebar.collapse")}
                  </span>
                )}
              </button>
            )}
          />
        </nav>
      </div>

      {/* The confirmation — only ever reached when there is a list to spare. */}
      <AlertDialog
        open={pendingDelete !== null && !lastList}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.deleteListTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteListBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (pendingDelete) onDeleteList(pendingDelete);
                setPendingDelete(null);
              }}
            >
              {t("sidebar.deleteList")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
       * The refusal: same trigger as the confirmation above, same dialog shape,
       * one button that only closes. A destructive-tinted primary button with
       * nothing to confirm would be a lie about what is on offer.
       */}
      <AlertDialog
        open={lastList}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.deleteLastTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteLastBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPendingDelete(null)}>
              {t("common.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
