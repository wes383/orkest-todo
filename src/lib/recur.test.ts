import { describe, expect, it } from "vitest";
import { nextDueDate, nextOccurrence, normalizeRecur, recurRrule } from "@/lib/recur";
import type { Recur } from "@/lib/types";

describe("nextDueDate", () => {
  it("daily honours the interval and never drops below one day", () => {
    expect(nextDueDate({ kind: "daily", interval: 3 }, "2026-01-01")).toBe("2026-01-04");
    expect(nextDueDate({ kind: "daily", interval: 0 }, "2026-01-01")).toBe("2026-01-02");
  });

  it("weekly advances by seven days", () => {
    expect(nextDueDate({ kind: "weekly", interval: 1 }, "2026-02-26")).toBe("2026-03-05");
  });

  it("weekly honours the interval, two weeks at a time", () => {
    expect(nextDueDate({ kind: "weekly", interval: 2 }, "2026-02-26")).toBe("2026-03-12");
    expect(nextDueDate({ kind: "weekly", interval: 0 }, "2026-02-26")).toBe("2026-03-05");
  });

  it("weekdays picks the next chosen weekday, never today", () => {
    // 2026-01-05 is a Monday.
    expect(nextDueDate({ kind: "weekdays", days: [1, 3] }, "2026-01-05")).toBe("2026-01-07");
    expect(nextDueDate({ kind: "weekdays", days: [1] }, "2026-01-05")).toBe("2026-01-12");
  });

  it("an empty weekday set has no next occurrence", () => {
    expect(nextDueDate({ kind: "weekdays", days: [] }, "2026-01-05")).toBeNull();
  });

  it("monthly clamps to the month's last day", () => {
    expect(nextDueDate({ kind: "monthly" }, "2026-01-31")).toBe("2026-02-28");
  });

  it("yearly lands Feb 29 on Feb 28 in a common year", () => {
    expect(nextDueDate({ kind: "yearly" }, "2024-02-29")).toBe("2025-02-28");
  });
});

describe("recurRrule", () => {
  it("writes an interval only when it is not one", () => {
    expect(recurRrule({ kind: "daily", interval: 1 }, null)).toBe("FREQ=DAILY");
    expect(recurRrule({ kind: "daily", interval: 3 }, null)).toBe("FREQ=DAILY;INTERVAL=3");
  });

  it("anchors a bare weekly rule to the due date's weekday", () => {
    // 2026-01-05 is a Monday → MO.
    expect(recurRrule({ kind: "weekly", interval: 1 }, "2026-01-05")).toBe(
      "FREQ=WEEKLY;BYDAY=MO"
    );
  });

  it("writes a weekly interval only when it is not one", () => {
    expect(recurRrule({ kind: "weekly", interval: 2 }, "2026-01-05")).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"
    );
  });

  it("sorts weekday codes in calendar order", () => {
    expect(recurRrule({ kind: "weekdays", days: [5, 1, 3] }, null)).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    );
  });

  it("appends the end condition as UNTIL or COUNT, never both", () => {
    expect(
      recurRrule(
        { kind: "daily", interval: 1, end: { kind: "until", date: "2026-12-31" } },
        null
      )
    ).toBe("FREQ=DAILY;UNTIL=20261231");
    expect(
      recurRrule(
        { kind: "weekly", interval: 2, end: { kind: "count", n: 6 } },
        "2026-01-05"
      )
    ).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=6");
    expect(recurRrule({ kind: "daily", interval: 1 }, null)).toBe("FREQ=DAILY");
  });
});

describe("nextOccurrence", () => {
  it("passes an endless rule straight through, unchanged", () => {
    const recur = { kind: "weekly", interval: 1 } as const;
    expect(nextOccurrence(recur, "2026-01-05")).toEqual({
      date: "2026-01-12",
      recur,
    });
  });

  it("an until date is inclusive — the last occurrence may land on it", () => {
    const recur = {
      kind: "daily",
      interval: 1,
      end: { kind: "until", date: "2026-01-08" },
    } satisfies Recur;
    // 2026-01-07 → next day is the 8th, still on the until date.
    expect(nextOccurrence(recur, "2026-01-07")?.date).toBe("2026-01-08");
    // 2026-01-08 → the next day is past it: the series ends here.
    expect(nextOccurrence(recur, "2026-01-08")).toBeNull();
  });

  it("a count counts down through each spawn and stops at the last", () => {
    const recur = { kind: "daily", interval: 1, end: { kind: "count", n: 3 } } satisfies Recur;
    const second = nextOccurrence(recur, "2026-01-01");
    expect(second).toEqual({
      date: "2026-01-02",
      recur: { kind: "daily", interval: 1, end: { kind: "count", n: 2 } },
    });
    const third = second && nextOccurrence(second.recur, second.date);
    expect(third).toEqual({
      date: "2026-01-03",
      recur: { kind: "daily", interval: 1, end: { kind: "count", n: 1 } },
    });
    // n = 1 is the last occurrence: completing it spawns nothing.
    expect(third && nextOccurrence(third.recur, third.date)).toBeNull();
  });
});

describe("normalizeRecur", () => {
  it("gives a legacy bare weekly rule its interval", () => {
    expect(normalizeRecur({ kind: "weekly" } as never)).toEqual({
      kind: "weekly",
      interval: 1,
    });
    expect(normalizeRecur({ kind: "weekly", interval: 3 })).toEqual({
      kind: "weekly",
      interval: 3,
    });
  });

  it("passes everything else through untouched", () => {
    const recur = { kind: "daily", interval: 2, end: { kind: "count", n: 4 } } satisfies Recur;
    expect(normalizeRecur(recur)).toBe(recur);
    expect(normalizeRecur(null)).toBeNull();
  });
});
