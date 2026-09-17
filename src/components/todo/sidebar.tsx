import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
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
import { HIDEABLE_VIEWS, type AppSettings } from "@/lib/settings";
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

const rowIdle = "text-foreground-muted hover:bg-hover-bg hover:text-foreground";
const rowActive = "bg-hover-bg-strong font-medium text-foreground";

/** Text-only variants, for rows whose background is painted by a wrapper. */
const rowIdleText = "text-foreground-muted";
const rowActiveText = "font-medium text-foreground";

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
  onSelectList,
  onCreateList,
  onEditList,
  onDeleteList,
}: SidebarProps) {
  const { t } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<TodoList | null>(null);

  return (
    <aside className="no-select flex w-[264px] shrink-0 flex-col border-r border-border bg-sidebar">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 px-3 py-5">
          {/* Smart views */}
          <section>
            <SubsectionLabel className="px-3 text-xs text-foreground-subtle">
              {t("sidebar.sectionViews")}
            </SubsectionLabel>
            <nav className="mt-2 flex flex-col gap-0.5">
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
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => onSelectView(view.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(rowLayout, active ? rowActive : rowIdle)}
                  >
                    <Icon
                      icon={view.icon}
                      size="sm"
                      className={alarming ? "text-red" : undefined}
                    />
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
                  </button>
                );
              })}
            </nav>
          </section>

          {/* Lists */}
          <section>
            <div className="flex items-center justify-between pl-3 pr-1">
              <SubsectionLabel className="text-xs text-foreground-subtle">
                {t("sidebar.sectionLists")}
              </SubsectionLabel>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("sidebar.newList")}
                onClick={onCreateList}
              >
                <Icon icon={Plus} size="sm" />
              </Button>
            </div>

            <nav className="mt-2 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onSelectList(null)}
                className={cn(
                  rowLayout,
                  screen === "todos" && activeListId === null ? rowActive : rowIdle
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-foreground-faint" />
                <span className="flex-1 truncate text-left">
                  {t("sidebar.allLists")}
                </span>
              </button>

              {lists.map((list) => {
                const active = screen === "todos" && activeListId === list.id;
                const count = listCounts[list.id] ?? 0;
                return (
                  <div
                    key={list.id}
                    className={cn(
                      "group relative flex items-center rounded-md transition-colors duration-base ease-out",
                      active ? "bg-hover-bg-strong" : "hover:bg-hover-bg"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectList(list.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        rowLayout,
                        "pr-9",
                        active ? rowActiveText : rowIdleText
                      )}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: paletteVar(list.color) }}
                      />
                      <span className="flex-1 truncate text-left">
                        {list.name}
                      </span>
                      {count > 0 && (
                        <span className="font-mono text-xs tabular-nums text-foreground-subtle">
                          {count}
                        </span>
                      )}
                    </button>

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
                  </div>
                );
              })}
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
      <div className="border-t border-border px-3 py-3">
        <nav className="flex flex-col gap-0.5">
          {/* No count on focus, either. Every view row above carries a number
              of tasks; the focus screen has none to carry, and a `0` there
              would be a lie rather than an absence. And no green on the icon —
              every row here lets its icon take the row's colour. */}
          <button
            type="button"
            onClick={onSelectFocus}
            aria-current={screen === "focus" ? "page" : undefined}
            className={cn(rowLayout, screen === "focus" ? rowActive : rowIdle)}
          >
            <Icon icon={Timer} size="sm" />
            <span className="flex-1 truncate text-left">
              {t("focus.title")}
            </span>
          </button>
          <button
            type="button"
            onClick={onSelectStats}
            aria-current={screen === "stats" ? "page" : undefined}
            className={cn(rowLayout, screen === "stats" ? rowActive : rowIdle)}
          >
            <Icon icon={BarChart3} size="sm" />
            <span className="flex-1 truncate text-left">
              {t("screen.stats")}
            </span>
          </button>
          <button
            type="button"
            onClick={onSelectSettings}
            aria-current={screen === "settings" ? "page" : undefined}
            className={cn(
              rowLayout,
              screen === "settings" ? rowActive : rowIdle
            )}
          >
            <Icon icon={Settings} size="sm" />
            <span className="flex-1 truncate text-left">
              {t("screen.settings")}
            </span>
          </button>
        </nav>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
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
    </aside>
  );
}
