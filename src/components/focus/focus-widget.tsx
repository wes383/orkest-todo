import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, EyeOff, ExternalLink, Loader2, Play, Square } from "lucide-react";
import { useFocusWidgetClient } from "@/lib/focus-widget";
import { detectLanguage } from "@/lib/i18n";
import { translate, type MessageKey, type MessageVars } from "@/lib/messages";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };
type Layout = { expanded: boolean; snap: boolean };
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
  const [failed, setFailed] = useState(false);
  const alive = useRef(false);
  const expandedRef = useRef(false);
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
            desired.current = { expanded: expandedRef.current, snap: true };
          }
          setDragging(false);
        }
        const layout = desired.current;
        if (!layout) break;
        desired.current = null;
        await invoke("focus_widget_layout", layout);
        if (alive.current && !desired.current) {
          setExpanded(layout.expanded);
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

  const layout = useCallback((next: boolean, snap = false) => {
    expandedRef.current = next;
    if (!next) setExpanded(false);
    desired.current = { expanded: next, snap: snap || Boolean(desired.current?.snap) };
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
      layout(false);
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
  const { snapshot, connected, pending, error, setFocus, clearError } = useFocusWidgetClient();
  const surface = useWidgetSurface();
  const [acting, setActing] = useState(false);
  const actionLock = useRef(false);
  const [now, setNow] = useState(Date.now);
  const actionsId = useId();
  const hintId = useId();
  const language = snapshot?.language ?? detectLanguage();
  const t = (key: MessageKey, vars?: MessageVars) => translate(language, key, vars);
  const useful = snapshot?.state === "useful";
  const startedAt = snapshot?.startedAt ?? null;
  const busy = pending || acting;
  const unavailable = !connected || !snapshot;
  const failed = Boolean(error) || surface.failed;

  useEffect(() => {
    if (!connected || !useful || startedAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [connected, useful, startedAt]);

  const seconds = startedAt !== null && Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : 0;
  const elapsed = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
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
          : t("widget.dragHint");

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
    <main className="focus-widget" lang={language} aria-label={t("focus.title")}>
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
          aria-label={`${status} · ${t(surface.expanded ? "widget.collapse" : "widget.expand")}`}
          aria-describedby={hintId}
          aria-busy={surface.changing}
          title={t("widget.dragHint")}
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
              {useful && !unavailable && startedAt !== null && (
                <span className="focus-widget-clock" role="timer" aria-live="off" aria-label={t("focus.session.elapsed", { value: elapsed })}>
                  {elapsed}
                </span>
              )}
            </span>
            <span className={cn("focus-widget-detail", failed && "text-red")} title={detail}>
              {detail}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="focus-widget-chevron" />
        </button>
        <div id={actionsId} className="focus-widget-actions" hidden={!surface.expanded} aria-label={t("widget.expand")} role="group">
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
          <span className="focus-widget-footer" aria-hidden="true">{t("widget.dragHint")}</span>
        </div>
      </div>
      <span id={hintId} className="sr-only">{t("widget.dragHint")}</span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {failed ? t("widget.error") : busy ? t("widget.loading") : status}
      </span>
    </main>
  );
}
