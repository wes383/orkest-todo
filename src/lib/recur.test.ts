import { describe, expect, it } from "vitest";
import { nextDueDate, recurRrule } from "@/lib/recur";

describe("nextDueDate", () => {
  it("daily honours the interval and never drops below one day", () => {
    expect(nextDueDate({ kind: "daily", interval: 3 }, "2026-01-01")).toBe("2026-01-04");
    expect(nextDueDate({ kind: "daily", interval: 0 }, "2026-01-01")).toBe("2026-01-02");
  });

  it("weekly advances by seven days", () => {
    expect(nextDueDate({ kind: "weekly" }, "2026-02-26")).toBe("2026-03-05");
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
    expect(recurRrule({ kind: "weekly" }, "2026-01-05")).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("sorts weekday codes in calendar order", () => {
    expect(recurRrule({ kind: "weekdays", days: [5, 1, 3] }, null)).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    );
  });
});
