import * as React from "react";
import { useTheme } from "next-themes";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * NativeWindowTheme — keeps the OS-drawn window chrome in step with the in-app
 * theme.
 *
 * The webview theme and the native window theme are two independent things:
 * `next-themes` only toggles the `dark` class on `<html>`, while the title bar
 * is painted by the compositor from the *system* setting. On Windows that means
 * the caption bar stays light even when the app has switched to dark, which
 * reads as a bright stripe across the top of a dark window.
 *
 * `Window.setTheme` asks the OS to repaint the window chrome. But it does more
 * than that: Tauri relays the window theme into the webview
 * (`tauri-runtime-wry`: `ThemeChanged` → `wry::Webview::set_theme` →
 * WebView2 `SetPreferredColorScheme`), which rewrites `prefers-color-scheme`.
 * That media query is exactly the signal `next-themes` reads to resolve
 * `"system"`, so forcing a concrete theme here creates a feedback loop:
 *
 *   1. pick 深色        → window dark → `prefers-color-scheme: dark`
 *   2. pick 跟随系统    → next-themes asks the media query → "dark"
 *                       → resolves back to dark, and the app looks stuck
 *
 * So an explicit choice is forwarded as-is, while `"system"` is forwarded as
 * `null` — i.e. hand the decision back to the OS. The window then follows the
 * real system value and the webview's media query stays honest, which is what
 * lets 跟随系统 actually return to light.
 */
export function NativeWindowTheme() {
  const { theme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    // Both are undefined until next-themes has read localStorage, and the whole
    // thing is a no-op in a plain browser (dev server / `vite preview`) where
    // there is no Tauri window to talk to.
    if (!theme || !isTauri()) return;

    const next =
      theme === "system" ? null : resolvedTheme === "dark" ? "dark" : "light";

    getCurrentWindow()
      .setTheme(next)
      .catch((error: unknown) => {
        // A missing `core:window:allow-set-theme` permission lands here; failing
        // to tint the title bar is cosmetic, so never let it break theming.
        console.warn(
          `[theme] failed to set the window theme to ${next ?? "system"}`,
          error
        );
      });
  }, [theme, resolvedTheme]);

  return null;
}
