import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * 退出时自动结束专注 — the frontend's half of leaving.
 *
 * Leaving is Rust's to do: the tray's 退出 ends the process, and on its own it
 * would end it on the spot. But a focus session is a localStorage record the
 * native side cannot reach, so a session that is still running can only be
 * closed from here. Rust therefore asks rather than takes (`request_quit` in
 * `src-tauri/src/lib.rs`), this answers by calling `quit_app`, and the process
 * ends once the answer is given. The native side keeps a timer armed against no
 * answer at all, so a webview that is gone cannot strand the app.
 *
 * Which is also why this is a preference in `settings.ts` rather than a
 * mirrored boolean in Rust: the decision and the write it leads to both belong
 * to the side that owns the log. Rust asks a question, not "how should I
 * behave".
 *
 * Nothing here applies to `pnpm dev` in a plain browser: there is no tray, no
 * 退出, and no window to close the session for.
 */

/**
 * Must match `QUIT_REQUESTED` in `src-tauri/src/lib.rs` — pinned from that side
 * by a unit test, since a rename on either end fails silently.
 */
const QUIT_REQUESTED = "quit:requested";

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
