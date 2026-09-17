/**
 * The milestones: what the log adds up to, read as things worth reaching.
 *
 * Ported from Pivot (`pivot/app/achievements.ts`), which is the reference for
 * this feature. Every one of them is worked out from the stretches themselves,
 * on every open — none of them is stored. A trophy pinned to storage would
 * outlive the correction that took the achievement away, and the panel would
 * then be telling two stories about the same day. Read this way, the milestones
 * follow the log wherever it is edited, and there is nothing to migrate.
 *
 * The wording is the one thing that is not the original's: a milestone carries
 * message keys and their variables rather than finished sentences, because this
 * app prints in two languages. The rules themselves are unchanged.
 */

import {
  cappedEnd,
  clockLabel,
  dayBounds,
  dayRuns,
  daysAscending,
  daysStillOnAt,
  duration,
  hourName,
  startOfDay,
  startOfWeek,
  switchTimes,
  type DayBucket,
  type FocusSpan,
} from "@/lib/focus-spans";
import type { Language, MessageKey, MessageVars } from "@/lib/messages";

/** One thing to reach for. */
export interface Milestone {
  id: string;
  /** The unit it is drawn in. Never printed — the panel shows one flat run of
      cards, and the group only says how a card is walked. */
  group: string;
  nameKey: MessageKey;
  nameVars?: MessageVars;
  /** What it takes, said in full. Read aloud, never printed. */
  goalKey: MessageKey;
  goalVars?: MessageVars;
  /** What it takes in a few words, printed under the name. A rung whose name
      already carries the whole rule — `3-day streak`, `5 h logged` — goes
      without one. */
  ruleKey?: MessageKey;
  ruleVars?: MessageVars;
  /** The day it was reached, printed as a date. `null` when there is no date to
      print — either because it has not been reached, or because topping a
      ladder is worth a live figure rather than the day it happened. */
  reachedAt: number | null;
  /** The line under the name when there is no date: how far along it is, or the
      figure a topped-out ladder reports. Nothing is printed without one. */
  detailKey?: MessageKey;
  detailVars?: MessageVars;
  /** 0 to 1 — how much of the ring above the name is drawn. */
  progress: number;
  reached: boolean;
}

/** A unit of the board. Most hold one card; a ladder holds a run of rungs the
    panel walks through instead of laying them all out at once. */
export interface MilestoneGroup {
  group: string;
  items: Milestone[];
  /** Rungs of one climb, each a step past the last, shown one at a time. */
  ladder: boolean;
}

const HOUR = 3_600_000;

/** Past this many moves of the switch in one day, the day is a warning rather
    than a triumph — and the milestone says so. */
const FIDGETY = 30;

/** The share of a day that counts as a day well spent. */
const RICH_DAY = 0.45;

/** The same share as the whole number a card prints. Held here so the spoken
    `goal` and the line under the board are written from one figure — and
    exported, because that line under the board is rendered by the panel, which
    must not restate the threshold as a second literal that could drift. */
export const RICH_PCT = Math.round(RICH_DAY * 100);

/** The two hours the owl and the lark are named after. */
const EARLY_HOUR = 7;
const LATE_HOUR = 23;

const STREAKS = [3, 7, 14, 30, 60, 180, 360, 720, 1000];
const STRETCHES = [15 * 60_000, HOUR, 3 * HOUR, 5 * HOUR];
const TOTALS = [
  HOUR,
  24 * HOUR,
  100 * HOUR,
  250 * HOUR,
  500 * HOUR,
  1000 * HOUR,
  2000 * HOUR,
  5000 * HOUR,
];
/** The days that gave better than their share to useful time, counted up rather
    than run together. One perfect day is not a climb of one — but the days it
    happened on are a tally, and a tally is climbed like any other. */
const PERFECT_DAYS = [1, 3, 7, 14, 30, 60, 100, 200, 360, 500, 720, 1000];

/** What makes a day perfect, said once under the whole board: the ladder counts
    the days and never says what one had to be. */
export const PERFECT_DAY_RULE_KEY: MessageKey = "focus.ms.perfect.rule";

/** The longest a stretch can be and still count as a flash: the record for
    getting in and out fast. Nothing shorter than the reader's minimum span can
    turn up here — a stretch that brief is dropped before it is ever written
    down — so the band this record is set in runs from the minimum to ten
    minutes. */
const FLASH_MS = 10 * 60_000;

/** A fortress is a day whose hours stand up on their own: fewer moves of the
    switch than `FORTRESS_MOVES`, and more useful time than `FORTRESS_MS`. */
const FORTRESS_MOVES = 3;
const FORTRESS_MS = 5 * HOUR;

/** The gap between two stretches that still reads as coming straight back. */
const RETURN_MS = 10 * 60_000;

/** How many moves of the switch, all told. */
const SWITCHES = [100, 1000, 10_000];

const START = "start";
const STREAK = "streak";
const FOCUS = "focus";
const LOGGED = "logged";
/** The tallies of moves, which climb like any other ladder. */
const MOVES = "moves";
/** The ones that stand on their own instead of climbing anything: one day at its
    most extreme, one stretch at its briefest, one week's weekend against its
    weekdays. Each heads a group of one, so the panel lays it out as a card of
    its own rather than a rung that would read as a false step. */
const FLASH = "flash";
const FORTRESS = "fortress";
const WEEKEND = "weekend";
const MIDNIGHT = "midnight";
const SEAMLESS = "seamless";
const FIDGET = "fidget";
const PERFECT = "perfect";

/** How much of a ring is drawn. Never quite full unless the thing was reached:
    the last sliver is the whole difference between "nearly" and "there". */
function toward(value: number, target: number, reached: boolean): number {
  return reached ? 1 : Math.min(0.98, value / target);
}

export function milestones(
  spans: FocusSpan[],
  buckets: Map<number, DayBucket>,
  now: number,
  lang: Language
): MilestoneGroup[] {
  const days = daysAscending(buckets);
  const runs = dayRuns(buckets);

  let longestRun = 0;
  for (const run of runs) if (run.length > longestRun) longestRun = run.length;

  let total = 0;
  let busiest = 0;
  /** The days that went better than their share, oldest first — the tally the
      `Perfect day` ladder counts, and the days it hands out as dates. */
  const rich: number[] = [];
  for (const day of days) {
    const bucket = buckets.get(day);
    if (bucket === undefined) continue;
    total += bucket.useful;
    if (bucket.switches > busiest) busiest = bucket.switches;
    const [from, to] = dayBounds(day);
    if (bucket.useful / (to - from) > RICH_DAY) rich.push(day);
  }

  let longestStretch = 0;
  for (const span of spans) {
    const ms = cappedEnd(span, now) - span.start;
    if (ms > longestStretch) longestStretch = ms;
  }

  /** Every move of the switch, filed by the day that counts it — the same
      events the daily tallies are built from, read a second way. */
  const switchLog = switchTimes(spans, now);

  /** The day a run of `target` days first ran out. The runs are oldest first, so
      the first one long enough is also the one reached first. */
  const streakDay = (target: number): number | null => {
    for (const run of runs) if (run.length >= target) return run[target - 1];
    return null;
  };

  /** The day the log first held a single stretch that long. */
  const stretchDay = (target: number): number | null => {
    for (const span of spans) {
      if (cappedEnd(span, now) - span.start >= target) {
        return startOfDay(span.start);
      }
    }
    return null;
  };

  /** The day the running total first reached `target`. */
  const totalDay = (target: number): number | null => {
    let sum = 0;
    for (const day of days) {
      sum += buckets.get(day)?.useful ?? 0;
      if (sum >= target) return day;
    }
    return null;
  };

  /** The first day that began before 7 am. */
  const earlyDay = (): number | null => {
    let earliest: number | null = null;
    for (const [day, list] of switchLog) {
      const first = list.find((move) => move.into);
      if (first === undefined) continue;
      if (new Date(first.at).getHours() >= EARLY_HOUR) continue;
      if (earliest === null || day < earliest) earliest = day;
    }
    return earliest;
  };

  /** The first day the switch was still on after 11 pm. */
  const lateDay = (): number | null => {
    let earliest: number | null = null;
    for (const day of daysStillOnAt(spans, now, LATE_HOUR)) {
      if (earliest === null || day < earliest) earliest = day;
    }
    return earliest;
  };

  /** The first day whose tally of moves ran past the fidgety line. */
  const fidgetDay = (): number | null => {
    for (const day of days) {
      if ((buckets.get(day)?.switches ?? 0) > FIDGETY) return day;
    }
    return null;
  };

  /** The day the tally reached `target` perfect days, or null while it is still
      short of it. */
  const richDay = (target: number): number | null => rich[target - 1] ?? null;

  /** Every move of the switch the log holds, added up. */
  let totalMoves = 0;
  for (const list of switchLog.values()) totalMoves += list.length;

  /** The day the running tally of moves first reached `target`. Read off the
      same moves the daily counts are built from, so "how many moves" and "how
      many moves a day" can never disagree. */
  const switchDay = (target: number): number | null => {
    let sum = 0;
    for (const day of days) {
      sum += switchLog.get(day)?.length ?? 0;
      if (sum >= target) return day;
    }
    return null;
  };

  /** The shortest finished stretch in the log, and the day it was run on. A
      stretch still running has no length to be judged by — it would be the
      shortest thing in the log a minute in and an ordinary one an hour later —
      so only the finished ones are read here. */
  let shortest = Infinity;
  let shortestDay: number | null = null;
  /** The first stretch brief enough to count as a flash. */
  let flash: number | null = null;
  /** The first stretch that ran over midnight. */
  let midnight: number | null = null;
  /** The narrowest gap left between one stretch and the next. */
  let closest: number | null = null;
  /** The day the switch first came straight back to useful. */
  let seam: number | null = null;

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    const next = spans[i + 1];
    if (span === undefined) continue;

    if (span.end !== null) {
      const ms = span.end - span.start;
      if (ms < shortest) {
        shortest = ms;
        shortestDay = startOfDay(span.start);
      }
      if (ms <= FLASH_MS && flash === null) flash = startOfDay(span.start);
      if (next !== undefined) {
        const gap = next.start - span.end;
        if (gap >= 0 && (closest === null || gap < closest)) closest = gap;
        // Dated by the moment it came back rather than the one it left: the
        // return is the thing the milestone is about.
        if (gap >= 0 && gap <= RETURN_MS && seam === null) {
          seam = startOfDay(next.start);
        }
      }
    }

    // Midnight is read off `cappedEnd` rather than the raw end, so a stretch
    // still running is judged by the length it can still reach rather than by
    // whatever the clock says while the panel happens to be open.
    if (startOfDay(span.start) !== startOfDay(cappedEnd(span, now))) {
      if (midnight === null) midnight = startOfDay(span.start);
    }
  }

  /** The day the fortress was first built on, and — while it is still unbuilt —
      the day that has come closest to being one.

      Two halves have to hold at once, and the card can only show one figure, so
      the day held up is the longest one that kept the switch under the line.
      That is the half hardest to reach: an hour is easy to add, but a day with
      one stretch in it and nothing else is a day lived rather than arranged. */
  let fortress: number | null = null;
  let calm = 0;
  let calmDay: number | null = null;
  let fullest = 0;
  let fullestDay: number | null = null;

  for (const day of days) {
    const bucket = buckets.get(day);
    if (bucket === undefined) continue;
    const quiet = bucket.switches < FORTRESS_MOVES;
    if (quiet && bucket.useful > calm) {
      calm = bucket.useful;
      calmDay = day;
    }
    if (bucket.useful > fullest) {
      fullest = bucket.useful;
      fullestDay = day;
    }
    if (fortress === null && quiet && bucket.useful > FORTRESS_MS) {
      fortress = day;
    }
  }

  const nearDay = calmDay ?? fullestDay;
  const nearUseful = calmDay === null ? fullest : calm;
  const nearMoves = nearDay === null ? 0 : buckets.get(nearDay)?.switches ?? 0;

  /** How near the fortress is, counting both halves: the hours are measured
      against their target and the moves against theirs, and the smaller of the
      two is what the ring shows. A day is only as close as its worse half. */
  const fortressScore =
    fortress !== null
      ? 1
      : Math.min(
          nearUseful / FORTRESS_MS,
          Math.min(1, (FORTRESS_MOVES - 1) / Math.max(nearMoves, 1))
        );

  /** The share of a day that went to useful time. */
  const shareOn = (day: number): number => {
    const bucket = buckets.get(day);
    if (bucket === undefined) return 0;
    const [from, to] = dayBounds(day);
    return bucket.useful / (to - from);
  };

  /** The best a weekday managed in each week — the mark a weekend day has to
      beat. Drawn week by week rather than across the whole log, because the
      milestone is a weekend outworking its own week; every week is a fresh
      contest, and one strong week does not set the bar for a quiet one. */
  const weekdays = new Map<number, number>();
  for (const day of days) {
    const dow = new Date(day).getDay();
    if (dow === 0 || dow === 6) continue;
    const week = startOfWeek(day);
    const share = shareOn(day);
    if (share > (weekdays.get(week) ?? 0)) weekdays.set(week, share);
  }

  /** The first weekend day to outdo every weekday of its own week, and — while
      none has — how close the best of them came. A week with no weekday in the
      log leaves nothing to beat, so a weekend day with any useful time on it
      clears it. */
  let weekend: number | null = null;
  let weekendNear = 0;
  for (const day of days) {
    const dow = new Date(day).getDay();
    if (dow !== 0 && dow !== 6) continue;
    const against = weekdays.get(startOfWeek(day)) ?? 0;
    const share = shareOn(day);
    if (share > against) {
      if (weekend === null || day < weekend) weekend = day;
    } else if (against > 0) {
      const ratio = share / against;
      if (ratio > weekendNear) weekendNear = ratio;
    }
  }

  /** The clock the switch was last kept on, and the distance that picks it.
      Measured around the dial rather than across it — three in the morning is
      late, not early — so the hour nearest midnight wins, whichever side of it
      that hour sits on. */
  let nearestMidnight = Infinity;
  let latestClock = "";

  for (const span of spans) {
    const end = cappedEnd(span, now);
    const [from, to] = dayBounds(end);
    const across = end - from;
    const distance = Math.min(across, to - from - across);
    if (distance < nearestMidnight) {
      nearestMidnight = distance;
      latestClock = clockLabel(end, lang);
    }
  }

  const opened = spans[0];
  const openedAt = opened === undefined ? null : startOfDay(opened.start);
  const early = earlyDay();
  const late = lateDay();
  const fidget = fidgetDay();

  const starting: Milestone[] = [
    {
      id: "first-step",
      group: START,
      nameKey: "focus.ms.firstStep.name",
      goalKey: "focus.ms.firstStep.goal",
      ruleKey: "focus.ms.firstStep.rule",
      reachedAt: openedAt,
      progress: openedAt === null ? 0 : 1,
      reached: openedAt !== null,
    },
    {
      id: "early-bird",
      group: START,
      nameKey: "focus.ms.early.name",
      goalKey: "focus.ms.early.goal",
      goalVars: { hour: hourName(EARLY_HOUR, lang) },
      ruleKey: "focus.ms.early.rule",
      ruleVars: { hour: hourName(EARLY_HOUR, lang) },
      reachedAt: early,
      progress: early === null ? 0 : 1,
      reached: early !== null,
    },
    {
      id: "night-owl",
      group: START,
      nameKey: "focus.ms.late.name",
      goalKey: "focus.ms.late.goal",
      goalVars: { hour: hourName(LATE_HOUR, lang) },
      ruleKey: "focus.ms.late.rule",
      ruleVars: { hour: hourName(LATE_HOUR, lang) },
      reachedAt: late,
      progress: late === null ? 0 : 1,
      reached: late !== null,
    },
  ];

  /** The rung that tops a ladder keeps a live figure once it has been reached:
      what the log holds now, instead of the day it was topped. A rung with
      nothing left above it has nothing to report but the climb behind it, and
      the date it was reached is the one thing about it that stops being
      interesting a day later.

      The stretch ladder is left out of this on purpose: the figure a climb of
      stretches is really about is the longest stretch, and `Personal best`
      already prints that one in full, date and all. */
  const streaks: Milestone[] = STREAKS.map((target, index) => {
    const at = streakDay(target);
    const top = at !== null && index === STREAKS.length - 1;
    // Typed rather than left to inference: a ternary of two object literals is
    // unioned with the keys only one of them has present-but-undefined, and
    // `MessageVars` — an index signature of real values — will not take that.
    // The annotation checks each branch against the shape instead.
    const detailVars: MessageVars = top
      ? { have: longestRun }
      : { have: longestRun, target };
    return {
      id: `streak-${target}`,
      group: STREAK,
      nameKey: "focus.ms.streak.name",
      nameVars: { n: target },
      goalKey: "focus.ms.streak.goal",
      goalVars: { n: target },
      reachedAt: top ? null : at,
      detailKey: top ? "focus.ms.streak.top" : "focus.ms.streak.detail",
      detailVars,
      progress: toward(longestRun, target, at !== null),
      reached: at !== null,
    };
  });

  const stretches: Milestone[] = STRETCHES.map((target) => {
    const at = stretchDay(target);
    const value = duration(target, lang);
    return {
      id: `stretch-${target}`,
      group: FOCUS,
      nameKey: "focus.ms.stretch.name",
      nameVars: { value },
      goalKey: "focus.ms.stretch.goal",
      goalVars: { value },
      reachedAt: at,
      detailKey: "focus.ms.of",
      detailVars: {
        have: duration(longestStretch, lang),
        target: value,
      },
      progress: toward(longestStretch, target, at !== null),
      reached: at !== null,
    };
  });

  const totals: Milestone[] = TOTALS.map((target, index) => {
    const at = totalDay(target);
    // The tally tops out the same way the long ladder does: once the last rung
    // is underfoot the line reports what has been logged, not the day it was.
    const top = at !== null && index === TOTALS.length - 1;
    const value = duration(target, lang);
    const detailVars: MessageVars = top
      ? { value: duration(total, lang) }
      : { have: duration(total, lang), target: value };
    return {
      id: `total-${target}`,
      group: LOGGED,
      nameKey: "focus.ms.totals.name",
      nameVars: { value },
      goalKey: "focus.ms.totals.goal",
      goalVars: { value },
      reachedAt: top ? null : at,
      detailKey: top ? "focus.ms.totals.top" : "focus.ms.of",
      detailVars,
      progress: toward(total, target, at !== null),
      reached: at !== null,
    };
  });

  const perfect: Milestone[] = PERFECT_DAYS.map((target, index) => {
    const at = richDay(target);
    // Topped out, the ladder reports the tally itself — see the note on `top`
    // above the long ladder.
    const top = at !== null && index === PERFECT_DAYS.length - 1;
    const detailVars: MessageVars = top
      ? { n: rich.length }
      : { have: rich.length, target };
    return {
      id: `perfect-${target}`,
      group: PERFECT,
      nameKey:
        target === 1 ? "focus.ms.perfect.name" : "focus.ms.perfect.namePlural",
      nameVars: { n: target },
      goalKey: "focus.ms.perfect.goal",
      goalVars: { pct: RICH_PCT, days: target },
      reachedAt: top ? null : at,
      detailKey: top ? "focus.ms.perfect.top" : "focus.ms.of",
      detailVars,
      progress: toward(rich.length, target, at !== null),
      reached: at !== null,
    };
  });

  /** The moves of the switch, tallied up the way the hours are: a climb, one
      rung at a time. `Switch-happy` reads the same events for a single day and
      has nowhere to climb, so it stands on its own at the end of the board. */
  const switches: Milestone[] = SWITCHES.map((target, index) => {
    const at = switchDay(target);
    // Topped out, the ladder reports the tally itself — see the note on `top`
    // above the long ladder.
    const top = at !== null && index === SWITCHES.length - 1;
    const detailVars: MessageVars = top
      ? { n: totalMoves }
      : { have: totalMoves, target };
    return {
      id: `moves-${target}`,
      group: MOVES,
      nameKey: "focus.ms.moves.name",
      nameVars: { n: target },
      goalKey: "focus.ms.moves.goal",
      goalVars: { n: target },
      reachedAt: top ? null : at,
      detailKey: top ? "focus.ms.moves.top" : "focus.ms.of",
      detailVars,
      progress: toward(totalMoves, target, at !== null),
      reached: at !== null,
    };
  });

  /** In and out inside ten minutes: the record for the briefest stretch, and the
      one reading on the board that a *smaller* figure wins. */
  const flashy: Milestone = {
    id: "flash",
    group: FLASH,
    nameKey: "focus.ms.flash.name",
    goalKey: "focus.ms.flash.goal",
    goalVars: { value: duration(FLASH_MS, lang) },
    ruleKey: "focus.ms.flash.rule",
    ruleVars: { value: duration(FLASH_MS, lang) },
    reachedAt: flash,
    // The line is dropped entirely until there is a record to read: a label with
    // nothing after it is worse than no label.
    detailKey: shortestDay === null ? undefined : "focus.ms.flash.detail",
    detailVars:
      shortestDay === null ? undefined : { value: duration(shortest, lang) },
    progress:
      flash !== null
        ? 1
        : Math.min(0.98, FLASH_MS / Math.max(shortest, FLASH_MS + 1)),
    reached: flash !== null,
  };

  /** A long day the switch barely touched. The line under the name holds up the
      day that has come closest, moving and all, so a reader can see which half
      of the rule is the one still missing. */
  const bastion: Milestone = {
    id: "fortress",
    group: FORTRESS,
    nameKey: "focus.ms.fortress.name",
    goalKey: "focus.ms.fortress.goal",
    goalVars: { value: duration(FORTRESS_MS, lang), moves: FORTRESS_MOVES },
    ruleKey: "focus.ms.fortress.rule",
    ruleVars: { value: duration(FORTRESS_MS, lang), moves: FORTRESS_MOVES },
    reachedAt: fortress,
    detailKey: "focus.ms.fortress.detail",
    detailVars: { moves: nearMoves, value: duration(nearUseful, lang) },
    progress: fortressScore,
    reached: fortress !== null,
  };

  /** A weekend day that outdid the week it belongs to. The line under the name
      reads how close one has come as a share of the weekday mark it has to
      beat. */
  const warrior: Milestone = {
    id: "weekend-warrior",
    group: WEEKEND,
    nameKey: "focus.ms.weekend.name",
    goalKey: "focus.ms.weekend.goal",
    ruleKey: "focus.ms.weekend.rule",
    reachedAt: weekend,
    detailKey: "focus.ms.weekend.detail",
    detailVars: { pct: Math.round(weekendNear * 100) },
    progress: toward(weekendNear, 1, weekend !== null),
    reached: weekend !== null,
  };

  /** A stretch that ran over the line of midnight. The line under the name is
      the latest the switch has ever been kept on, named by its clock. */
  const overnight: Milestone = {
    id: "across-midnight",
    group: MIDNIGHT,
    nameKey: "focus.ms.midnight.name",
    goalKey: "focus.ms.midnight.goal",
    ruleKey: "focus.ms.midnight.rule",
    reachedAt: midnight,
    detailKey: "focus.ms.midnight.detail",
    detailVars: { time: latestClock },
    // Nothing is ever half-crossed: a stretch either ran over the line or it did
    // not, so the ring stays empty until one does.
    progress: midnight !== null ? 1 : 0,
    reached: midnight !== null,
  };

  /** Leaving and coming straight back. */
  const seamless: Milestone = {
    id: "seamless",
    group: SEAMLESS,
    nameKey: "focus.ms.seamless.name",
    goalKey: "focus.ms.seamless.goal",
    goalVars: { value: duration(RETURN_MS, lang) },
    ruleKey: "focus.ms.seamless.rule",
    ruleVars: { value: duration(RETURN_MS, lang) },
    reachedAt: seam,
    progress:
      closest !== null && closest <= RETURN_MS
        ? 1
        : Math.min(
            0.98,
            RETURN_MS / Math.max(closest ?? Infinity, RETURN_MS + 1)
          ),
    reached: closest !== null && closest <= RETURN_MS,
  };

  /** Not a step past the last one: a busier day is not a larger focus, not more
      hours logged and not another perfect day. It stands on its own, next to the
      ladders it would otherwise have been tacked onto. */
  const fidgety: Milestone = {
    id: "switch-happy",
    group: FIDGET,
    nameKey: "focus.ms.fidget.name",
    goalKey: "focus.ms.fidget.goal",
    goalVars: { n: FIDGETY },
    ruleKey: "focus.ms.fidget.rule",
    ruleVars: { n: FIDGETY },
    reachedAt: fidget,
    detailKey: "focus.ms.fidget.detail",
    detailVars: { n: busiest },
    progress: toward(busiest, FIDGETY + 1, fidget !== null),
    reached: fidget !== null,
  };

  // The order of the board is the order it is read in: the ladders are walked
  // first, then the cards that stand on their own. Switch-happy closes it — it
  // reads the same moves the tally does, one day at a time.
  return [
    { group: START, items: starting, ladder: false },
    { group: STREAK, items: streaks, ladder: true },
    { group: FOCUS, items: stretches, ladder: true },
    { group: LOGGED, items: totals, ladder: true },
    { group: MOVES, items: switches, ladder: true },
    { group: PERFECT, items: perfect, ladder: true },
    { group: FLASH, items: [flashy], ladder: false },
    { group: FORTRESS, items: [bastion], ladder: false },
    { group: WEEKEND, items: [warrior], ladder: false },
    { group: MIDNIGHT, items: [overnight], ladder: false },
    { group: SEAMLESS, items: [seamless], ladder: false },
    { group: FIDGET, items: [fidgety], ladder: false },
  ];
}
