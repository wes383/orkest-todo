import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { nowHM, todayISO } from "@/lib/date";
import { translate, type Language } from "@/lib/messages";
import type { Todo } from "@/lib/types";

/**
 * 到点提醒 — the last leg of the due-time field.
 *
 * The shape of this module is decided by three facts the rest of the app
 * already fixed. First, the task data lives in the webview's localStorage, so
 * the scheduler lives here too: a Rust-side timer would have to poll a state
 * it cannot see. Second, the app is tray-resident — the process is up for
 * days — so a plain 30-second ticker is a real scheduler, not a dev shortcut.
 * Third, a recurring task's next occurrence is a brand-new id (see
 * `spawnNextOccurrence` in `store.ts`), so deduplication by id needs no
 * special casing for repeats: each occurrence earns its own reminder the day
 * it comes due.
 */

/** How often the ticker wakes. Half a minute is fine-grained next to a
    reminder whose smallest unit of earliness is a minute. */
const TICK_MS = 30_000;

/** The leads a task may ask its reminder for, in minutes before its due time.
    One list for every writer — the editor's select, the card menu's submenu —
    so the choices can never drift apart. `null` (none) is each picker's own
    item rather than a member here: absence reads better as a word. */
export const REMINDER_LEADS = [0, 5, 15, 30, 60, 120];

const STORAGE_KEY = "orkest-reminders.v1";

/** One task the ticker currently owes a notification, and how early it asked
    to be woken — the body line names the lead, and the lead is the task's
    own, not a global one. */
export interface ReminderDue {
  id: string;
  title: string;
  lead: number;
}

/** `"17:05"` → `1025`. Minutes since midnight, the unit every comparison in
    this module speaks; a malformed time simply reads as midnight, which the
    editor's own validation makes unreachable in practice. */
export function hmMinutes(hm: string): number {
  const [hours, minutes] = hm.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * The tasks whose reminder is owed as of `nowMinutes`.
 *
 * The rule in one line: **undone, due today, carries a time, asked to be
 * reminded, and now has reached that time minus its own lead.** A bare due
 * date never qualifies — a whole day has no "at o'clock" to remind at, and
 * the morning-overview idea that would suit those is a different notification
 * with a different channel. Which tasks remind at all is each task's own
 * choice (`remindBefore !== null`): silence is the default, and the editor is
 * where a task opts in. There is no upper bound on lateness on purpose: a
 * task noticed late the same day is still worth one notification, and the day
 * boundary is what retires it (tomorrow it is overdue, not due).
 */
export function dueReminders(
  todos: readonly Todo[],
  today: string,
  nowMinutes: number
): ReminderDue[] {
  return todos
    .filter(
      (todo) =>
        !todo.done &&
        todo.dueDate === today &&
        todo.dueTime !== null &&
        todo.remindBefore !== null &&
        hmMinutes(todo.dueTime) - todo.remindBefore <= nowMinutes
    )
    .map((todo) => ({
      id: todo.id,
      title: todo.title,
      // The filter above guarantees it: only tasks that asked are mapped.
      lead: todo.remindBefore as number,
    }));
}

/** The ticker's notebook: which ids already got their notification today.
    Keyed by date so a new day starts a clean page with no sweep to write. */
interface FiredState {
  date: string;
  fired: string[];
}

function loadFired(today: string): FiredState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FiredState;
      if (parsed.date === today && Array.isArray(parsed.fired)) {
        return parsed;
      }
    }
  } catch {
    // A torn or foreign value reads as an empty page, same as a first run.
  }
  return { date: today, fired: [] };
}

/** One notification, best effort. A missing or denied channel (the plain
    `pnpm dev` browser, a silent-focus OS) fails this promise and nothing
    else — the task is still on its list, and the next tick moves on. */
function notify(title: string, body: string): void {
  invoke("send_notification", { title, body }).catch(() => {
    // Deliberately swallowed: the ticker must never take the app down over a
    // notification that did not land.
  });
}

/**
 * The reminder ticker, live for as long as the app is.
 *
 * Runs in the main window alone — the focus widget mounts `FocusWidget`, not
 * `App`, so there is no second instance to double-fire. Each wake recomputes
 * the due set from scratch and subtracts what the notebook already paid out,
 * which makes the whole thing idempotent: a tick, a re-render, a task edited —
 * each just re-asks "what is still owed".
 *
 * The first wake of a session is the catch-up: the machine may have been
 * booted hours after several times came and went, and five notifications
 * arriving in a row is spam, not service. More than one owed task folds into
 * a single summary; exactly one keeps its own card. Every wake after that
 * announces one task at a time, as they come due while the app runs.
 */
export function useReminders(
  todos: readonly Todo[],
  language: Language
): void {
  // A ref, not state: the notebook is bookkeeping, and writing it through
  // setState would re-render the whole app every thirty seconds for nothing.
  const firedRef = useRef<FiredState | null>(null);
  const firstTickRef = useRef(true);

  useEffect(() => {
    if (!isTauri()) return;

    const tick = () => {
      const today = todayISO();
      // First wake of the session reads yesterday's — this morning's — page
      // back: without it, a task reminded at 9:00 and an app restarted at
      // 9:05 would be reminded twice for the same due time.
      if (firedRef.current?.date !== today) {
        firedRef.current = loadFired(today);
      }
      const fired = firedRef.current;

      const [h, m] = nowHM().split(":").map(Number);
      const due = dueReminders(todos, today, h * 60 + m).filter(
        (entry) => !fired.fired.includes(entry.id)
      );
      if (due.length === 0) return;

      const catchUp = firstTickRef.current && due.length > 1;
      firstTickRef.current = false;

      if (catchUp) {
        notify(
          translate(language, "reminder.summaryTitle"),
          translate(language, "reminder.summaryBody", { count: due.length })
        );
      } else {
        for (const entry of due) {
          // The body speaks in the lead's own unit — "还有 1 小时到期",
          // not "还有 60 分钟" — so whole hours get their own message.
          notify(
            entry.title,
            entry.lead >= 60 && entry.lead % 60 === 0
              ? translate(language, "reminder.dueInHours", {
                  hours: entry.lead / 60,
                })
              : translate(language, "reminder.dueIn", { minutes: entry.lead })
          );
        }
      }

      fired.fired.push(...due.map((entry) => entry.id));
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fired));
      } catch {
        // A blocked quota costs at most a duplicate notification after a
        // restart — annoying once, hardly a state corruption.
      }
    };

    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [todos, language]);
}
