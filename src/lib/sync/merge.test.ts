import { describe, expect, it } from "vitest";
import { mergeFocus, CLOCK_TOLERANCE_MS } from "@/lib/sync/merge";
import type { FocusSpan } from "@/lib/focus-spans";

const LIMITS = { minMs: 60_000, maxMs: 8 * 3_600_000 };
const NOW = 1_800_000_000_000;

function span(
  startMin: number,
  endMin: number | null,
  listId: string | null = null
): FocusSpan {
  return {
    start: NOW - startMin * 60_000,
    end: endMin === null ? null : NOW - endMin * 60_000,
    listId,
    minMs: LIMITS.minMs,
  };
}

describe("mergeFocus", () => {
  it("unions both logs by start, closed beats open on the same start", () => {
    const local: FocusSpan[] = [{ ...span(60, null) }];
    const remote: FocusSpan[] = [{ ...span(60, 30) }];
    const merged = mergeFocus(local, remote, LIMITS, NOW);
    expect(merged.spans).toHaveLength(1);
    expect(merged.spans[0].end).not.toBeNull();
    expect(merged.state).toBe("idle");
  });

  it("takes the remote's list on a running stretch the phone assigned", () => {
    const local: FocusSpan[] = [span(60, null, null)];
    const remote: FocusSpan[] = [span(60, null, "list-work")];
    const merged = mergeFocus(local, remote, LIMITS, NOW);
    expect(merged.spans[0].listId).toBe("list-work");
    expect(merged.state).toBe("useful");
  });

  it("takes the remote's list when the phone reassigns it back to none", () => {
    const local: FocusSpan[] = [span(60, null, "list-work")];
    const remote: FocusSpan[] = [span(60, null, null)];
    const merged = mergeFocus(local, remote, LIMITS, NOW);
    expect(merged.spans[0].listId).toBeNull();
  });

  it("keeps the local list on a closed stretch the phone left open", () => {
    const local: FocusSpan[] = [span(60, 30, "list-work")];
    const remote: FocusSpan[] = [span(60, null, "list-home")];
    const merged = mergeFocus(local, remote, LIMITS, NOW);
    expect(merged.spans[0].listId).toBe("list-work");
    expect(merged.spans[0].end).not.toBeNull();
  });

  it("closes an open stretch where a later one begins", () => {
    const local: FocusSpan[] = [span(120, null), span(30, null)];
    const merged = mergeFocus(local, [], LIMITS, NOW);
    expect(merged.spans).toHaveLength(2);
    expect(merged.spans[0].end).toBe(merged.spans[1].start);
    expect(merged.state).toBe("useful");
  });

  it("drops a phantom stretch fully covered by an earlier one", () => {
    const local: FocusSpan[] = [span(120, 10), span(60, 50)];
    const merged = mergeFocus(local, [], LIMITS, NOW);
    expect(merged.spans).toHaveLength(1);
  });

  it("slides a future-dated stretch back to now", () => {
    const remote: FocusSpan[] = [
      {
        start: NOW + CLOCK_TOLERANCE_MS * 2,
        end: null,
        listId: null,
      },
    ];
    const merged = mergeFocus([], remote, LIMITS, NOW);
    expect(merged.spans[0].start).toBeLessThanOrEqual(NOW);
    expect(merged.state).toBe("useful");
  });

  it("drops a closed stretch under its own frozen floor", () => {
    const tooBrief: FocusSpan = {
      start: NOW - 30_000,
      end: NOW,
      listId: null,
      minMs: LIMITS.minMs,
    };
    const merged = mergeFocus([tooBrief], [], LIMITS, NOW);
    expect(merged.spans).toHaveLength(0);
    expect(merged.state).toBe("idle");
  });

  it("caps a forgotten running stretch at the limit", () => {
    const forgotten: FocusSpan = {
      start: NOW - LIMITS.maxMs - 60_000,
      end: null,
      listId: null,
    };
    const merged = mergeFocus([forgotten], [], LIMITS, NOW);
    expect(merged.spans[0].end).toBe(forgotten.start + LIMITS.maxMs);
    expect(merged.state).toBe("idle");
  });

  it("is idempotent — merging a merged log changes nothing", () => {
    const once = mergeFocus([span(120, null), span(30, null)], [], LIMITS, NOW);
    const twice = mergeFocus(once.spans, [], LIMITS, NOW);
    expect(twice).toEqual(once);
  });
});
