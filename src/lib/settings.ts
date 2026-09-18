import { useCallback, useEffect, useState } from "react";
import type { ViewId } from "@/lib/types";

/**
 * App settings that are neither data nor appearance: which smart views the
 * sidebar offers. Persisted to localStorage on every change, so a reload (and
 * the tray-resident instance) comes back exactly as left.
 *
 * Language and theme are owned elsewhere — the i18n provider and the theme
 * provider each persist their own — so only what no one else owns lives here.
 */

/** The views a user may hide. 全部任务 and 今天 are the app's spine; the rest
    are conveniences someone may not want printed at all times. */
export type HideableView = Exclude<ViewId, "all" | "today">;

export const HIDEABLE_VIEWS: HideableView[] = [
  "upcoming",
  "overdue",
  "starred",
  "completed",
];

export interface AppSettings {
  /** `true` = the view's row is not printed in the sidebar. */
  hiddenViews: Record<HideableView, boolean>;
  /** The focus log's two rules, in the units they are spoken in: a finished
      stretch shorter than `minSpanMinutes` is dropped as if the break had
      simply carried on, and a stretch that is still running is credited up to
      `maxSpanHours` — a switch left on by mistake stops counting there. Both
      rules govern stretches still being written; a stretch already closed
      keeps the floor it was closed under and the end its cap gave it. */
  minSpanMinutes: number;
  maxSpanHours: number;
  /** How much of the desktop shows through the focus widget's pill, as a
      percentage: 100 is a fully opaque surface. It reaches the widget over the
      snapshot the theme travels on (`focus-widget.ts`) rather than through the
      CSS tokens — the widget is a window of its own, with a document of its
      own, so nothing it renders can inherit from this one. */
  widgetOpacity: number;
  /** Whether quitting the app also stops a session that is still running.
      Lives here rather than in Rust, unlike the login item: the rule and the
      log it writes to belong to the same side, so the native side asks the
      webview instead of keeping a copy of this; see `quit.ts`. */
  quitStopsFocus: boolean;
}

const STORAGE_KEY = "orkest-settings.v1";

/** The shipped floor, in minutes. Stretches recorded before the floor became
    a setting were all judged against it, so it is the value history falls
    back to wherever a stretch carries no floor of its own. */
export const DEFAULT_MIN_SPAN_MINUTES = 5;

/** The pill ships fully opaque: the desktop showing through is a choice, not a
    default. */
export const DEFAULT_WIDGET_OPACITY = 100;

/** The floor for that choice. Below it the pill is invisible yet still takes
    clicks in the corner of the screen — that reads as a broken app, not as a
    setting someone made. */
export const MIN_WIDGET_OPACITY = 20;

const DEFAULTS: AppSettings = {
  hiddenViews: {
    upcoming: false,
    overdue: false,
    starred: false,
    completed: false,
  },
  minSpanMinutes: DEFAULT_MIN_SPAN_MINUTES,
  maxSpanHours: 8,
  widgetOpacity: DEFAULT_WIDGET_OPACITY,
  // Off: quitting has always meant the session keeps running, and a rule that
  // ends work on its own is one a reader should turn on deliberately.
  quitStopsFocus: false,
};

/** One number out of a file someone may have hand-edited: anything that is not
    a finite number falls back to the shipped default, anything out of range is
    pulled to the nearer end.

    `clamp` alone does not cover this — `Math.min`/`Math.max` propagate `NaN`,
    so `"abc"` would have been stored as `NaN` and read back as `NaN%` in the
    widget's CSS, which is a value the browser simply drops. */
function num(value: unknown, fallback: number, lo: number, hi: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(hi, Math.max(lo, parsed));
}

/** One boolean out of a file someone may have hand-edited: anything that is not
    a boolean falls back to the shipped default. Worth reading through rather
    than writing `?? default` — `"false"` is a string, and therefore truthy, so
    a quoted value left behind by hand would switch a rule on. */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function load(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Missing keys fall back to the shipped value — an old or partial file
    // never hides a view the user did not hide, and never makes a pill they
    // never dimmed translucent. The three numbers are read through `num`, so a
    // hand-edited `"abc"` or `9999` lands on the default or on the nearer end
    // of its range instead of on the screen.
    return {
      hiddenViews: {
        ...DEFAULTS.hiddenViews,
        ...(parsed.hiddenViews ?? {}),
      },
      minSpanMinutes: num(parsed.minSpanMinutes, DEFAULTS.minSpanMinutes, 0, 1440),
      maxSpanHours: num(parsed.maxSpanHours, DEFAULTS.maxSpanHours, 1, 24),
      widgetOpacity: Math.round(
        num(parsed.widgetOpacity, DEFAULTS.widgetOpacity, MIN_WIDGET_OPACITY, 100)
      ),
      quitStopsFocus: bool(parsed.quitStopsFocus, DEFAULTS.quitStopsFocus),
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * The focus rules, as milliseconds, read from a module-level mirror.
 *
 * The mirror exists for the boot path: the focus log's reconciliation
 * (`load` in focus-store) runs inside a state initialiser, before any effect
 * could hand it the hook's copy of settings — so it reads here, where the
 * answer is already in step with storage. The hook below keeps the mirror
 * current from then on.
 */
let current = load();

export function spanLimits(): { minMs: number; maxMs: number } {
  return {
    minMs: current.minSpanMinutes * 60_000,
    maxMs: current.maxSpanHours * 3_600_000,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(current);

  useEffect(() => {
    // Keep the mirror in step first: a reader that fires between the render
    // and the next paint still sees what the screen now shows.
    current = settings;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // A full or blocked quota is not a reason to crash the app over a
      // preference; the in-memory value still governs this session.
    }
  }, [settings]);

  const setViewVisible = useCallback(
    (view: HideableView, visible: boolean) => {
      setSettings((s) => ({
        ...s,
        hiddenViews: { ...s.hiddenViews, [view]: !visible },
      }));
    },
    []
  );

  const setSpanLimits = useCallback(
    (minSpanMinutes: number, maxSpanHours: number) => {
      setSettings((s) => ({ ...s, minSpanMinutes, maxSpanHours }));
    },
    []
  );

  /** Stored as the number the widget interpolates, so the caller's slider is
      the only place that has to know the range is a percentage. */
  const setWidgetOpacity = useCallback((widgetOpacity: number) => {
    setSettings((s) => ({ ...s, widgetOpacity }));
  }, []);

  const setQuitStopsFocus = useCallback((quitStopsFocus: boolean) => {
    setSettings((s) => ({ ...s, quitStopsFocus }));
  }, []);

  return {
    settings,
    setViewVisible,
    setSpanLimits,
    setWidgetOpacity,
    setQuitStopsFocus,
  };
}
