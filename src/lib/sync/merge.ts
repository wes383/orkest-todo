/**
 * Merging the focus log across devices — the one place two logs become one.
 *
 * The log is append-only by `start`, and a stretch is identified by the moment
 * it opened, so the union of two logs is a union by that key. What needs care
 * is disagreement: two devices that both believed the switch was theirs.
 *
 * The rules, in the order the merge applies them:
 *
 *  0. No stretch reaches into the future — a device whose clock is ahead has
 *     its stretch slid back into the past first; see `unbendFuture`.
 *  1. Same `start` on both sides: a closed record beats an open one (a close
 *     is newer information than an open), and otherwise the local record wins
 *     — the desktop is the keeper of the log, and its edits are the ones the
 *     phone never makes.
 *  2. An open stretch followed by a later stretch: the later action is the
 *     deliberate one, so the older stretch closes where the newer began —
 *     continuous history, no double-counted time. If it was open for less
 *     than the floor, it is dropped, exactly as a failed write is at load.
 *  3. A closed stretch that already covers the moment a later one starts:
 *     the later one shifts to where the earlier ends. Time already claimed
 *     is not claimed twice; a shifted stretch left with no length is a
 *     phantom (a start pressed on stale information) and is dropped.
 *  4. A still-open tail past the cap closes at the cap — the same rule the
 *     desktop's `load` applies to a forgotten session.
 *  5. Brief closed stretches are dropped by their own frozen floor, the same
 *     `dropBriefSpans` the store runs.
 *
 * The state is then *derived* from the tail: useful if and only if the newest
 * stretch is still open. Both sides always write the stretch and the switch
 * together, so the tail is the ground truth, and deriving it makes the merge
 * idempotent — merging a merged log changes nothing.
 */

import type { FocusSpan } from "@/lib/focus-spans";
import type { FocusState } from "@/lib/focus-store";

/** The rules a merged log is judged by, handed in so this module stays pure. */
export interface MergeLimits {
  minMs: number;
  maxMs: number;
}

/** Drops the stretches too brief to count — the same rule the store runs on
    its own log: a closed span is judged by its own frozen floor, a span the
    floor never reached (no `minMs`) is history and stays, and a running span
    has not been judged yet. */
export function dropBriefSpans(spans: FocusSpan[]): FocusSpan[] {
  return spans.filter(
    (span) =>
      span.end === null ||
      span.minMs === undefined ||
      span.end - span.start >= span.minMs
  );
}

/** How far past `now` a stretch may reach before its clock is disbelieved —
    the pull's own delay, plus room for ordinary jitter. */
export const CLOCK_TOLERANCE_MS = 60_000;

/**
 * Rule 0: nothing reaches into the future. A device whose clock is ahead —
 * a phone that never reached an NTP server, typically — records a start that
 * has not happened yet, and the damage is not the mistimed stretch itself but
 * the *running* one the merge would then close at that future moment: hours
 * of focus that nobody spent. Every over-reaching stretch is slid back so it
 * ends at `now` (a running one so it starts there), which keeps the length
 * the device measured and puts it where it could plausibly have happened.
 *
 * Sliding moves a `start`, so the corrected stretch leaves as a different row
 * and the mistimed one is deleted in the same cycle — the cloud heals to the
 * merged truth like everything else.
 *
 * A clock running *behind* cannot be caught here: an early start is
 * indistinguishable from a device that really did start earlier.
 */
function unbendFuture(remote: FocusSpan[], now: number): FocusSpan[] {
  const limit = now + CLOCK_TOLERANCE_MS;
  return remote.map((span) => {
    const reach = span.end ?? span.start;
    if (reach <= limit) return span;
    const shift = reach - now;
    return {
      ...span,
      start: span.start - shift,
      end: span.end === null ? null : span.end - shift,
    };
  });
}

/** The union of two logs, by `start`. */
function unionSpans(local: FocusSpan[], remote: FocusSpan[]): FocusSpan[] {
  const byStart = new Map<number, FocusSpan>();
  for (const span of remote) byStart.set(span.start, span);
  for (const span of local) {
    const existing = byStart.get(span.start);
    // Keep the remote record only when it is closed and ours is open: that is
    // the phone having stopped the session the desktop still believes is
    // running. Every other disagreement resolves to the local record.
    if (existing === undefined || !(existing.end !== null && span.end === null)) {
      byStart.set(span.start, span);
    }
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

/** Settles overlaps between consecutive stretches (rules 2 and 3 above). */
function resolveOverlaps(
  spans: FocusSpan[],
  limits: MergeLimits
): FocusSpan[] {
  const out: FocusSpan[] = [];
  for (const span of spans) {
    const prev = out[out.length - 1];
    if (prev === undefined) {
      out.push(span);
    } else if (prev.end === null) {
      // An open stretch with a successor: close it where the successor began,
      // or drop it if that leaves less than the floor.
      if (span.start - prev.start < limits.minMs) {
        out.pop();
      } else {
        out[out.length - 1] = { ...prev, end: span.start, minMs: limits.minMs };
      }
      out.push(span);
    } else if (span.start < prev.end) {
      // Time the previous stretch already covers: start after it ends, and a
      // stretch left with no length of its own is dropped.
      const shifted = { ...span, start: prev.end };
      if (shifted.end === null || shifted.end > shifted.start) out.push(shifted);
    } else {
      out.push(span);
    }
  }
  return out;
}

/**
 * The merge itself. `local` and `remote` are the two logs; the answer is the
 * one log both sides should hold, with the state the tail says it is in.
 */
export function mergeFocus(
  local: FocusSpan[],
  remote: FocusSpan[],
  limits: MergeLimits,
  now: number
): { state: FocusState; spans: FocusSpan[] } {
  let spans = dropBriefSpans(
    resolveOverlaps(unionSpans(local, unbendFuture(remote, now)), limits)
  );

  // A tail still open past the cap ended itself while nobody was watching —
  // the same close `load` makes, judged under the rules as they stand.
  const newest = spans[spans.length - 1];
  if (
    newest !== undefined &&
    newest.end === null &&
    now - newest.start >= limits.maxMs
  ) {
    spans = [
      ...spans.slice(0, -1),
      { ...newest, end: newest.start + limits.maxMs, minMs: limits.minMs },
    ];
  }

  const state: FocusState =
    spans[spans.length - 1]?.end === null ? "useful" : "idle";
  return { state, spans };
}
