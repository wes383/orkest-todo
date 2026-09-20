import { describe, expect, it } from "vitest";
import { overlaps, type FocusSpan } from "@/lib/focus-spans";

/* A fixed base, so the arithmetic is the same wherever the suite runs. Every
   hour below is a quarter, which is exact in binary — no float drift to argue
   about in a comparison that is entirely about edges. */
const BASE = new Date(2026, 8, 13).getTime();
const at = (hours: number) => BASE + hours * 3_600_000;

function closed(from: number, to: number): FocusSpan {
  return { start: at(from), end: at(to), listId: null };
}

describe("overlaps", () => {
  it("lets back-to-back stretches touch", () => {
    const morning = closed(9, 10);
    expect(overlaps(morning, at(10), at(11))).toBe(false);
    expect(overlaps(morning, at(8), at(9))).toBe(false);
  });

  it("catches a stretch running on past the one before it", () => {
    expect(overlaps(closed(9, 10), at(9.5), at(10.5))).toBe(true);
  });

  it("catches a stretch the one before it swallows whole", () => {
    expect(overlaps(closed(9, 10), at(9.25), at(9.75))).toBe(true);
  });

  it("catches a stretch that starts earlier and runs into one", () => {
    expect(overlaps(closed(9, 10), at(8.5), at(9.5))).toBe(true);
  });

  it("catches two stretches claiming the same hour", () => {
    expect(overlaps(closed(9, 10), at(9), at(10))).toBe(true);
  });

  it("measures a running stretch from its start, having no end yet", () => {
    const running: FocusSpan = { start: at(13.5), end: null, listId: null };
    expect(overlaps(running, at(13), at(13.75))).toBe(true);
    expect(overlaps(running, at(12), at(13.5))).toBe(false);
  });
});
