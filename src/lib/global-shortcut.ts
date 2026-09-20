import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * The OS-wide chord — the desktop-only half of "reach the app from anywhere".
 *
 * One chord lives in Rust (`set_global_shortcuts` in `src-tauri/src/lib.rs`),
 * and it lands on the tray command channel the native menu already uses, so a
 * chord and a click can never drift into two behaviours:
 *
 *   Ctrl+Alt+F → "toggle-focus"  (the switch flips, window stays put)
 *
 * One, deliberately: flipping the switch is the only move worth reaching for
 * from behind the window, because it needs no window at all. Raising the
 * window for a new task used to ride a second chord, and the tray menu's
 * 新建任务 row still does exactly that — as a click, where the reader already
 * is when they go looking for it.
 *
 * This side only mirrors the setting down: registration is a global claim on
 * the OS, so it must exist exactly while the switch says so — turning the
 * setting off unregisters the chord, with no stale hook left behind. A failed
 * registration (another app already holds the chord) is a console warning,
 * never a broken app.
 *
 * All of this is a no-op in a plain browser, where no OS will hand us keys.
 */

/** The two modifiers the chord holds down, written the way the platform at
 *  hand writes them.
 *
 *  The chord is literally Ctrl+Alt everywhere — `CommandOrControl` is
 *  deliberately not used, so it stays put whatever the system remaps — but the
 *  *names* are not portable, and the settings page is the one place they are
 *  spelled out. `⌥` labels a key Windows and Linux keyboards do not have, and
 *  `⌃` reads there as a typo, so those two glyphs are kept for macOS, which is
 *  where they are the ordinary way to write Control and Option. */
export function chordModifier(): string {
  return isMac() ? "⌃⌥" : "Ctrl+Alt+";
}

/** Whether this window is on macOS. Asked only to choose how the chord is
    written down, never to change what it does.
 *
 *  The user agent is the one answer a WKWebView and a WebView2 both give:
 *  `navigator.platform` is deprecated, `userAgentData` is Chromium-only, and
 *  the engine here is whatever the OS happens to ship. Guarded because a Node
 *  run — the unit tests — has no `navigator` at all. */
function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
}

export function useGlobalShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!isTauri()) return;
    invoke("set_global_shortcuts", { enabled }).catch((error: unknown) => {
      console.warn("[shortcuts] failed to sync global shortcuts", error);
    });
  }, [enabled]);
}
