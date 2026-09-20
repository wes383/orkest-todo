"use client";

/**
 * The focus view: the one switch this whole feature turns on.
 *
 * The site (Pivot, `pivot/app/page.tsx`) draws the switch as two panels on one
 * track — slide it, or tap to flip — with a rail under it showing the day. That
 * shape is kept here, and so is the reasoning behind it: two states, no
 * dialogs, nothing to fill in before starting.
 *
 * ── The one thing this view adds to Pivot's ─────────────────────────────────
 *
 * A stretch belongs to a list, and the running session's list is set from here.
 * A new session opens wearing whatever list the sidebar is showing, and that is
 * only a starting point: it can be changed as often as wanted while the session
 * runs. The action itself lives in `focus-store.ts` — this file only offers the
 * control.
 *
 * ── Why the keyboard lives here and not in the store ────────────────────────
 *
 * The arrow keys are a convenience of this one screen, and they must go quiet
 * while the log is open, where a stray arrow would flip the switch behind the
 * sheet. Both facts are about this view, so both are handled here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DayRail } from "@/components/focus/focus-rail";
import { SCOPE_UNASSIGNED, duration } from "@/lib/focus-spans";
import type { FocusState, FocusStore } from "@/lib/focus-store";
import { useI18n } from "@/lib/i18n";
import { paletteVar, type TodoList } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The two states as the switch counts them, in the order it slides. */
const ORDER: FocusState[] = ["idle", "useful"];

/** Past this fraction of the width, releasing snaps to the other state. */
const SNAP_RATIO = 0.16;
const SNAP_MAX = 72;
/** Below this the gesture counts as a tap, not a slide. */
const TAP_SLOP = 6;

/** Both states sit on one track, so the track is twice the viewport wide.
    `leading-tight` keeps the box taller than the glyphs — the descender of a
    `g` runs past a 1.0 line-height, which is what `text-*` defaults to. */
const PANEL_CLASS =
  "flex w-1/2 shrink-0 select-none items-center justify-center px-4 text-center font-display font-bold leading-tight tracking-tight text-2xl sm:text-3xl lg:text-4xl xl:text-5xl";

/** Pointer target: the label plus a reach on every side. The negative margin
    cancels out the padding exactly, so the label itself never moves and the
    rest of the screen stays inert. */
const HIT_CLASS =
  "group -m-4 inline-flex cursor-pointer touch-pan-y p-4 sm:-m-5 sm:p-5 lg:-m-6 lg:p-6";

/** Extra slab of target out past the text on the side the chevron shows up, so
    the chevron sits inside the target instead of hanging off its edge. */
const ARROW_ZONE_CLASS = "absolute inset-y-0 w-8 sm:w-10 lg:w-14";

type Side = "left" | "right";

/** Lucide's `chevrons-right` / `chevrons-left`, inlined so the icons cost no
    extra dependency. */
const CHEVRONS: Record<Side, string[]> = {
  right: ["m6 17 5-5-5-5", "m13 17 5-5-5-5"],
  left: ["m11 17-5-5 5-5", "m18 17-5-5 5-5"],
};

/** Double chevron that fades in beside the label on hover, nudged in from the
    text. `right` points at the state waiting off to the right, `left` at the
    one behind.

    The +2px on `top` is an optical correction: centring on the line box leaves
    the icon a touch high, because the visual mass of the lowercase sits below
    the box's centre. */
function Arrow({ side }: { side: Side }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-[calc(50%+2px)] -translate-y-1/2 text-foreground-subtle opacity-0 transition duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none",
        side === "right"
          ? "left-full ml-3 -translate-x-1 sm:ml-4 lg:ml-5"
          : "right-full mr-3 translate-x-1 sm:mr-4 lg:mr-5"
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 sm:h-5 sm:w-5 lg:h-7 lg:w-7"
      >
        {CHEVRONS[side].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

/** The label plus its chevron, and the slab of target the chevron lives in. The
    hover `group` is on the pointer target that wraps this, so all three answer
    to one pointer region. */
function Label({ text, arrow }: { text: string; arrow: Side }) {
  return (
    <span className="relative inline-flex items-center">
      {text}
      <span
        aria-hidden="true"
        className={cn(
          ARROW_ZONE_CLASS,
          arrow === "right" ? "left-full" : "right-full"
        )}
      />
      <Arrow side={arrow} />
    </span>
  );
}

interface Gesture {
  id: number;
  startX: number;
  dx: number;
  moved: boolean;
  /** Viewport width in px — this is one full panel. */
  width: number;
  /** Offset the track started this gesture at. */
  base: number;
}

/**
 * The list the running session is filed under.
 *
 * It stands directly under the switch's own words and nowhere else: a session
 * only has a list worth filing while it is running, so the control exists in
 * `useful` and is simply absent in `idle`. The slot it stands in is reserved in
 * both states, so the words above it never shift as it comes and goes.
 *
 * There is one face to it, because there is one rule: the answer can be changed
 * whenever it is wrong. The picker always offers the whole set — every list, and
 * unassigned — and writes the answer straight into the running stretch. The
 * sheet's own rows take the same action afterwards, for any stretch in the log.
 */
function SessionList({
  store,
  lists,
}: {
  store: FocusStore;
  lists: TodoList[];
}) {
  const { t } = useI18n();
  const { running, spans, setList } = store;

  // Nothing to file before there is a session to file it under.
  if (running === null) return null;

  // The running stretch is the newest one, which is the one `commit` opened.
  const index = spans.length - 1;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <span className="shrink-0 text-xs font-medium tracking-wide text-foreground-muted">
        {t("focus.session.label")}
      </span>

      <Select
        value={running.listId ?? SCOPE_UNASSIGNED}
        onValueChange={(next) =>
          setList(index, next === SCOPE_UNASSIGNED ? null : next)
        }
      >
        <SelectTrigger
          aria-label={t("focus.session.label")}
          className="h-8 w-auto min-w-[9rem] gap-1.5 rounded-md px-2.5 py-0 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SCOPE_UNASSIGNED}>
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-focus-unassigned"
            />
            {t("focus.unassigned")}
          </SelectItem>
          {lists.map((list) => (
            <SelectItem key={list.id} value={list.id}>
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: paletteVar(list.color) }}
              />
              {list.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* The running session's own tally, live. It is the switch's answer to
          "how long have I been at this", and the rail underneath shows the same
          thing against the day rather than against the session. */}
      <SessionClock start={running.start} />
    </div>
  );
}

/** How long the running session has been going.
 *
 *  A slow beat, not a stopwatch: the reading is in whole minutes, so nothing is
 *  gained by waking up more often than the number can change — and this view
 *  stays mounted for days in a tray-resident app. */
function SessionClock({ start }: { start: number }) {
  const { t, language } = useI18n();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const beat = window.setInterval(tick, 10_000);
    return () => window.clearInterval(beat);
  }, [start]);

  return (
    <span className="shrink-0 font-mono text-xs tabular-nums text-foreground-subtle">
      {t("focus.session.elapsed", { value: duration(elapsed, language) })}
    </span>
  );
}

export interface FocusViewProps {
  store: FocusStore;
  lists: TodoList[];
  /** The list a new session opens wearing — the most recent stretch's list. */
  defaultListId: string | null;
  /** The statistics live on a page of their own now; the rail is one of the
      doors into it. */
  onOpenStats: () => void;
  /** Whether the foot of the screen spells out the arrows. See
      `AppSettings.hideShortcutHints`. */
  hideShortcutHints: boolean;
}

export function FocusView({
  store,
  lists,
  defaultListId,
  onOpenStats,
  hideShortcutHints,
}: FocusViewProps) {
  const { t } = useI18n();
  const { state, commit: moveSwitch } = store;

  /** Held back until after mount so the restore does not replay as a slide —
      the track is painted where it belongs on the first frame instead of
      travelling there from the idle panel. */
  const [settled, setSettled] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const index = state === "useful" ? 1 : 0;

  useEffect(() => setSettled(true), []);

  const flip = useCallback(
    (to: number) => {
      const el = trackRef.current;
      if (el) {
        // Cleared rather than set to a duration: the move is driven by the
        // class, and an inline `none` left over from a drag would keep the
        // track frozen where the pointer dropped it.
        el.style.transition = "";
        el.style.transform = `translateX(${-to * 50}%)`;
      }
      moveSwitch(ORDER[to], defaultListId);
    },
    [moveSwitch, defaultListId]
  );

  // The arrow keys mirror the slide — but not while a field has the caret,
  // where an arrow means "move the cursor".
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        flip(0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        flip(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flip]);

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const el = trackRef.current;
    const vp = viewportRef.current;
    if (!el || !vp || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    const width = vp.clientWidth;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dx: 0,
      moved: false,
      width,
      base: -index * width,
    };

    el.style.transition = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const g = gesture.current;
    const el = trackRef.current;
    if (!g || !el || g.id !== event.pointerId) return;

    g.dx = event.clientX - g.startX;
    if (Math.abs(g.dx) > TAP_SLOP) g.moved = true;

    // Rubber-band past either end instead of letting the track run away.
    let offset = g.base + g.dx;
    if (offset > 0) offset *= 0.25;
    else if (offset < -g.width) offset = -g.width + (offset + g.width) * 0.25;

    el.style.transform = `translateX(${offset}px)`;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;

    const threshold = Math.min(SNAP_MAX, g.width * SNAP_RATIO);
    let next = index;
    if (g.dx <= -threshold) next = 1;
    else if (g.dx >= threshold) next = 0;
    // A plain tap flips the switch; with two states that is unambiguous.
    else if (!g.moved) next = index === 0 ? 1 : 0;

    flip(next);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    flip(index);
  };

  // Only the label and its immediate surroundings respond to the pointer; the
  // rest of the screen is left alone. Capture keeps the drag alive after the
  // pointer wanders off the label.
  const hitProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDragStart: (event: React.DragEvent<HTMLSpanElement>) =>
      event.preventDefault(),
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      {/* The switch. `pb` nudges the label above the geometric centre — the
          optical middle of a region sits a little high once the rail is under
          it.

          No `overflow-hidden` on this region. `overflow: hidden` on one axis
          quietly turns the other into `auto`, and a clipping box is all it takes
          to shave the descender off a `g` — which the switch's own words are
          full of. The track below clips itself, horizontally and only
          horizontally. */}
      <div className="relative isolate flex flex-1 flex-col pb-4">
        {/* The bloom, and the one thing here that does not travel with the
            track: pinned to the region rather than carried by a panel, so
            flipping the switch fades it in or out where it stands instead of
            dragging it across with the words. Deepest at the middle, thinning to
            nothing at every edge. `isolate` on the parent gives this layer
            something to be negative inside, so it settles onto the page's own
            background one step under everything that reads. */}
        <span
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(closest-side, var(--focus-glow), transparent)",
          }}
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700 ease-out motion-reduce:transition-none",
            state === "useful" ? "opacity-100" : "opacity-0"
          )}
        />

        <h1 className="sr-only">{t("focus.title")}</h1>
        <p role="status" aria-live="polite" className="sr-only">
          {t(
            state === "useful" ? "focus.state.useful" : "focus.state.idle"
          )}
        </p>

        {/* One track, two states side by side: slide it, or tap to flip. It
            carries `role="switch"` rather than leaving the panels to announce
            themselves — there is one control here with two positions, and its
            name and checked state say everything the two labels do. The live
            region above says which one is showing as it changes.

            The list control shares the column, one step below the words, so the
            two things that describe the running session — its state and its
            list — read as one block rather than as two corners of the screen. */}
        <div className="flex flex-1 flex-col justify-center">
          <div
            ref={viewportRef}
            role="switch"
            aria-checked={state === "useful"}
            aria-label={t("focus.title")}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                flip(index === 0 ? 1 : 0);
              }
            }}
            className="w-full overflow-x-clip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div
              ref={trackRef}
              style={{ width: "200%", transform: `translateX(${-index * 50}%)` }}
              className={cn(
                "flex will-change-transform motion-reduce:transition-none",
                settled && "transition-transform duration-500 ease-out"
              )}
            >
              <div
                aria-hidden="true"
                className={cn(PANEL_CLASS, "text-foreground-muted")}
              >
                <span className={HIT_CLASS} {...hitProps}>
                  <Label text={t("focus.state.idle")} arrow="right" />
                </span>
              </div>
              <div
                aria-hidden="true"
                className={cn(PANEL_CLASS, "text-foreground")}
              >
                <span className={HIT_CLASS} {...hitProps}>
                  <Label text={t("focus.state.useful")} arrow="left" />
                </span>
              </div>
            </div>
          </div>

          {/* The session's list. The slot is held open in both states —
              reserving it while idle keeps the switch's words from stepping up
              the moment a session starts. */}
          <div className="mt-6 flex h-9 items-center justify-center px-6">
            {state === "useful" ? (
              <SessionList store={store} lists={lists} />
            ) : null}
          </div>
        </div>

        {/* The element stays even when the hint goes: its `pb-8` is what keeps
            the switch off the band below. */}
        <p className="shrink-0 px-6 pb-8 text-center text-xs text-foreground-faint">
          {!hideShortcutHints && t("focus.keys")}
        </p>
      </div>

      {/* The band under the switch: the day the session is being filed
          against, as one rail. It owns the whole width, the way it does in the
          reference — no card, no hairline above it, nothing around it but the
          page's own ground. */}
      <div className="shrink-0 px-6 pb-8">
        <DayRail spans={store.spans} lists={lists} onOpen={onOpenStats} />
      </div>
    </main>
  );
}
