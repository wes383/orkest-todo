import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
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
 * The scroll element is the Radix ScrollArea viewport that wraps this
 * component, found by walking up from our own root. The spacer div is the
 * standard pattern: total height on the outer, absolute rows inside.
 */

type Row<T> =
  | { kind: "header"; key: string; label: string; overdue: boolean; count: number }
  | { kind: "todo"; key: string; item: T };

const OVERSCAN = 6;
const ESTIMATED_ROW = 76;
const ESTIMATED_HEADER = 40;

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

  const rows = useMemo<Row<T>[]>(() => {
    if (groups) {
      const out: Row<T>[] = [];
      for (const group of groups) {
        out.push({
          kind: "header",
          key: `h-${group.key}`,
          label: group.label,
          overdue: group.key === "overdue",
          count: group.todos.length,
        });
        for (const todo of group.todos) {
          out.push({ kind: "todo", key: todo.id, item: todo });
        }
      }
      return out;
    }
    return items.map((item) => ({ kind: "todo", key: item.id, item }));
  }, [items, groups]);

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
                <div className="flex items-center gap-2 px-1 pb-2 pt-4">
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
                </div>
              ) : (
                <div className="pb-2">{renderTodo(row.item)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
