"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

/**
 * Orkest UI ThemeProvider
 *
 * Wraps next-themes to provide:
 * - Light / Dark / High Contrast modes
 * - System preference detection
 * - Persistence to localStorage
 * - Runtime theme switching via CSS variables
 *
 * @example
 * <ThemeProvider defaultTheme="system" enableSystem>
 *   <App />
 * </ThemeProvider>
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * High contrast is one setting with several readers — the settings switch, the
 * toaster, and, through the `high-contrast` class, the focus widget's snapshot.
 * So it cannot live in a hook's own `useState`: every call site would get a
 * private copy starting at `false`, and the settings page — unmounted each time
 * the reader opens another screen — would switch the mode back off on its way
 * in again. Held here as a module-level value instead, persisted where the
 * readers can reach it, and subscribed to by each of them.
 */
const HIGH_CONTRAST_KEY = "orkest-high-contrast.v1";

function readStoredHighContrast(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIGH_CONTRAST_KEY) === "true";
  } catch {
    return false;
  }
}

let highContrast = readStoredHighContrast();
const highContrastListeners = new Set<() => void>();

/**
 * The class is the contract: every high-contrast rule in `globals.css` keys off
 * `html.high-contrast`, and `focus-widget.ts` reads it back out of the document
 * when it builds a snapshot. Applied right here, at import time, rather than
 * from an effect, so the mode is on the document before the first component
 * renders and no reader has to be the one that turns it on.
 */
function applyHighContrast(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("high-contrast", highContrast);
}

applyHighContrast();

function getHighContrast(): boolean {
  return highContrast;
}

function subscribeHighContrast(listener: () => void): () => void {
  highContrastListeners.add(listener);
  return () => {
    highContrastListeners.delete(listener);
  };
}

function writeHighContrast(next: boolean): void {
  if (next === highContrast) return;
  highContrast = next;
  try {
    window.localStorage.setItem(HIGH_CONTRAST_KEY, String(next));
  } catch {
    // A full or blocked quota is no reason to lose the setting for the rest of
    // the session; the value above still governs it.
  }
  applyHighContrast();
  highContrastListeners.forEach((listener) => listener());
}

/**
 * Unified appearance state: merges "light/dark" and "high-contrast on/off" into a
 * single enum to avoid unexpected combinations from two independent booleans during switching.
 *
 * - `light`             — normal light
 * - `dark`              — normal dark
 * - `light-hc`          — light + high contrast
 * - `dark-hc`           — dark + high contrast
 */
export type Appearance = "light" | "dark" | "light-hc" | "dark-hc";

/**
 * useAppTheme — extended theme hook.
 *
 * Recommended API: use `appearance` + `setAppearance` (single state, no combination ambiguity).
 * The legacy `setTheme` / `setHighContrast` / `toggleTheme` / `toggleHighContrast`
 * are kept for backward compatibility and delegate to `setAppearance` internally.
 */
export function useAppTheme() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();
  const highContrast = React.useSyncExternalStore(
    subscribeHighContrast,
    getHighContrast,
    // No server render in this app, but the third argument keeps the snapshot
    // honest for the one render React does without a DOM.
    getHighContrast
  );

  const setHighContrast = React.useCallback(
    (next: React.SetStateAction<boolean>) => {
      writeHighContrast(
        typeof next === "function" ? next(getHighContrast()) : next
      );
    },
    []
  );

  const isDark = resolvedTheme === "dark";

  /** Current unified appearance (derived from resolvedTheme + highContrast). */
  const appearance: Appearance = isDark
    ? highContrast
      ? "dark-hc"
      : "dark"
    : highContrast
    ? "light-hc"
    : "light";

  /** Set the unified appearance, updating both the dark class and the high-contrast class. */
  const setAppearance = React.useCallback(
    (next: Appearance) => {
      const nextDark = next === "dark" || next === "dark-hc";
      const nextHc = next === "light-hc" || next === "dark-hc";
      setTheme(nextDark ? "dark" : "light");
      setHighContrast(nextHc);
    },
    [setTheme, setHighContrast]
  );

  const toggleHighContrast = React.useCallback(() => {
    setHighContrast(!getHighContrast());
  }, [setHighContrast]);

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return {
    theme,
    resolvedTheme,
    systemTheme,
    setTheme,
    toggleTheme,
    highContrast,
    setHighContrast,
    toggleHighContrast,
    /** Recommended unified appearance API. */
    appearance,
    setAppearance,
    isDark,
    isLight: resolvedTheme === "light",
  };
}
