import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import type { TodoGroup } from "@/lib/selectors";

/**
 * The task list, virtualised.
 *
 * Grouped and flat rendering share one trick: both are flattened into a single
 * row model (group header | todo), which the virtualizer windows by measured
 * height. A 500-row list mounts only the screenful that is visible plus a
 * small overscan — grouping changes nothing about that, because a header is
 * just another row.
 *
 * Groups fold. The collapsed set is owned here, and only 历史 starts folded —
 * an archive opens on demand, the working day opens in your face.
 *
 * The scroll element is the Radix ScrollArea viewport that wraps this
 * component, found by walking up from our own root. The spacer div is the
 * standard pattern: total height on the outer, absolute rows inside.
 */

type Row<T> =
  | {
      kind: "header";
      key: string;
      groupKey: string;
      label: string;
      overdue: boolean;
      count: number;
      collapsed: boolean;
    }
  | { kind: "todo"; key: string; item: T };

const OVERSCAN = 6;
const ESTIMATED_ROW = 64;
const ESTIMATED_HEADER = 32;
/** The one group that ships folded: history is for looking back on purpose,
    not something the morning scroll should wade through. */
const DEFAULT_COLLAPSED: ReadonlySet<string> = new Set(["history"]);

export function VirtualTodoList<T extends { id: string }>({
  items,
  groups,
  renderTodo,
  className,
}: {
  /** Flat list — used when `groups` is null. */
  items: T[];
  /** Grouped list — when present, takes precedence over `items`. */
  groups: (TodoGroup & { todos: T[] })[] | null;
  renderTodo: (item: T) => React.ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(DEFAULT_COLLAPSED)
  );

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rows = useMemo<Row<T>[]>(() => {
    if (groups) {
      const out: Row<T>[] = [];
      for (const group of groups) {
        const isCollapsed = collapsed.has(group.key);
        out.push({
          kind: "header",
          key: `h-${group.key}`,
          groupKey: group.key,
          label: group.label,
          overdue: group.key === "overdue",
          count: group.todos.length,
          collapsed: isCollapsed,
        });
        // A folded group contributes its header alone — the count on it
        // says how much is tucked inside.
        if (!isCollapsed) {
          for (const todo of group.todos) {
            out.push({ kind: "todo", key: todo.id, item: todo });
          }
        }
      }
      return out;
    }
    return items.map((item) => ({ kind: "todo", key: item.id, item }));
  }, [items, groups, collapsed]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () =>
      (rootRef.current?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null) ??
      null,
    estimateSize: (index) =>
      rows[index]?.kind === "header" ? ESTIMATED_HEADER : ESTIMATED_ROW,
    overscan: OVERSCAN,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vr) => {
          const row = rows[vr.index];
          if (!row) return null;
          return (
            <div
              key={vr.key}
              data-index={vr.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vr.start}px)`,
              }}
            >
              {row.kind === "header" ? (
                <button
                  type="button"
                  aria-expanded={!row.collapsed}
                  onClick={() => toggleGroup(row.groupKey)}
                  className="flex w-full items-center gap-1.5 px-1 pb-1.5 pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* The chevron is the only affordance a fold needs: it
                      points the way the click goes — right when shut, down
                      when open. */}
                  <Icon
                    icon={ChevronDown}
                    size="sm"
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 text-foreground-faint transition-transform duration-base",
                      row.collapsed && "-rotate-90"
                    )}
                  />
                  <h2
                    className={cn(
                      "text-[13px] font-medium tracking-wide",
                      row.overdue ? "text-red" : "text-foreground-muted"
                    )}
                  >
                    {row.label}
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-foreground-faint">
                    {row.count}
                  </span>
                </button>
              ) : (
                <div className="pb-1.5">{renderTodo(row.item)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
