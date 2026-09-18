import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Leaving the app — the frontend's half of it.
 *
 * Two doors lead out, and both are Rust's to open: the tray's 退出, and the ✕
 * whenever 「关闭窗口时最小化到托盘」 is off (see `on_window_event` in
 * `src-tauri/src/lib.rs`). Neither may end the process on the spot, because a
 * focus session is a localStorage record the native side cannot reach — a session
 * that is still running can only be closed from here. Rust therefore asks rather
 * than takes (`request_quit`), this answers by calling `quit_app`, and the
 * process ends once the answer is given. The native side keeps a timer armed
 * against no answer at all, so a webview that is gone cannot strand the app.
 *
 * Which is also why 退出时自动结束专注 is a preference in `settings.ts` rather than
 * a mirrored boolean in Rust: the decision and the write it leads to both belong
 * to the side that owns the log. Rust asks a question, not "how should I behave".
 *
 * The one thing Rust does need to know in advance is which of the two things the
 * ✕ is — so `useCloseToTray` below pushes that down instead of waiting to be
 * asked. Not for symmetry's sake: a close request has to be answered inside the
 * window event handler, where `prevent_close` is decided there and then and there
 * is no moment to ask anything.
 *
 * Nothing here applies to `pnpm dev` in a plain browser: there is no tray, no
 * 退出, and no window to close the session for.
 */

/**
 * Must match `QUIT_REQUESTED` in `src-tauri/src/lib.rs` — pinned from that side
 * by a unit test, since a rename on either end fails silently.
 */
const QUIT_REQUESTED = "quit:requested";

/**
 * Must match the command registered in `src-tauri/src/lib.rs`, pinned there by a
 * unit test for the same reason: a rename costs nothing at build time and shows
 * up only as a ✕ that ignores the switch.
 */
const SET_CLOSE_TO_TRAY = "set_close_to_tray";

export function useQuitStopsFocus(
  stopFocus: boolean,
  endSession: () => void
): void {
  /*
   * Read through a ref so the listener can be subscribed exactly once. The
   * quit path runs *after* the last render it will ever get, so it must see the
   * setting and the callback as they stand now rather than as they stood when
   * the effect ran — with `[stopFocus, endSession]` as deps instead, the
   * listener would also be torn down and rebuilt on every span change, and a
   * quit landing in that gap would find no listener at all.
   */
  const latest = useRef({ stopFocus, endSession });
  useEffect(() => {
    latest.current = { stopFocus, endSession };
  }, [stopFocus, endSession]);

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen(QUIT_REQUESTED, () => {
      const { stopFocus: stop, endSession: end } = latest.current;
      if (stop) end();
      /*
       * Fired without awaiting the answer: this command ends the process, so
       * the promise is expected to be cut off rather than resolved. Anything
       * rejected here means the app went without us — the outcome that was
       * asked for. Rust's own fallback covers the case where neither happens.
       */
      invoke("quit_app").catch(() => undefined);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error: unknown) => {
        // Losing the listener costs the setting, not the quit: the native side
        // still ends the process on its own timer.
        console.warn("[quit] failed to listen for quit requests", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

/**
 * 关闭窗口时最小化到托盘 — told to the side that answers the ✕, rather than
 * stored, because that side is the one that has to act on it.
 *
 * Pushed once when the app mounts and again whenever the switch moves. The push
 * that never lands is survivable rather than silently wrong: Rust's own default
 * is the same `false` this setting ships with (`WindowClose::default`), and the
 * window cannot be closed by anyone before it has painted.
 */
export function useCloseToTray(closeToTray: boolean): void {
  useEffect(() => {
    if (!isTauri()) return;
    invoke(SET_CLOSE_TO_TRAY, { closeToTray }).catch((error: unknown) => {
      // The switch keeps its own value in `settings.ts`, so the worst case is a
      // ✕ that does the other thing until the app is restarted.
      console.warn("[quit] failed to hand the close behaviour down", error);
    });
  }, [closeToTray]);
}
