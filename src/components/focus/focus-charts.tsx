"use client";

/**
 * The pieces the focus log is drawn out of: a panel, a figure on a tile, a
 * segmented picker, and the two charts.
 *
 * Ported from Pivot's drawer (`pivot/app/drawer.tsx`), which is the reference for
 * this feature, and re-cut for this app's design system — Orkest's tokens
 * throughout, and the compact type scale the rest of the app uses. The
 * behaviour is the original's: one tooltip shared by both charts, arriving after
 * a moment's patience; a line that answers to the pointer along its whole width;
 * a grid whose colour is measured against its own fullest cell.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { LOCALES, type Language } from "@/lib/messages";
import { cn } from "@/lib/utils";
import {
  hourName,
  shiftDays,
  startOfWeek,
  type DayBucket,
} from "@/lib/focus-spans";

/** The panel the log is laid out in — a hairline on the sheet's own surface,
    with the title standing in the margin above the figures it names. */
export function Card({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface",
        className
      )}
    >
      {/* Wraps rather than squeezes: a wide picker drops under the title instead
          of forcing the title to break. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-medium tracking-wide text-foreground-muted">
            {title}
          </h2>
          {hint ? (
            <span className="text-xs leading-none text-foreground-faint">
              {hint}
            </span>
          ) : null}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** One figure on a quiet tile. The fill is what makes it a card — the panel it
    sits in is the same surface. */
export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-foreground-muted">
        {label}
      </div>
      <div className="mt-2 whitespace-nowrap font-display text-lg font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

/** Two or three choices, one of them taken: a sunken track with the chosen
    segment lifted back up onto the surface. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={option.key === value}
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-sm px-2.5 py-1.5 text-xs font-medium leading-none transition-colors",
            option.key === value
              ? "bg-surface text-foreground shadow-xs"
              : "text-foreground-muted hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The hover label both charts share: one pill, portalled, the first one arriving
 * after 300ms of patience and every one after it at once — so sweeping across a
 * chart reads as a single label moving rather than as a series of separate ones.
 *
 * Portalled because these charts live inside cards that clip their own contents:
 * painted in place, a label would be cut off the moment it reached an edge.
 */
function BarTip({ text, at }: { text: string; at: { x: number; y: number } }) {
  return createPortal(
    <div
      role="tooltip"
      // One expression does all the placing: centred on its anchor, held 8px
      // inside the window, and lifted clear of it. The centering cannot also
      // live in a `-translate-x-1/2` class — Tailwind's translate utilities
      // write to `transform`, which composes with this property rather than
      // replacing it, and the pill would then sit half its own width further
      // left than the anchor. A percentage in `translate` resolves against the
      // pill's own width, which is the one thing the clamp needs to know.
      style={{
        left: at.x,
        top: at.y - 6,
        translate: `clamp(calc(8px - ${at.x}px), -50%, calc(100vw - 8px - ${at.x}px - 100%)) -100%`,
      }}
      // `w-max` is load-bearing, not decoration. This pill is `fixed` with a
      // `left` and no width, so `auto` resolves to shrink-to-fit — which caps
      // itself at the width still free to the right of `left`. Hovering the
      // last column, that is a few dozen pixels, and the label breaks into
      // three lines. Sizing to the content first, then capping at `max-w-xs`,
      // takes `left` out of the measurement; the `translate` clamp above moves
      // the finished pill back inside the window rather than squeezing it.
      // !important: these charts are drawn inside the log, which is a Dialog
      // (z-modal=60). A pill portalled to the body sits beside that dialog
      // rather than within it, so the theme's own `z-tooltip` (40) would leave
      // it behind the overlay — present, and blurred out of sight. Same override
      // `select.tsx` and `popover.tsx` carry for the same reason.
      className="pointer-events-none fixed !z-[100] w-max max-w-xs rounded-md bg-foreground px-2.5 py-1 text-xs font-medium leading-tight text-background shadow-pop"
    >
      {text}
    </div>,
    document.body
  );
}

function useTip() {
  const [tip, setTip] = useState<{
    text: string;
    at: { x: number; y: number };
  } | null>(null);
  const wait = useRef<number | null>(null);

  // A label still counting down has nothing left to label once the chart goes.
  useEffect(
    () => () => {
      if (wait.current !== null) window.clearTimeout(wait.current);
    },
    []
  );

  const leave = () => {
    if (wait.current !== null) {
      window.clearTimeout(wait.current);
      wait.current = null;
    }
    setTip(null);
  };

  /** `y` moves the pill off the anchor's top edge, for a chart whose label
      belongs beside a point rather than above the column that holds it. */
  const enter = (
    event: ReactPointerEvent<HTMLElement>,
    text: string,
    y?: number
  ) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = { x: box.left + box.width / 2, y: y ?? box.top };
    if (wait.current !== null) {
      window.clearTimeout(wait.current);
      wait.current = null;
    }
    if (tip !== null) {
      setTip({ text, at });
      return;
    }
    wait.current = window.setTimeout(() => setTip({ text, at }), 300);
  };

  return { tip, enter, leave };
}

/**
 * The same totals drawn as a line, one point to a week or a month. The path
 * stretches to whatever width it is given — the only way to fill a box whose
 * width is not known until it is measured — which would stretch its stroke and
 * its dots along with it; hence `vector-effect` on the former and plain elements
 * for the latter, where a dot stays a dot at any width.
 */
export function Line({
  values,
  titles,
  labels,
  marked,
}: {
  values: number[];
  titles: string[];
  labels?: string[];
  marked?: number;
}) {
  const { tip, enter, leave } = useTip();
  const tallest = Math.max(...values, 1);
  const last = Math.max(values.length - 1, 1);
  // Shares of the box: `x` across it, `y` down from its top. The 2% kept clear at
  // either end is what a stroke on the outermost value would otherwise be sliced
  // by.
  const points = values.map((value, index) => ({
    x: 2 + (index / last) * 96,
    y: 98 - (value / tallest) * 96,
  }));
  // Each target reaches halfway to its neighbours and runs off both ends, so
  // every part of the width answers to some point and none falls between two.
  const edges = points.map((point, index) => ({
    left: index === 0 ? 0 : (points[index - 1].x + point.x) / 2,
    right: index === last ? 100 : (point.x + points[index + 1].x) / 2,
  }));

  return (
    <div>
      <div className="relative h-28" onPointerLeave={leave}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          {/* The baseline the line is read against, level with a point of zero. */}
          <line
            x1="0"
            y1="98"
            x2="100"
            y2="98"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-border"
          />
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-focus-useful"
          />
        </svg>
        {points.map((point, index) => (
          <span
            key={index}
            aria-hidden="true"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            // The one still running is a little larger, the way the bar that
            // carried it used to be drawn solid.
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-focus-useful",
              index === marked ? "h-2 w-2" : "h-1.5 w-1.5"
            )}
          />
        ))}
        {edges.map((edge, index) => (
          <div
            key={index}
            role="img"
            aria-label={titles[index]}
            style={{ left: `${edge.left}%`, right: `${100 - edge.right}%` }}
            onPointerEnter={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              enter(
                event,
                titles[index],
                box.top + (points[index].y / 100) * box.height
              );
            }}
            className="absolute inset-y-0 cursor-pointer"
          />
        ))}
      </div>
      {labels ? (
        // One label per point, at the point's own share of the box: the axis
        // answers to the same geometry the line does, so a label sits under its
        // point however wide the card runs — even columns would drift apart from
        // the points as the box widened.
        <div className="relative mt-2 h-3">
          {labels.map((label, index) => (
            <span
              key={index}
              style={{ left: `${points[index].x}%` }}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-center text-xs leading-none text-foreground-faint"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {tip === null ? null : <BarTip text={tip.text} at={tip.at} />}
    </div>
  );
}

/** A week of hours: seven rows from Monday, twenty-four cells across. */
function weekdayLabels(lang: Language): string[] {
  // 2024-01-01 was a Monday, so the grid's own order falls out of the platform's
  // weekday names rather than out of a second dictionary to keep in step.
  const format = new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(2024, 0, 1 + index))
  );
}

/** The hours named under the grid: the same every-sixth-one marks the rail
    carries. Both ends of the day are the same mark, which is what midnight looks
    like on a dial. */
const AXIS_HOURS = [0, 6, 12, 18, 24];

/** Five steps rather than a continuous ramp: a shade that answers to a fraction
    reads as noise, and there is nothing in it that a second shade would say.
    Written as `color-mix` against the one useful token so a theme change moves
    the whole ramp with it. */
const HEAT_STEPS = [
  "bg-muted",
  "bg-[color-mix(in_srgb,var(--focus-useful)_22%,transparent)]",
  "bg-[color-mix(in_srgb,var(--focus-useful)_45%,transparent)]",
  "bg-[color-mix(in_srgb,var(--focus-useful)_70%,transparent)]",
  "bg-focus-useful",
];

function heatStep(value: number, fullest: number): number {
  if (value <= 0) return 0;
  const ratio = value / fullest;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function Heat({
  grid,
  lang,
  read,
}: {
  grid: number[][];
  lang: Language;
  /** Turns a cell's milliseconds into the words the tooltip shows. */
  read: (ms: number) => string;
}) {
  const { tip, enter, leave } = useTip();
  const FULLEST = Math.max(...grid.flat(), 1);
  const days = weekdayLabels(lang);

  return (
    <div>
      <div className="flex flex-col gap-[3px]" onPointerLeave={leave}>
        {grid.map((row, day) => (
          <div key={days[day]} className="flex items-center gap-[3px]">
            <span className="w-7 shrink-0 text-xs leading-none text-foreground-faint">
              {days[day]}
            </span>
            <div className="flex flex-1 gap-[3px]">
              {row.map((value, hour) => {
                const label = `${days[day]} ${hourName(hour, lang)} · ${read(value)}`;
                return (
                  <span
                    key={hour}
                    // A cell holding nothing has nothing to announce, and there
                    // are a hundred and sixty-eight of these.
                    role="img"
                    aria-label={value > 0 ? label : undefined}
                    aria-hidden={value > 0 ? undefined : true}
                    onPointerEnter={(event) => enter(event, label)}
                    className={cn(
                      // Square by construction: the width is whatever the row
                      // hands out (flex-1) and `aspect-square` derives the
                      // height from it, so a wider card grows taller cells
                      // rather than wider rectangles.
                      "aspect-square flex-1 cursor-pointer rounded-[3px]",
                      HEAT_STEPS[heatStep(value, FULLEST)]
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        <span className="w-7 shrink-0" />
        <div className="flex flex-1 justify-between whitespace-nowrap text-xs leading-none text-foreground-faint">
          {AXIS_HOURS.map((hour) => (
            <span key={hour}>{hourName(hour, lang)}</span>
          ))}
        </div>
      </div>
      {tip === null ? null : <BarTip text={tip.text} at={tip.at} />}
    </div>
  );
}

/* ── The year at a glance ─────────────────────────────────── */

/** Cell edge and the gap between cells, in px. Fixed rather than fluid: fifty-
    three `flex-1` squares would grow absurdly tall on a wide card, and the
    month labels and the legend are positioned off these two numbers, so they
    live in one place. */
const YEAR_CELL = 12;
const YEAR_GAP = 3;

/**
 * The GitHub-style year grid: one cell a day, a column a week, Monday on top
 * the way every other reading of the log runs. The grid shows one whole
 * calendar year — January through December, with the weeks' spillover days
 * left blank — and the card it lives in owns the year being shown, stepping
 * it between the first year the log reaches and this one.
 *
 * It takes the same `bucketByDay` map the rest of the page reads, so it
 * rescales with the scope picker for free and can never disagree with a card
 * beside it. Colour is measured on the same five-step ramp as the hour grid
 * (`HEAT_STEPS` above), against the fullest day *of the year on screen* — a
 * shade answers to a quarter of that year's best day, so a quiet year still
 * has a shape of its own.
 */
export function YearHeat({
  buckets,
  today,
  year,
  lang,
  read,
  lessLabel,
  moreLabel,
}: {
  /** The log already cut into days — the same map every other figure reads. */
  buckets: Map<number, DayBucket>;
  /** Local midnight of today. Days past it are placeholders, not cells. */
  today: number;
  /** The calendar year being shown. */
  year: number;
  lang: Language;
  /** Turns a cell's milliseconds into the words the tooltip shows. */
  read: (ms: number) => string;
  /** The two ends of the legend under the grid. */
  lessLabel: string;
  moreLabel: string;
}) {
  const { tip, enter, leave } = useTip();

  const { cols, fullest } = useMemo(() => {
    const jan1 = new Date(year, 0, 1).getTime();
    const dec31 = new Date(year, 11, 31).getTime();
    const cols: { day: number; value: number; blank: boolean }[][] = [];
    let fullest = 1;
    // Calendar arithmetic, not ms: a daylight-saving week is still one week.
    for (
      let week = startOfWeek(jan1);
      week <= dec31;
      week = shiftDays(week, 7)
    ) {
      const col: { day: number; value: number; blank: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = shiftDays(week, d);
        // The days a boundary week borrows from the neighbouring year, and
        // the days not yet lived, keep the grid's shape without pretending
        // to be real days.
        const blank = day < jan1 || day > dec31 || day > today;
        const value = blank ? 0 : (buckets.get(day)?.useful ?? 0);
        if (value > fullest) fullest = value;
        col.push({ day, value, blank });
      }
      cols.push(col);
    }
    return { cols, fullest };
  }, [buckets, today, year]);

  /* Month labels sit over the column whose Monday opens a new month. */
  const monthLabels = useMemo(() => {
    const format = new Intl.DateTimeFormat(LOCALES[lang], { month: "short" });
    const out: { w: number; label: string }[] = [];
    let previous = -1;
    cols.forEach((col, w) => {
      const month = new Date(col[0].day).getMonth();
      if (month !== previous) {
        out.push({ w, label: format.format(new Date(col[0].day)) });
        previous = month;
      }
    });
    return out;
  }, [cols, lang]);

  /* The date as the tooltip reads it, year included — a cell can sit eleven
     months back, where the bare `Sep 20` shape would leave the year to be
     guessed. */
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(LOCALES[lang], {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [lang]
  );

  /* Monday, Wednesday and Friday named at their rows — all seven would be
     four copies of what three already say. 2024-01-01 was a Monday, so the
     names fall out of the platform's calendar. */
  const dayNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short" });
    return [0, 2, 4].map((index) => format.format(new Date(2024, 0, 1 + index)));
  }, [lang]);

  return (
    /*
     * `overflow-y-hidden` is load-bearing, not redundant: with only
     * `overflow-x: auto`, the other axis computes to `auto` as well, and a
     * platform that draws classic scrollbars (Windows — always-on ones
     * especially) then paints a vertical track the grid has no use for, or
     * a real vertical scrollbar the moment the horizontal one takes its 10px
     * of height.
     *
     * The bottom padding is the horizontal scrollbar's seat for the narrow
     * window that needs one: it covers padding, never the legend or the
     * grid's last row. The theme's own scrollbars are 10px; `pb-3` is 12.
     */
    <div className="overflow-x-auto overflow-y-hidden">
      <div className="w-max pb-3" onPointerLeave={leave}>
        {/* Month labels, positioned off the fixed cell geometry and offset by
            the weekday column's width. */}
        <div
          className="relative mb-1.5 h-4"
          style={{ marginLeft: 28 + YEAR_GAP }}
        >
          {monthLabels.map(({ w, label }) => (
            <span
              key={w}
              className="absolute top-0 text-xs leading-none text-foreground-faint"
              style={{ left: w * (YEAR_CELL + YEAR_GAP) }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap: YEAR_GAP }}>
          {/* Weekday names down the left edge. */}
          <div className="flex w-7 shrink-0 flex-col" style={{ gap: YEAR_GAP }}>
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <span
                key={row}
                className="flex items-center text-xs leading-none text-foreground-faint"
                style={{ height: YEAR_CELL }}
              >
                {row === 0
                  ? dayNames[0]
                  : row === 2
                    ? dayNames[1]
                    : row === 4
                      ? dayNames[2]
                      : ""}
              </span>
            ))}
          </div>
          {cols.map((col, w) => (
            <div key={w} className="flex flex-col" style={{ gap: YEAR_GAP }}>
              {col.map((cell) => {
                const label = `${dateFormat.format(new Date(cell.day))} · ${read(cell.value)}`;
                const quiet = cell.blank || cell.value <= 0;
                return (
                  <span
                    key={cell.day}
                    // A cell holding nothing has nothing to announce, and there
                    // are three hundred and seventy-one of these.
                    role={quiet ? undefined : "img"}
                    aria-label={quiet ? undefined : label}
                    aria-hidden={quiet ? true : undefined}
                    onPointerEnter={
                      cell.blank ? undefined : (event) => enter(event, label)
                    }
                    className={cn(
                      "rounded-[3px]",
                      cell.blank
                        ? // Days outside the year — or not yet lived — keep
                          // the grid's shape without pretending to be days.
                          "opacity-0"
                        : HEAT_STEPS[heatStep(cell.value, fullest)]
                    )}
                    style={{ width: YEAR_CELL, height: YEAR_CELL }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {/* The legend, measured on the same ramp the cells are. */}
        <div className="mt-2 flex items-center justify-end gap-1 text-xs leading-none text-foreground-faint">
          <span>{lessLabel}</span>
          {HEAT_STEPS.map((step) => (
            <span
              key={step}
              aria-hidden="true"
              className={cn("rounded-[3px]", step)}
              style={{ width: YEAR_CELL, height: YEAR_CELL }}
            />
          ))}
          <span>{moreLabel}</span>
        </div>
      </div>
      {tip === null ? null : <BarTip text={tip.text} at={tip.at} />}
    </div>
  );
}
