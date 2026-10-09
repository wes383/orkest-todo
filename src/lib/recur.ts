/**
 * Repeat rules: the next due date, and the words that describe a rule.
 *
 * The date arithmetic lives beside the other calendar helpers' conventions —
 * everything keyed off `YYYY-MM-DD` local strings, never UTC — but the two
 * functions here are the only places that interpret a `Recur`, so the rule and
 * its meaning stay together.
 */

import {
  LOCALES,
  translate,
  type Language,
} from "@/lib/messages";
import { addDays, formatDate, fromISODate, toISODate } from "@/lib/date";
import type { Recur } from "@/lib/types";

/** 2024-01-07 was a Sunday — a fixed anchor the weekday names are read from. */
const SUNDAY_ANCHOR = new Date(2024, 0, 7);

/** Localized short weekday name for a day index (0 = Sunday … 6 = Saturday). */
export function weekdayName(day: number, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short" }).format(
    new Date(SUNDAY_ANCHOR.getFullYear(), SUNDAY_ANCHOR.getMonth(), SUNDAY_ANCHOR.getDate() + day)
  );
}

/**
 * The first due date strictly after `fromISO` that the rule admits.
 *
 * Returns `null` when the rule cannot name a next day at all — an empty
 * weekday set — and callers treat that as "complete without spawning": a rule
 * that picks no days has no next occurrence to create.
 *
 * Monthly and yearly clamp: a rule born on the 31st still fires in February,
 * on that month's last day, rather than skipping the month. That matches how
 * people read 每月 — "once a month" — and keeps the anchor day for the eleven
 * months that do have it.
 */
export function nextDueDate(recur: Recur, fromISO: string): string | null {
  switch (recur.kind) {
    case "daily":
      return addDays(fromISO, Math.max(1, recur.interval));

    case "weekly":
      return addDays(fromISO, 7 * Math.max(1, recur.interval || 1));

    case "weekdays": {
      if (recur.days.length === 0) return null;
      for (let step = 1; step <= 7; step++) {
        const iso = addDays(fromISO, step);
        if (recur.days.includes(fromISODate(iso).getDay())) return iso;
      }
      return null;
    }

    case "monthly": {
      const d = fromISODate(fromISO);
      // Day 0 of the following month is that month's last day.
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
      return toISODate(
        new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), lastDay))
      );
    }

    case "yearly": {
      const d = fromISODate(fromISO);
      const year = d.getFullYear() + 1;
      // Feb 29 lands on Feb 28 in a common year.
      const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
      return toISODate(new Date(year, d.getMonth(), Math.min(d.getDate(), lastDay)));
    }
  }
}

/**
 * The next occurrence of a repeating task, end conditions included: the due
 * date the next instance carries, and the rule that instance carries — a
 * count-based rule arrives decremented, so "共 3 次" counts itself down
 * through each spawn until the last instance spawns nothing. `null` when the
 * rule names no next day, the next day falls past an `until` date, or the
 * current instance is the last a `count` allows — callers treat it exactly as
 * "complete without spawning", the same contract [`nextDueDate`]'s `null` has.
 *
 * An `until` date is inclusive: an occurrence may land on it, and completing
 * *that* one is what ends the series.
 */
export function nextOccurrence(
  recur: Recur,
  fromISO: string
): { date: string; recur: Recur } | null {
  const date = nextDueDate(recur, fromISO);
  if (!date) return null;
  if (recur.end?.kind === "until" && date > recur.end.date) return null;
  if (recur.end?.kind === "count") {
    if (recur.end.n <= 1) return null;
    return { date, recur: { ...recur, end: { kind: "count", n: recur.end.n - 1 } } };
  }
  return { date, recur };
}

/**
 * Fills in fields that arrived after a rule was first saved. Old storage can
 * hold a bare `{ kind: "weekly" }` from before the weekly interval existed —
 * coercion happens once at the load door, so every reader sees a complete
 * rule, the same bargain the store's other `??` defaults strike.
 */
export function normalizeRecur(recur: Recur | null): Recur | null {
  if (recur?.kind === "weekly" && typeof (recur as { interval?: number }).interval !== "number") {
    return { kind: "weekly", interval: 1, end: recur.end };
  }
  return recur ?? null;
}

/**
 * The rule as an RFC 5545 (iCalendar) RRULE, for exports meant to be read by
 * other software — a spreadsheet, a calendar importer — rather than a person
 * scanning a column. The localized label stays on the card and in the editor;
 * the file speaks the standard.
 *
 * `daily` and `weekdays` carry everything inside themselves. `weekly` means
 * "every week on the due date's weekday" (see [`nextDueDate`]'s +7 arithmetic),
 * so the weekday is written in from `dueISO` to keep the rule self-contained —
 * a row with no DTSTART of its own would otherwise lose that anchor. Monthly
 * and yearly stay bare: their clamp-to-last-day behavior has no faithful
 * RRULE spelling, and `BYMONTHDAY` would promise a day February cannot keep.
 *
 * Empty string for nothing — callers check first, so this never sees a
 * non-rule; the parameter is the same `Recur | null` the store holds.
 */
export function recurRrule(recur: Recur, dueISO: string | null): string {
  const day = (index: number) => RRULE_DAY[index];
  // RFC 5545 keeps UNTIL and COUNT mutually exclusive — exactly one may end a
  // rule, which is also what the model itself allows. UNTIL drops the dashes:
  // `2026-12-31` becomes `20261231`, the DATE form the spec writes.
  const end = () =>
    recur.end?.kind === "until"
      ? `;UNTIL=${recur.end.date.replace(/-/g, "")}`
      : recur.end?.kind === "count"
        ? `;COUNT=${recur.end.n}`
        : "";
  switch (recur.kind) {
    case "daily":
      return (
        (recur.interval === 1 ? "FREQ=DAILY" : `FREQ=DAILY;INTERVAL=${recur.interval}`) + end()
      );
    case "weekly": {
      const base = recur.interval > 1 ? `FREQ=WEEKLY;INTERVAL=${recur.interval}` : "FREQ=WEEKLY";
      return (dueISO ? `${base};BYDAY=${day(fromISODate(dueISO).getDay())}` : base) + end();
    }
    case "weekdays":
      return (
        `FREQ=WEEKLY;BYDAY=${[...recur.days]
          .sort((a, b) => a - b)
          .map(day)
          .join(",")}` + end()
      );
    case "monthly":
      return "FREQ=MONTHLY" + end();
    case "yearly":
      return "FREQ=YEARLY" + end();
  }
}

/** RFC 5545's two-letter weekday codes, indexed by JS day (0 = Sunday …). */
const RRULE_DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * The label a task card and the editor's select both show — one wording per
 * rule, so the card and the form can never disagree about what it repeats.
 */
export function recurLabel(recur: Recur, lang: Language): string {
  const base = recurBaseLabel(recur, lang);
  // The card states when the series stops in the same breath as how it steps,
  // so a rule and its expiry never have to be read from two places. The date
  // speaks the app's display format — 10月15日 / Oct 15 — not the storage ISO.
  if (!recur.end) return base;
  return recur.end.kind === "until"
    ? translate(lang, "recur.untilSuffix", { base, date: formatDate(recur.end.date, lang) })
    : translate(lang, "recur.countSuffix", { base, n: recur.end.n });
}

function recurBaseLabel(recur: Recur, lang: Language): string {
  switch (recur.kind) {
    case "daily":
      return recur.interval === 1
        ? translate(lang, "recur.everyDay")
        : translate(lang, "recur.everyNDays", { n: recur.interval });
    case "weekly":
      return recur.interval === 1
        ? translate(lang, "recur.weekly")
        : translate(lang, "recur.everyNWeeks", { n: recur.interval });
    case "weekdays": {
      if (recur.days.length === 0) return translate(lang, "recur.weekly");
      const names = [...recur.days]
        .sort((a, b) => a - b)
        .map((d) => weekdayName(d, lang));
      // zh short names all lead with 周 ("周一"); the template already says
      // 每周, so the heads are stripped — 每周一、三、五, not 每周周一、周三.
      return translate(lang, "recur.weeklyOn", {
        days:
          lang === "zh"
            ? names.map((n) => n.replace(/^周/, "")).join("、")
            : names.join(", "),
      });
    }
    case "monthly":
      return translate(lang, "recur.monthly");
    case "yearly":
      return translate(lang, "recur.yearly");
  }
}
