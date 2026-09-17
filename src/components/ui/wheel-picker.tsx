"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * WheelPicker — iOS-style wheel picker primitive (supports infinite looping).
 *
 * Implementation: native scroll container + CSS `scroll-snap-type: y mandatory`;
 * the center item is taken as the selected value when scrolling ends.
 * Zero dependencies, fully styleable.
 *
 * - **Infinite looping**: items are duplicated REPEAT times and initially positioned
 *   at the middle copy; when the user scrolls near either boundary in any direction,
 *   the scroll position silently jumps back to the equivalent middle position for infinite looping.
 * - Height is determined by `itemHeight × visibleCount` (visibleCount must be odd).
 * - Controlled: `value` + `onChange` (value is `string | number`, defined by the caller).
 * - Keyboard: Arrow Up/Down / PageUp / PageDown / Home / End.
 * - Accessibility: role="listbox" + role="option" + aria-selected.
 */

/** Number of copies (must be odd; middle copy index = (REPEAT - 1) / 2). */
const REPEAT = 21;
const MID_OFFSET = Math.floor(REPEAT / 2);

export interface WheelPickerItem {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface WheelPickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: WheelPickerItem[];
  value: string | number;
  onChange: (value: string | number) => void;
  /** Height of a single item (px). @default 36 */
  itemHeight?: number;
  /** Number of visible rows; must be odd. @default 5 */
  visibleCount?: number;
  /** Infinite looping. Set false for tiny lists (e.g. AM/PM) to scroll as a plain two-item column. @default true */
  loop?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function WheelPicker({
  items,
  value,
  onChange,
  itemHeight = 36,
  visibleCount: visibleCountProp = 5,
  loop = true,
  className,
  "aria-label": ariaLabel,
  ...props
}: WheelPickerProps) {
  // Must be odd so a single item can sit exactly in the middle; a stray even
  // count is corrected rather than argued with.
  const visibleCount = visibleCountProp % 2 === 0 ? visibleCountProp + 1 : visibleCountProp;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  /** Marks that a programmatic jump is in progress; scroll events triggered by the jump should be ignored to avoid infinite re-jumping. */
  const jumpingRef = React.useRef(false);
  const scrollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Accumulated wheel delta; each time it reaches one itemHeight, a single ±1 step is triggered.
   *  Trackpads / high-precision wheels emit many small-delta events that must be accumulated to step precisely +1. */
  const wheelAccumulatorRef = React.useRef(0);

  const paddingCount = Math.floor(visibleCount / 2);
  const viewportHeight = itemHeight * visibleCount;

  const selectedIndex = React.useMemo(() => {
    const i = items.findIndex((it) => it.value === value);
    return i < 0 ? 0 : i;
  }, [items, value]);

  // Build the extended array by repeating items REPEAT times (looping only;
  // a non-looping wheel renders its items once, top to bottom).
  // Each extended entry records its original index in items, for later calculations.
  const extendedItems = React.useMemo(() => {
    if (!loop) return items.map((item, i) => ({ item, originalIdx: i }));
    const arr: { item: WheelPickerItem; originalIdx: number }[] = [];
    for (let r = 0; r < REPEAT; r++) {
      for (let i = 0; i < items.length; i++) {
        arr.push({ item: items[i], originalIdx: i });
      }
    }
    return arr;
  }, [items, loop]);

  /**
   * Silently jump scrollTop back to the equivalent position in the middle copy.
   * Middle copy start index = MID_OFFSET * items.length;
   * for a given original idx, its scrollTop within the middle copy =
   * (MID_OFFSET * items.length + idx) * itemHeight.
   */
  const jumpToMiddle = React.useCallback(
    (originalIdx: number) => {
      if (!loop) return;
      const el = containerRef.current;
      if (!el) return;
      const middleStart = MID_OFFSET * items.length;
      const targetTop = (middleStart + originalIdx) * itemHeight;
      jumpingRef.current = true;
      el.scrollTo({ top: targetTop });
      // scrollTo synchronously fires a scroll event; reset the flag on the next frame
      requestAnimationFrame(() => {
        jumpingRef.current = false;
      });
    },
    [items.length, itemHeight, loop]
  );

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const middleStart = loop ? MID_OFFSET * items.length : 0;
    const targetTop = (middleStart + selectedIndex) * itemHeight;
    if (Math.abs(el.scrollTop - targetTop) > 1) {
      jumpingRef.current = true;
      el.scrollTo({ top: targetTop });
      requestAnimationFrame(() => {
        jumpingRef.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, itemHeight]);

  React.useEffect(() => {
    return () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  // Use a native addEventListener for wheel; only { passive: false } can truly
  // preventDefault to block native scrolling. React's onWheel is passive and cannot prevent it.
  //
  // Locking mechanism: a single physical mouse-wheel gesture fires several consecutive wheel
  // events (typically 3–5, each with deltaY ≈ 100). If steps were computed from the accumulated
  // delta directly, one gesture would jump several items. Solution: once the accumulator reaches
  // the threshold, advance/retreat exactly 1 step, then lock briefly (absorbing subsequent events
  // from the same gesture) to ensure "one gesture = exactly +1". Small trackpad deltas are still
  // accumulated first and only fire once the threshold is reached, avoiding accidental triggers.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let locked = false;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (locked) return;
      const acc = wheelAccumulatorRef.current + e.deltaY;
      const threshold = itemHeight;
      if (Math.abs(acc) < threshold) {
        wheelAccumulatorRef.current = acc;
        return;
      }
      const direction = acc > 0 ? 1 : -1;
      const nextIdx = loop
        ? (selectedIndex + direction + items.length) % items.length
        : selectedIndex + direction;
      if (nextIdx < 0 || nextIdx >= items.length) return;
      const next = items[nextIdx];
      if (next && !next.disabled && nextIdx !== selectedIndex) {
        onChange(next.value);
      }
      // Reset the accumulator and lock for 150ms to absorb subsequent wheel events from the same gesture
      wheelAccumulatorRef.current = 0;
      locked = true;
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        locked = false;
      }, 150);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
      if (lockTimer) clearTimeout(lockTimer);
    };
  }, [items, selectedIndex, onChange, itemHeight, loop]);

  /** Compute the center item and fire onChange when scrolling ends. */
  const handleScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Ignore scrolls triggered by programmatic jumps
    if (jumpingRef.current) return;

    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
    }

    scrollTimerRef.current = setTimeout(() => {
      // Index of the center item within extendedItems (accounting for paddingTop)
      const extIdx = Math.round(el.scrollTop / itemHeight);
      const clampedExt = Math.max(
        0,
        Math.min(extendedItems.length - 1, extIdx)
      );
      const entry = extendedItems[clampedExt];
      if (!entry) return;
      const originalIdx = entry.originalIdx;
      const next = items[originalIdx];

      if (next && !next.disabled && next.value !== value) {
        onChange(next.value);
      }

      // When looping and near a boundary, silently jump back to the equivalent middle-copy position
      const middleStart = MID_OFFSET * items.length;
      const middleEnd = (MID_OFFSET + 1) * items.length;
      if (
        loop &&
        (clampedExt < middleStart - items.length ||
          clampedExt >= middleEnd + items.length)
      ) {
        jumpToMiddle(originalIdx);
      } else {
        // Snap to the exact position (handles browser snap deviation)
        const exactTop = clampedExt * itemHeight;
        if (Math.abs(el.scrollTop - exactTop) > 1) {
          jumpingRef.current = true;
          el.scrollTo({ top: exactTop });
          requestAnimationFrame(() => {
            jumpingRef.current = false;
          });
        }
      }
    }, 90);
  }, [extendedItems, items, value, onChange, itemHeight, jumpToMiddle, loop]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let nextIdx = selectedIndex;
      const step = e.key === "PageDown" || e.key === "PageUp" ? 3 : 1;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        nextIdx = loop ? (selectedIndex + step) % items.length : selectedIndex + step;
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        nextIdx = loop
          ? (selectedIndex - step + items.length) % items.length
          : selectedIndex - step;
      } else if (e.key === "Home") {
        nextIdx = 0;
      } else if (e.key === "End") {
        nextIdx = items.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      const next = items[nextIdx];
      if (next && !next.disabled) {
        onChange(next.value);
      }
    },
    [items, selectedIndex, onChange, loop]
  );

  const handleClick = React.useCallback(
    (originalIdx: number) => {
      const next = items[originalIdx];
      if (next && !next.disabled) {
        onChange(next.value);
      }
    },
    [items, onChange]
  );

  return (
    // Outer relative container: hosts the center indicator bar, which does not scroll with the inner scroll container.
    <div
      className={cn("relative", className)}
      style={{ height: viewportHeight }}
    >
      {/* Center highlight indicator bar — placed outside the scroll container, fixed at the viewport center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 bg-hover-bg border-y border-border z-0"
        style={{
          top: paddingCount * itemHeight,
          height: itemHeight,
        }}
      />

      <div
        ref={containerRef}
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        className={cn(
          "orkest-wheel-picker relative h-full overflow-y-auto overflow-x-hidden rounded-md outline-none z-10",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
        style={{
          height: viewportHeight,
          // Top/bottom padding so the first and last items can scroll to the center
          paddingTop: paddingCount * itemHeight,
          paddingBottom: paddingCount * itemHeight,
          scrollSnapType: "y mandatory",
          // Hide the scrollbar while keeping scroll capability
          scrollbarWidth: "none",
        }}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {/* WebKit: hide the scrollbar */}
        <style>{`
          .orkest-wheel-picker::-webkit-scrollbar { display: none; }
        `}</style>

        {extendedItems.map((entry, extIdx) => {
          const { item, originalIdx } = entry;
          const isSelected = originalIdx === selectedIndex;
          // Fade based on the distance between this extended index and the equivalent position of selectedIndex
          const middleSelectedExtIdx =
            (loop ? MID_OFFSET * items.length : 0) + selectedIndex;
          const distanceFromCenter = Math.abs(extIdx - middleSelectedExtIdx);
          const opacity = item.disabled
            ? 0.3
            : Math.max(0.25, 1 - distanceFromCenter * 0.2);
          return (
            <div
              key={`${extIdx}-${item.value}`}
              role="option"
              aria-selected={isSelected}
              aria-disabled={item.disabled || undefined}
              className={cn(
                "flex cursor-pointer items-center justify-center text-center text-sm font-medium transition-colors",
                isSelected ? "text-foreground" : "text-foreground-muted",
                item.disabled && "cursor-not-allowed"
              )}
              style={{
                height: itemHeight,
                scrollSnapAlign: "center",
                scrollSnapStop: "always",
                opacity,
              }}
              onClick={() => handleClick(originalIdx)}
            >
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

WheelPicker.displayName = "WheelPicker";
