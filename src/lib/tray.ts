import * as React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Language } from "@/lib/messages";
import type { ViewId } from "@/lib/types";

/**
 * Must match `TRAY_COMMAND_EVENT` in `src-tauri/src/lib.rs`.
 */
const TRAY_COMMAND_EVENT = "tray:command";

/**
 * The views the tray carries a row for — must match `VIEW_ROWS` in
 * `src-tauri/src/lib.rs`.
 *
 * Duplicated on purpose, and validated at runtime below rather than trusted: the
 * Rust side is the one place that decides which rows exist, and a mismatch there
 * should cost a dropped tray click, not a `selectView("garbage")`. There is no
 * compile-time bridge between the two languages, so the guard is the bridge.
 */
const TRAY_VIEWS: readonly ViewId[] = ["today", "upcoming", "overdue"];

export type TrayCounts = Record<"today" | "upcoming" | "overdue", number>;

export type TrayCommand =
  | { action: "new-task" }
  | { action: "open-view"; view: ViewId };

/**
 * Two-way bridge between the tray menu and the app state.
 *
 * Three things travel between the two sides, and they travel in both directions
 * for a reason:
 *
 * - counts go **up**, because the tasks live in the webview's localStorage and
 *   Rust has no way to ask for them;
 * - the click comes **down**, because a native menu item can only report its own
 *   id — the meaning of 「今天」 belongs to `selectors.ts`.
 * - the language goes **up** too, for the same reason the counts do: the app's
 *   language is a frontend decision (stored in localStorage, defaulted from
 *   `navigator.languages`), and Rust has no way to reach either.
 */
export function useTrayBridge(
  counts: TrayCounts,
  lang: Language,
  onCommand: (command: TrayCommand) => void
) {
  /*
   * Held in a ref so the listener can be subscribed exactly once. Putting
   * `onCommand` in the deps instead would tear down and rebuild a Tauri event
   * handler on every render that produced a new callback — i.e. on every
   * keystroke in the search box.
   */
  const latest = React.useRef(onCommand);
  React.useEffect(() => {
    latest.current = onCommand;
  }, [onCommand]);

  const { today, upcoming, overdue } = counts;

  /*
   * Counts are pushed, never pulled. Keyed on the three numbers rather than on
   * the object, so a fresh `viewCounts(...)` result holding identical numbers
   * does not re-invoke — `viewCounts` rebuilds a new object every time the
   * memo runs.
   *
   * The language rides along in the same call. It is one round trip for two
   * facts that always repaint the same menu, and it means switching language
   * re-sends the counts as a side effect of `lang` being in the deps — no
   * second effect to keep in step.
   */
  React.useEffect(() => {
    if (!isTauri()) return;

    invoke("sync_tray", {
      counts: { today, upcoming, overdue },
      lang,
    }).catch((error: unknown) => {
      // Stale numbers in a tray menu are cosmetic. Never let them break the app.
      console.warn("[tray] failed to sync the tray menu", error);
    });
  }, [today, upcoming, overdue, lang]);

  React.useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    /*
     * `listen` is async, so there is a real window between calling it and
     * holding the unlisten function. Unmounting inside it — React's strict-mode
     * double-invoke, a hot reload — would otherwise leak the handler and deliver
     * every later click twice.
     */
    listen<TrayCommand>(TRAY_COMMAND_EVENT, (event) => {
      const command = event.payload;
      if (command.action === "new-task") {
        latest.current({ action: "new-task" });
      } else if (TRAY_VIEWS.includes(command.view)) {
        latest.current({ action: "open-view", view: command.view });
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error: unknown) => {
        console.warn("[tray] failed to listen for tray commands", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
