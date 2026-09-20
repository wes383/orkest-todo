"use client";

import { useEffect } from "react";

/**
 * Keeps the webview from behaving like a browser tab.
 *
 * A Tauri window renders web content, so the engine underneath still answers
 * the shortcuts it answers on the web: F5 reloads the whole app and throws the
 * running focus session away, Ctrl+F slides a find bar over the window,
 * Ctrl+P prints it, Ctrl+± zooms it. None of those means anything here, and
 * each one is one accidental chord away from losing state — so they are
 * answered here once, at the document level, instead of being un-learned by
 * every view.
 *
 * Two things stay deliberately out of the way:
 *
 *  - the app's own chords, which the keyboard effect in `App.tsx` owns: Ctrl+K
 *    for the palette, Ctrl+F for the search field, Ctrl+N and Ctrl+Shift+N for
 *    the two ways to write a task. `preventDefault` is not `stopPropagation`,
 *    so the `f` in the set below is not a fight over the same chord — the guard
 *    is what keeps the engine's find bar from opening, and the app's own
 *    handler runs either way;
 *  - everything without a modifier, and the clipboard and editing chords
 *    (Ctrl+C/X/V/A/Z/…), which are how text is written into this app.
 */

/** Browser chrome that answers to a bare function key. */
const BLOCKED_FUNCTION_KEYS = new Set([
  "F1", // help
  "F3", // find next
  "F4", // address bar (historic)
  "F5", // reload — the dangerous one: a full reload mid-session
  "F7", // caret browsing toggle
  "F10", // menu bar
  "F11", // fullscreen
  "F12", // devtools
]);

/** Browser chrome that answers to Ctrl + a letter. Notably absent: `k` and
    `n` — the app binds those itself — and the editing letters, which are how
    the user types. `f` stays *in* the set even though the app wants that chord
    too: the engine's find bar is precisely what must not open, and a
    `preventDefault` here never reached the app's own handler. */
const BLOCKED_CONTROL_KEYS = new Set(["f", "g", "h", "o", "p", "s", "t", "u", "w"]);

/** Zoom resets and steps, with or without Shift. `0` returns to 100%. */
const BLOCKED_ZOOM_KEYS = new Set(["=", "+", "-", "_", "0"]);

export function useBrowserGuards() {
  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const blockShortcut = (event: KeyboardEvent) => {
      // An IME in composition owns the keyboard until it commits — a Chinese
      // candidate window must never see its keys swallowed here.
      if (event.isComposing) return;

      if (BLOCKED_FUNCTION_KEYS.has(event.key)) {
        event.preventDefault();
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (BLOCKED_CONTROL_KEYS.has(key)) {
        event.preventDefault();
        return;
      }
      // Hard reload and devtools live behind the shifted chords; zoom sits on
      // the plain ones. Both are engine chrome, so both go.
      if (
        (event.shiftKey && (key === "r" || key === "i" || key === "j")) ||
        (!event.shiftKey &&
          (key === "r" || key === "i" || key === "j" || BLOCKED_ZOOM_KEYS.has(key)))
      ) {
        event.preventDefault();
      }
    };

    // Ctrl + wheel is the pinch-zoom of the desktop: the engine scales the
    // page and the layout never comes back quite right. Must be non-passive
    // or the preventDefault is ignored.
    const blockZoomWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockShortcut);
    document.addEventListener("wheel", blockZoomWheel, { passive: false });
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcut);
      document.removeEventListener("wheel", blockZoomWheel);
    };
  }, []);
}
