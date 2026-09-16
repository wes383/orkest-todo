import * as React from "react";
import { todayISO } from "@/lib/date";

/**
 * The current local date (`YYYY-MM-DD`), kept honest across midnight.
 *
 * Orkest is built to sit in the system tray for days at a stretch, and that
 * makes "today" mutable state rather than a constant. `selectTodos`,
 * `viewCounts` and `computeStats` all classify tasks against `todayISO()`
 * (`daysFromToday` → 今天 / 已逾期 / 即将到期), but every derivation built on
 * them is memoised on `[todos, filters]`. An instance that stays up overnight
 * therefore keeps yesterday's buckets: tasks due "today" never turn 已逾期, the
 * 今天 count in the sidebar never goes down, and the list keeps yesterday's
 * 今天 / 明天 headers. Closing and reopening the app used to perform that
 * refresh incidentally — background residency takes that away, so it has to be
 * explicit.
 *
 * Deliberately cheap: one timer aimed at the next local midnight, plus a
 * re-check whenever the window returns to the foreground (a suspended machine
 * can sail straight past the timer). The value only changes on a real rollover,
 * so exposing the window never causes a re-render.
 */
export function useTodayISO(): string {
  const [today, setToday] = React.useState(todayISO);

  React.useEffect(() => {
    let timer = 0;

    /**
     * Publish only on an actual change. The window regains focus far more often
     * than the date rolls over, and `setToday` with an equal string would still
     * re-render — and re-run every memo that keyed on it.
     */
    const sync = () => {
      setToday((prev) => {
        const next = todayISO();
        return next === prev ? prev : next;
      });
    };

    const msUntilTomorrow = () => {
      const now = new Date();
      // Land one second *past* midnight: hitting 00:00:00.000 exactly risks a
      // `todayISO()` that rounds back to yesterday.
      const next = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1
      );
      return next.getTime() - now.getTime();
    };

    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sync();
        // Re-arm for the following midnight — the timer is one-shot.
        arm();
      }, msUntilTomorrow());
    };

    const onVisibilityChange = () => {
      if (!document.hidden) sync();
    };

    arm();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return today;
}
