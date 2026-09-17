"use client";

/**
 * One rail per day: local midnight on the left, the next one on the right.
 *
 * Everything the day has covered so far is painted — grey for the hours that
 * went by, green for the stretches logged as "useful". The unpainted strip on
 * the right is what is left of the day. The one stretch with no end yet is the
 * session running now, and it is painted to the clock.
 *
 * Ported from Pivot's `DayTimeline` (`pivot/app/page.tsx`), which is the
 * reference for this feature, and kept to that drawing as closely as the
 * dictionary allows: a hairline rail, hours named above it and the day's two
 * figures flanking it, with the ruler, the tooltip and both figures held back
 * until the pointer arrives. The band it lives in is this app's own — a strip
 * under the switch rather than a layer pinned to the window — but nothing about
 * the rail itself is rewritten for it. The orange glow the original paints
 * while useful is the one thing left out: the switch above already says the
 * state, and a second signal saying the same thing is only noise.
 */

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  cappedEnd,
  clockLabel,
  countsOn,
  dayBounds,
  duration,
  endClockLabel,
  hourName,
  type FocusSpan,
} from "@/lib/focus-spans";
import { useI18n } from "@/lib/i18n";
import { paletteVar, type TodoList } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The hours named along the ruler: every third one, midnight to midnight. The
    in-between marks are held back on narrow windows, where they would crowd
    their neighbours twice over in Chinese — a mark reads `上午9点` there rather
    than `9`. */
const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/** One band of the rail. `idle` and `useful` bands tile the day; the ends of
    the whole rail are rounded by the track's own clip, not by the bands. The
    timestamps are kept alongside the geometry so a band can name its own range
    when it is hovered. A useful band carries the CSS colour of the list its
    stretch was filed under — `null` reads as the theme's own useful green. */
interface Mark {
  kind: "idle" | "useful";
  start: number;
  end: number;
  left: number;
  width: number;
  color: string | null;
}

export function DayRail({
  spans,
  lists,
  onOpen,
}: {
  /** The whole log, oldest first — the rail reads it, never owns it. */
  spans: FocusSpan[];
  /** The lists a stretch may be filed under; a band wears its list's colour. */
  lists: TodoList[];
  onOpen: () => void;
}) {
  const { t, language } = useI18n();
  const [now, setNow] = useState<number | null>(null);
  const [hoverStart, setHoverStart] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  /** The CSS colour of a list, or `null` for an unassigned stretch — its band
      falls back to the theme's own useful green. */
  const colorOf = (listId: string | null): string | null => {
    if (listId === null) return null;
    const list = lists.find((entry) => entry.id === listId);
    return list ? paletteVar(list.color) : null;
  };

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    // A slow beat is enough: it only has to catch midnight rolling over.
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const idle: Mark[] = [];
  const useful: Mark[] = [];
  let total = 0;
  /** The day's own length, so the share is measured against the real span —
      23 h, 24 h or 25 h — rather than against a flat 86_400_000. */
  let dayLength = 0;

  // Held out here as well as inside the block below, because the tooltip needs
  // it too: a stretch cut off at midnight has to read as running to midnight
  // rather than wrapping round to 12:00 am on the day after the one being shown.
  const dayEnd = now === null ? 0 : dayBounds(now)[1];

  // Nothing is measured until after mount, so the first paint shows an empty
  // rail and the clock is never read during a render.
  if (now !== null) {
    const [from, to] = dayBounds(now);
    const length = to - from;
    dayLength = length;
    // Paint out to the clock or to the newest closed entry, whichever is later
    // — a stretch is stamped the instant the switch flips, which can be a beat
    // ahead of this stale `now`.
    const upTo = Math.min(Math.max(now, spans[spans.length - 1]?.end ?? 0), to);

    const paint = (
      start: number,
      end: number,
      kind: Mark["kind"],
      color: string | null = null
    ) => {
      // A span that has only just opened has no length yet, so it paints
      // nothing — the coloured band shows up once the session is long enough
      // to have any width at all.
      if (end <= start) return;
      const band: Mark = {
        kind,
        start,
        end,
        left: ((start - from) / length) * 100,
        width: ((end - start) / length) * 100,
        color,
      };
      if (kind === "useful") {
        total += end - start;
        useful.push(band);
      } else idle.push(band);
    };

    // Walking the spans in order keeps the bands contiguous; whatever sits
    // between two of them is grey by definition. The log arrives oldest-first,
    // so it can be walked as it stands. Spans from earlier days fall outside
    // the window and paint nothing.
    //
    // The session still running has no end recorded, so it is painted to the
    // clock: its green edge tracks "now" instead of stepping forward once per
    // write, and a session picked up again after the window was closed carries
    // straight on from where it was, with no grey notch behind it. Either way
    // the cap applies, so a forgotten session stops at eight hours and the
    // hours after it fall back to grey.
    let cursor = from;
    for (const span of spans) {
      const start = Math.max(span.start, from);
      const end = Math.min(cappedEnd(span, upTo), upTo);
      paint(cursor, start, "idle");
      // Only the share of the day that counts is painted green. A sliver of a
      // session that spilled over midnight is not work on the day it landed on,
      // so the grey simply carries on through it — and the rail's own total
      // stays the day's total rather than a second, slightly larger number.
      if (countsOn(span, from, to, now))
        paint(start, end, "useful", colorOf(span.listId));
      cursor = Math.max(cursor, end);
    }
    paint(cursor, upTo, "idle");
  }

  // Grey and green tile the day end to end, so the bands are drawn as plain
  // rectangles and the rail's own rounded clip shapes the two ends. Every band
  // keeps its true length; none of them is padded to a minimum, so a short
  // stretch stays exactly as short as it really was.
  const bands = [...idle, ...useful];

  // Which useful band the pointer is resting on, tracked by its start time
  // rather than its index so it survives the rail being recomputed every beat.
  const hovered =
    hoverStart === null
      ? null
      : (useful.find((band) => band.start === hoverStart) ?? null);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    const hit = useful.find(
      (band) => pct >= band.left && pct < band.left + band.width
    );
    const next = hit ? hit.start : null;
    // Only a change of band re-renders; sliding along one costs nothing.
    setHoverStart((prev) => (prev === next ? prev : next));
  };

  // Today's useful time as a share of the whole day, rounded to whole percent.
  const percent = dayLength > 0 ? Math.round((total / dayLength) * 100) : 0;

  // What the rail says to a screen reader. The figures flanking it are held
  // back until hover, and a pointer-only reading would leave the day's total
  // unspoken — so it is said here in full, and the drawn rail is marked as an
  // image of it.
  const label =
    total === 0
      ? t("focus.today.none")
      : t("focus.today.total", { value: duration(total, language), pct: percent });

  return (
    /* The padding widens the hover band without moving the rail: the negative
       margin hands the space straight back to the layout. Clicking anywhere on
       it — the rail or the band around it — opens the log. */
    <div
      role="button"
      tabIndex={0}
      aria-label={t("focus.rail.aria")}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHoverStart(null)}
      className="group relative mx-auto -my-2 w-full max-w-full cursor-pointer py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[60vw]"
    >
      {/* The rail and everything measured against it share one box, so `%` and
          `bottom-full` mean "the rail", not "the hover band". */}
      <div className="relative">
        <div
          ref={railRef}
          role="img"
          aria-label={label}
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-focus-track"
        >
          {/* Grey first, the useful bands over it — each wearing the colour of
              the list its stretch was filed under, deep grey when unassigned. */}
          {bands.map((mark) => (
            <span
              key={`${mark.kind}-${mark.start}`}
              style={{
                left: `${mark.left}%`,
                width: `${mark.width}%`,
                ...(mark.kind === "useful" && {
                  backgroundColor: mark.color ?? "var(--focus-unassigned)",
                }),
              }}
              className={cn("absolute inset-y-0", mark.kind === "idle" && "bg-focus-idle")}
            />
          ))}
        </div>

        {/* Ruler: the hours named rather than ticked. It rides above the rail so
            the greens stay unbroken, and it fades in while hovered — it is what
            makes the green readable as a time of day, and it is worth nothing
            while the pointer is elsewhere. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full h-4 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 motion-reduce:transition-none"
        >
          {HOUR_MARKS.map((hour) => (
            <span
              key={hour}
              style={{ left: `${(hour / 24) * 100}%` }}
              className={cn(
                "absolute bottom-1 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none tracking-normal text-foreground-subtle sm:text-[11px]",
                hour % 6 !== 0 && "hidden sm:block"
              )}
            >
              {hourName(hour, language)}
            </span>
          ))}
        </div>

        {/* One tooltip for the whole rail, parked over whichever green band the
            pointer is on. The `clamp` holds it inside the rail's own width, so a
            band near midnight cannot push it off the screen. */}
        {hovered ? (
          <span
            style={{
              left: `clamp(5rem, ${
                hovered.left + hovered.width / 2
              }%, calc(100% - 5rem))`,
            }}
            className="pointer-events-none absolute bottom-full mb-6 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm font-normal leading-snug tracking-normal text-foreground shadow-md"
          >
            {t("focus.rail.band", {
              from: clockLabel(hovered.start, language),
              to: endClockLabel(hovered.end, dayEnd, language),
            })}
          </span>
        ) : null}

        {/* Today's useful total, split across the two ends of the rail: the time
            spent on the left, the share of the day on the right. Both fade in
            with the ruler, and both count only the day the rail is showing.

            The time is simply absent on a day with nothing logged: the share
            already says as much, and "0 分" next to "0%" would only restate it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-full mt-2 whitespace-nowrap text-[10px] leading-none tracking-normal text-foreground-subtle opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 motion-reduce:transition-none lg:left-auto lg:right-full lg:top-1/2 lg:mr-3 lg:mt-0 lg:-translate-y-1/2 lg:text-[11px]"
        >
          {total === 0 ? "" : duration(total, language)}
        </span>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap text-[10px] leading-none tracking-normal text-foreground-subtle opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 motion-reduce:transition-none lg:left-full lg:right-auto lg:top-1/2 lg:ml-3 lg:mt-0 lg:-translate-y-1/2 lg:text-[11px]"
        >
          {percent}%
        </span>
      </div>
    </div>
  );
}
