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
import { addDays, fromISODate, toISODate } from "@/lib/date";
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
      return addDays(fromISO, 7);

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
  switch (recur.kind) {
    case "daily":
      return recur.interval === 1
        ? "FREQ=DAILY"
        : `FREQ=DAILY;INTERVAL=${recur.interval}`;
    case "weekly":
      return dueISO
        ? `FREQ=WEEKLY;BYDAY=${day(fromISODate(dueISO).getDay())}`
        : "FREQ=WEEKLY";
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=${[...recur.days]
        .sort((a, b) => a - b)
        .map(day)
        .join(",")}`;
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
  }
}

/** RFC 5545's two-letter weekday codes, indexed by JS day (0 = Sunday …). */
const RRULE_DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * The label a task card and the editor's select both show — one wording per
 * rule, so the card and the form can never disagree about what it repeats.
 */
export function recurLabel(recur: Recur, lang: Language): string {
  switch (recur.kind) {
    case "daily":
      return recur.interval === 1
        ? translate(lang, "recur.everyDay")
        : translate(lang, "recur.everyNDays", { n: recur.interval });
    case "weekly":
      return translate(lang, "recur.weekly");
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
