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
  const [highContrast, setHighContrast] = React.useState(false);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("high-contrast", highContrast);
  }, [highContrast]);

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
    [setTheme]
  );

  const toggleHighContrast = React.useCallback(() => {
    setHighContrast((v) => !v);
  }, []);

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
