import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff, ExternalLink, Folder, Loader2, Play, Square } from "lucide-react";
import { useFocusWidgetClient } from "@/lib/focus-widget";
import { detectLanguage } from "@/lib/i18n";
import { translate, type MessageKey, type MessageVars } from "@/lib/messages";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };
type Layout = {
  expanded: boolean;
  snap: boolean;
  dock: boolean;
  cursorX: number | null;
  cursorY: number | null;
};
type LayoutResult = { docked: boolean; edge: string | null };
type Gesture = {
  id: number;
  target: HTMLElement;
  start: Point;
  latest: Point;
  pointerType: string;
  origin: Promise<{ position: PhysicalPosition; offset: Point; scale: number } | null>;
  moved: boolean;
  ended: boolean;
  revision: number;
  applied: number;
  finalCursor: Promise<PhysicalPosition | null> | null;
};

function useWidgetSurface() {
  const [expanded, setExpanded] = useState(false);
  const [changing, setChanging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [docked, setDocked] = useState(false);
  const [edge, setEdge] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(false);
  const expandedRef = useRef(false);
  const dockedRef = useRef(false);
  const hoverRef = useRef(false);
  // Set whenever the widget docks: hover-expand stays disarmed until the
  // cursor has left the tab's hot zone once, so docking under the resting
  // cursor does not instantly pop it back open.
  const requireExitRef = useRef(false);
  const desired = useRef<Layout | null>(null);
  const working = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const statusRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const flush = useCallback(async () => {
    if (working.current || !alive.current) return;
    working.current = true;
    try {
      while (alive.current) {
        const g = gesture.current;
        if (g) {
          if (g.moved && g.applied !== g.revision) {
            const revision = g.revision;
            const point = g.latest;
            const origin = await g.origin;
            if (!origin) throw new Error();
            const cursor = g.pointerType === "mouse"
              ? await (g.finalCursor ?? cursorPosition())
              : null;
            if (!alive.current || gesture.current !== g) break;
            const position = cursor
              ? new PhysicalPosition(
                  Math.round(cursor.x - origin.offset.x),
                  Math.round(cursor.y - origin.offset.y)
                )
              : new PhysicalPosition(
                  Math.round(origin.position.x + (point.x - g.start.x) * origin.scale),
                  Math.round(origin.position.y + (point.y - g.start.y) * origin.scale)
                );
            await getCurrentWindow().setPosition(position);
            g.applied = revision;
            continue;
          }
          if (!g.ended) break;
          gesture.current = null;
          if (g.moved) {
            // Dragging the widget away detaches it from the dock: no more
            // hover expand or auto re-dock until it is docked again.
            hoverRef.current = false;
            // Dock decisions use the cursor: the dragged window's own rect
            // cannot reach the edge (grab offset) and may overlap it.
            let cursor: Point | null = null;
            if (g.pointerType === "mouse") {
              try {
                const final = await (g.finalCursor ?? cursorPosition());
                if (final) cursor = { x: final.x, y: final.y };
              } catch {
                cursor = null;
              }
            }
            desired.current = {
              expanded: expandedRef.current,
              snap: true,
              dock: true,
              cursorX: cursor?.x ?? null,
              cursorY: cursor?.y ?? null,
            };
          }
          setDragging(false);
        }
        const pending = desired.current;
        if (!pending) break;
        desired.current = null;
        const result = await invoke<LayoutResult>("focus_widget_layout", pending);
        if (alive.current && !desired.current) {
          setExpanded(result.docked ? false : pending.expanded);
          dockedRef.current = result.docked;
          setDocked(result.docked);
          setEdge(result.docked ? result.edge : null);
          if (result.docked) {
            hoverRef.current = false;
            requireExitRef.current = true;
          }
          setHovering(hoverRef.current && !result.docked);
        }
      }
    } catch {
      desired.current = null;
      gesture.current = null;
      if (alive.current) {
        setFailed(true);
        setDragging(false);
      }
    } finally {
      working.current = false;
      if (alive.current) setChanging(Boolean(desired.current));
    }
  }, []);

  const layout = useCallback((next: boolean, snap = false, dock = false) => {
    expandedRef.current = next;
    if (!next) setExpanded(false);
    const pending = desired.current;
    desired.current = {
      expanded: next,
      snap: snap || Boolean(pending?.snap),
      dock: dock || Boolean(pending?.dock),
      cursorX: null,
      cursorY: null,
    };
    setChanging(true);
    void flush();
  }, [flush]);

  const finish = useCallback((cancelled = false) => {
    const g = gesture.current;
    if (!g || g.ended) return;
    g.ended = true;
    suppressClick.current = g.moved || cancelled;
    if (g.moved && g.pointerType === "mouse") {
      g.finalCursor = cursorPosition().catch(() => null);
      g.revision += 1;
    }
    if (g.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id);
    void flush();
  }, [flush]);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const collapse = () => {
      finish(true);
      if (expandedRef.current) layout(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      collapse();
      statusRef.current?.focus({ preventScroll: true });
    };
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !surfaceRef.current?.contains(event.target)) collapse();
    };
    if (isTauri()) {
      // Re-dock on mount when the window was restored as an edge tab, so
      // hide/show toggles keep the docked state instead of forcing a pill.
      void (async () => {
        try {
          const win = getCurrentWindow();
          const [size, scale] = await Promise.all([win.outerSize(), win.scaleFactor()]);
          layout(false, false, size.width / scale < 160);
        } catch {
          layout(false);
        }
      })();
      getCurrentWindow().onFocusChanged(({ payload }) => {
        if (!payload) collapse();
      }).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      }).catch(() => {
        if (!disposed) setFailed(true);
      });
    }
    window.addEventListener("blur", collapse);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      disposed = true;
      alive.current = false;
      desired.current = null;
      const g = gesture.current;
      gesture.current = null;
      if (g?.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id);
      unlisten?.();
      window.removeEventListener("blur", collapse);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [finish, layout]);

  // While docked (or hover-expanded out of the dock), watch the cursor:
  // approaching the tab expands the pill; letting it drift away re-docks.
  useEffect(() => {
    if (!isTauri() || (!docked && !hovering)) return;
    let cancelled = false;
    let misses = 0;
    const tick = async () => {
      if (cancelled || gesture.current || desired.current || working.current) return;
      try {
        const win = getCurrentWindow();
        const [position, size, scale, cursor] = await Promise.all([
          win.outerPosition(),
          win.outerSize(),
          win.scaleFactor(),
          cursorPosition(),
        ]);
        if (cancelled || !cursor || gesture.current || desired.current) return;
        // Expand only when the cursor is on the tab itself (4px corner
        // tolerance); while hover-expanded, a small margin around the pill
        // keeps it open before the leave counter re-docks.
        const margin = (dockedRef.current ? 4 : 16) * scale;
        const inside = cursor.x >= position.x - margin
          && cursor.x <= position.x + size.width + margin
          && cursor.y >= position.y - margin
          && cursor.y <= position.y + size.height + margin;
        if (dockedRef.current) {
          if (requireExitRef.current) {
            if (!inside) requireExitRef.current = false;
          } else if (inside) {
            hoverRef.current = true;
            layout(false, false, false);
          }
        } else if (hoverRef.current) {
          misses = inside ? 0 : misses + 1;
          if (misses >= 2) {
            hoverRef.current = false;
            layout(false, true, true);
          }
        }
      } catch {
        // Transient cursor/window API failures just skip a tick.
      }
    };
    const timer = window.setInterval(tick, 160);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [docked, hovering, layout]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || !isTauri()) return;
    if (working.current || gesture.current || desired.current) {
      suppressClick.current = true;
      event.preventDefault();
      return;
    }
    suppressClick.current = false;
    const target = event.target instanceof Element
      ? event.target.closest("button") ?? event.currentTarget
      : event.currentTarget;
    const client = { x: event.clientX, y: event.clientY };
    const pointerType = event.pointerType;
    const origin = Promise.all([
      getCurrentWindow().outerPosition(),
      getCurrentWindow().scaleFactor(),
    ]).then(([position, scale]) => ({
      position,
      offset: { x: client.x * scale, y: client.y * scale },
      scale,
    })).catch(() => null);
    gesture.current = {
      id: event.pointerId,
      target,
      start: { x: event.screenX, y: event.screenY },
      latest: { x: event.screenX, y: event.screenY },
      pointerType,
      origin,
      moved: false,
      ended: false,
      revision: 0,
      applied: 0,
      finalCursor: null,
    };
    target.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId || g.ended) return;
    if (g.latest.x === event.screenX && g.latest.y === event.screenY) return;
    g.latest = { x: event.screenX, y: event.screenY };
    if (!g.moved && Math.hypot(g.latest.x - g.start.x, g.latest.y - g.start.y) < 4) return;
    g.moved = true;
    g.revision += 1;
    suppressClick.current = true;
    setDragging(true);
    void flush();
  };

  return {
    expanded,
    changing,
    dragging,
    docked,
    edge,
    hovering,
    failed,
    setFailed,
    statusRef,
    surfaceRef,
    layout,
    hitProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id !== event.pointerId) return;
        onPointerMove(event);
        finish();
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish(true);
      },
      onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish(true);
      },
      onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.detail !== 0 && suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onDragStart: (event: React.DragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}

export function FocusWidget() {
  const { snapshot, connected, pending, error, setFocus, setList, clearError } = useFocusWidgetClient();
  const surface = useWidgetSurface();
  const [acting, setActing] = useState(false);
  const [listMenu, setListMenu] = useState(false);
  const actionLock = useRef(false);
  const actionsId = useId();
  const language = snapshot?.language ?? detectLanguage();
  const t = (key: MessageKey, vars?: MessageVars) => translate(language, key, vars);
  const useful = snapshot?.state === "useful";
  const busy = pending || acting;
  const unavailable = !connected || !snapshot;
  const failed = Boolean(error) || surface.failed;

  // The submenu lives inside the panel; closing the panel always lands back
  // on the main action rows.
  useEffect(() => {
    if (!surface.expanded) setListMenu(false);
  }, [surface.expanded]);

  const chooseList = (listId: string | null) => {
    setListMenu(false);
    if (listId !== (snapshot?.listId ?? null)) void setList(listId);
  };

  const status = !connected
    ? t("widget.disconnected")
    : !snapshot
      ? t("widget.loading")
      : t(useful ? "widget.useful" : "widget.idle");
  const detail = failed
    ? t("widget.error")
    : busy
      ? t("widget.loading")
      : unavailable
        ? t("widget.openMain")
        : useful
          ? snapshot.listName?.trim() || t("focus.unassigned")
          : "";

  const run = async (action: () => Promise<unknown>, restoreFocus = false) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setActing(true);
    surface.setFailed(false);
    clearError();
    try {
      await action();
      surface.layout(false);
      if (restoreFocus) surface.statusRef.current?.focus({ preventScroll: true });
    } catch {
      surface.setFailed(true);
    } finally {
      actionLock.current = false;
      setActing(false);
    }
  };

  return (
    <main
      className="focus-widget"
      lang={language}
      aria-label={t("focus.title")}
      data-docked={surface.docked}
      data-edge={surface.edge ?? undefined}
    >
      <div
        ref={surface.surfaceRef}
        className="focus-widget-surface bg-surface text-foreground border-border"
        data-expanded={surface.expanded}
        data-dragging={surface.dragging}
        {...surface.hitProps}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
            surface.layout(false);
          }
        }}
      >
        <button
          ref={surface.statusRef}
          type="button"
          className="focus-widget-status"
          aria-expanded={surface.expanded}
          aria-controls={actionsId}
          aria-label={`${status} · ${surface.docked ? t("widget.dockHint") : t(surface.expanded ? "widget.collapse" : "widget.expand")}`}
          aria-busy={surface.changing}
          onClick={() => surface.layout(!surface.expanded)}
        >
          <span
            aria-hidden="true"
            className={cn("focus-widget-indicator", useful && !unavailable ? "bg-focus-useful" : "bg-focus-idle")}
          >
            {(busy || (connected && !snapshot)) && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <span className="focus-widget-copy">
            <span className="focus-widget-heading">
              <span className="focus-widget-label">{status}</span>
            </span>
            <span className={cn("focus-widget-detail", failed && "text-red")} title={detail}>
              {detail}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="focus-widget-chevron" />
        </button>
        <div id={actionsId} className="focus-widget-actions" hidden={!surface.expanded} aria-label={t("widget.expand")} role="group">
          {listMenu ? (
            <div
              className="focus-widget-submenu"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  // Consume Escape here so it closes the submenu instead of
                  // collapsing the whole panel.
                  event.stopPropagation();
                  setListMenu(false);
                }
              }}
            >
              <button type="button" className="focus-widget-action" onClick={() => setListMenu(false)}>
                <ChevronLeft aria-hidden="true" />
                <span>{t("widget.list")}</span>
              </button>
              <div className="focus-widget-submenu-options" role="listbox" aria-label={t("widget.list")}>
                <button
                  type="button"
                  role="option"
                  aria-selected={(snapshot?.listId ?? null) === null}
                  className={cn("focus-widget-action", (snapshot?.listId ?? null) === null && "focus-widget-action-primary")}
                  onClick={() => chooseList(null)}
                >
                  <span>{t("focus.unassigned")}</span>
                </button>
                {(snapshot?.lists ?? []).map((list) => {
                  const selected = snapshot?.listId === list.id;
                  return (
                    <button
                      key={list.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn("focus-widget-action", selected && "focus-widget-action-primary")}
                      onClick={() => chooseList(list.id)}
                    >
                      <span>{list.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="focus-widget-action"
                aria-haspopup="menu"
                aria-expanded={listMenu}
                aria-label={t("widget.list")}
                aria-disabled={!useful || unavailable}
                onClick={() => {
                  if (useful && !unavailable) setListMenu(true);
                }}
              >
                <Folder aria-hidden="true" />
                <span>{t("widget.list")} · {snapshot?.listName?.trim() || t("focus.unassigned")}</span>
                <ChevronRight aria-hidden="true" className="focus-widget-submenu-arrow" />
              </button>
              <button
            type="button"
            className="focus-widget-action focus-widget-action-primary"
            aria-disabled={unavailable || busy}
            aria-busy={busy}
            onClick={() => {
              if (!unavailable && !busy) void run(() => setFocus(useful ? "idle" : "useful"), true);
            }}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : useful ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{t(useful ? "widget.stop" : "widget.start")}</span>
          </button>
          <button
            type="button"
            className="focus-widget-action"
            aria-disabled={acting || !isTauri()}
            onClick={() => {
              if (!acting && isTauri()) void run(() => invoke("open_main_window"));
            }}
          >
            <ExternalLink aria-hidden="true" />
            <span>{t("widget.openMain")}</span>
          </button>
          <button
            type="button"
            className="focus-widget-action"
            aria-disabled={acting || !isTauri()}
            onClick={() => {
              if (!acting && isTauri()) void run(() => invoke("set_focus_widget_enabled", { enabled: false }));
            }}
          >
            <EyeOff aria-hidden="true" />
            <span>{t("widget.hide")}</span>
          </button>
            </>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {failed ? t("widget.error") : busy ? t("widget.loading") : status}
      </span>
    </main>
  );
}
