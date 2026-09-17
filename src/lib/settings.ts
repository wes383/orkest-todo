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
}

const STORAGE_KEY = "orkest-settings.v1";

/** The shipped floor, in minutes. Stretches recorded before the floor became
    a setting were all judged against it, so it is the value history falls
    back to wherever a stretch carries no floor of its own. */
export const DEFAULT_MIN_SPAN_MINUTES = 5;

const DEFAULTS: AppSettings = {
  hiddenViews: {
    upcoming: false,
    overdue: false,
    starred: false,
    completed: false,
  },
  minSpanMinutes: DEFAULT_MIN_SPAN_MINUTES,
  maxSpanHours: 8,
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function load(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Missing keys fall back to visible — an old or partial file never hides
    // anything the user did not hide themselves. The two focus rules clamp to
    // their sane ranges rather than trusting whatever a hand-edited file says.
    return {
      hiddenViews: {
        ...DEFAULTS.hiddenViews,
        ...(parsed.hiddenViews ?? {}),
      },
      minSpanMinutes: clamp(
        Number(parsed.minSpanMinutes ?? DEFAULTS.minSpanMinutes),
        0,
        1440
      ),
      maxSpanHours: clamp(
        Number(parsed.maxSpanHours ?? DEFAULTS.maxSpanHours),
        1,
        24
      ),
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

  return { settings, setViewVisible, setSpanLimits };
}
