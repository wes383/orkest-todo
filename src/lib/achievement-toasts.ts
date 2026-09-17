import { useEffect } from "react";
import { milestones } from "@/lib/focus-achievements";
import { bucketByDay, type FocusSpan } from "@/lib/focus-spans";
import { translate, type Language } from "@/lib/messages";
import { toast } from "@/components/ui/toaster";

/**
 * Celebrates a milestone the moment it is earned: whenever the focus log
 * changes, the board is recomputed over the whole log and any milestone that
 * now stands reached but was never toasted is announced in the corner.
 *
 * The celebrated ids live in their own localStorage key rather than in memory,
 * so a trophy toasts exactly once — on the day it is earned, not again on
 * every launch after. The very first run writes the attendance silently
 * instead of congratulating the reader for a shelf of history they already
 * know about.
 */
const KEY = "orkest-achievements.v1";

function loadSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : (JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

function saveSeen(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // A blocked or full store keeps the toasts ephemeral, not broken.
  }
}

export function useAchievementToasts(
  spans: FocusSpan[],
  language: Language
): void {
  useEffect(() => {
    const now = Date.now();
    const board = milestones(spans, bucketByDay(spans, now), now, language);
    const items = board.flatMap((group) => group.items);

    const seen = loadSeen();
    // First run ever: everything already reached predates the celebration, so
    // it is recorded without a fanfare and only the future gets to toast.
    if (seen === null) {
      saveSeen(items.filter((item) => item.reached).map((item) => item.id));
      return;
    }

    const known = new Set(seen);
    const fresh = items.filter((item) => item.reached && !known.has(item.id));
    if (fresh.length === 0) return;

    for (const item of fresh) {
      toast.success(
        translate(language, "focus.ms.toastTitle", {
          name: translate(language, item.nameKey, item.nameVars),
        }),
        { description: translate(language, item.goalKey, item.goalVars) }
      );
    }
    saveSeen([...seen, ...fresh.map((item) => item.id)]);
  }, [spans, language]);
}
