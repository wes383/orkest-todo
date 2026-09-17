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
}

const STORAGE_KEY = "orkest-settings.v1";

const DEFAULTS: AppSettings = {
  hiddenViews: {
    upcoming: false,
    overdue: false,
    starred: false,
    completed: false,
  },
};

function load(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Missing keys fall back to visible — an old or partial file never hides
    // anything the user did not hide themselves.
    return {
      hiddenViews: {
        ...DEFAULTS.hiddenViews,
        ...(parsed.hiddenViews ?? {}),
      },
    };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load);

  useEffect(() => {
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

  return { settings, setViewVisible };
}
