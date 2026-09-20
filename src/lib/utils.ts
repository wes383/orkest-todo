import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — Orkest UI className combiner.
 * Merges Tailwind classes intelligently (later classes win).
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-accent", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* Color helpers */

/** Convert a hex color (#rgb / #rrggbb) to an "r, g, b" string. */
export function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/** Convert a hex color to an rgba() string with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
}

/** Compute a soft background + border + text color triple from any hex. */
export function softColorTriple(hex: string) {
  return {
    bg: hexToRgba(hex, 0.11),
    border: hexToRgba(hex, 0.22),
    text: hex,
  };
}

/* Formatting helpers (i18n-friendly) */

/** Format a number using Intl.NumberFormat. */
export function formatNumber(
  value: number,
  locale = "en-US",
  options: Intl.NumberFormatOptions = {}
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Format a currency value. */
export function formatCurrency(
  value: number,
  currency = "USD",
  locale = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a date with a given locale + options. */
export function formatDate(
  date: Date | string | number,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
) {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, options).format(d);
}

/** Relative time formatting (e.g., "3 hours ago"). */
export function formatRelativeTime(
  date: Date | string | number,
  locale = "en-US"
) {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diff = d.getTime() - Date.now();
  const absDiff = Math.abs(diff);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [unit, secondsInUnit] of units) {
    if (absDiff >= secondsInUnit || unit === "second") {
      return rtf.format(Math.round(diff / (secondsInUnit * 1000)), unit);
    }
  }
  return rtf.format(0, "second");
}

/* Misc utilities */

/** Generate a unique id (uses crypto.randomUUID when available). */
export function uid(prefix = "orkest"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sleep for n milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Promise-based debounce. Returns a function that delays invocation. */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Parameters<T>) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delay);
  };
  /** Cancels a pending callback. Call on component unmount to avoid setState on an unmounted component. */
  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  /** If a pending callback exists, triggers it immediately (with the most recent args). */
  debounced.flush = (...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      fn(...args);
    }
  };
  return debounced;
}

/** Throttle — invokes at most once per `limit` ms. */
export function throttle<T extends (...args: any[]) => void>(fn: T, limit: number) {
  let inThrottle = false;
  let lastArgs: Parameters<T> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const throttled = (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      timer = setTimeout(() => {
        inThrottle = false;
        // If a new call arrived during the cooldown, fire a trailing call at the end.
        if (lastArgs !== undefined) {
          const next = lastArgs;
          lastArgs = undefined;
          throttled(...next);
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
  /** Cancels the cooldown timer and any pending trailing call. */
  throttled.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    inThrottle = false;
    lastArgs = undefined;
  };
  return throttled;
}

/** Check if a value is null or undefined. */
export function isNil<T>(value: T | null | undefined): value is null | undefined {
  return value == null;
}

/** Pick a single property from an object. */
export function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

/** Omit a set of keys from an object. */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((k) => delete result[k]);
  return result;
}

/* Platform naming */

/**
 * Whether this window is on macOS — asked only to choose how a key is *named*
 * in a hint, never what it does. Every handler reads `ctrlKey || metaKey`, so
 * ⌘ has worked since the first shortcut was bound.
 */
const IS_MAC = /Macintosh|Mac OS X/.test(navigator.userAgent);

/** The modifier to name in shortcut hints: ⌘ on macOS, Ctrl everywhere else. */
export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

/**
 * Shift as this platform prints it: `⇧` on macOS, `Shift` everywhere else.
 *
 * The same reasoning the global chord hint follows for ⌃⌥: a keycap naming a
 * glyph the keyboard does not carry is worse than a longer word. Apple prints
 * ⇧ on the key itself; Windows and Linux print Shift.
 */
export const SHIFT_KEY = IS_MAC ? "⇧" : "Shift";
