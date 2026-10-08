import { MAX_TAG_LENGTH, type Priority } from "@/lib/types";

/**
 * Quick-add syntax. `p1`…`p4` map onto the four priorities, one-based because
 * that is how severity is said out loud ("P1 事故") — p1 is the most urgent.
 * The keys double as the token pattern below, so adding an alias here is the
 * only change needed to make it both parseable and renderable.
 */
export const PRIORITY_ALIAS: Record<string, Priority> = {
  p1: "urgent",
  p2: "high",
  p3: "medium",
  p4: "low",
};

/*
 * The time alternative lists the am/pm forms *before* the bare `HH:mm`: regex
 * alternation is first-match-wins, so the plain form would otherwise eat
 * "10:00" out of "10:00 am" and strand the suffix as text. The lookahead then
 * backtracks into the am/pm alternative, which consumes the whole run. The
 * suffix is spelled as character classes rather than a `/i` flag — a global
 * flag would silently make `P1` a priority token too, a behaviour change this
 * syntax never signed up for.
 */
const TOKEN_PATTERN = new RegExp(
  `(^|\\s)(#[^\\s#]+|${Object.keys(PRIORITY_ALIAS).join("|")}|\\d{1,2}(?::\\d{2})?\\s?[aApP][mM]|\\d{1,2}:\\d{2})(?=\\s|$)`,
  "g"
);

export type QuickToken =
  | { kind: "text"; text: string }
  | { kind: "tag"; text: string; tag: string }
  | { kind: "priority"; text: string; priority: Priority }
  | { kind: "time"; text: string; time: string };

export interface QuickInput {
  title: string;
  tags: string[];
  /** `null` when no `p#` was typed — the caller decides the fallback. */
  priority: Priority | null;
  /** `null` when no time was typed. Always the padded 24-hour `HH:mm` the
      store speaks — 12-hour input (`10am`, `10:00 pm`) is normalised here. */
  time: string | null;
}

/** A standalone clock time — `17:00`, `9:30`, `10am`, `10:00 pm`, `12 AM`. */
const TIME_PATTERN = /^(\d{1,2})(?::(\d{2}))?\s*([aApP][mM])?$/;

/**
 * Any of the spoken time shapes → the padded `HH:mm` the store speaks;
 * anything that was never a real time → `null` (the caller demotes it to
 * plain text rather than clamping it into range).
 *
 * With an am/pm suffix the clock is 12-hour: `1`–`12` only, `13pm` refused.
 * Without one, minutes are required — a bare `10` is a number, not a moment —
 * and the hour may run 0–23.
 */
export function parseTimeToken(raw: string): string | null {
  const m = TIME_PATTERN.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return null;
  const suffix = m[3]?.toLowerCase();
  if (suffix) {
    if (h < 1 || h > 12) return null;
    const hour = (h % 12) + (suffix === "pm" ? 12 : 0);
    return `${`${hour}`.padStart(2, "0")}:${`${min}`.padStart(2, "0")}`;
  }
  if (m[2] === undefined || h > 23) return null;
  return `${`${h}`.padStart(2, "0")}:${`${min}`.padStart(2, "0")}`;
}

/**
 * Splits the raw field into renderable runs.
 *
 * One scan backs both the mirror layer (what the user sees while typing) and
 * `parseQuickInput` (what gets saved), so a token can never *look* recognised
 * and then save as plain text — or the reverse.
 *
 * Boundaries are deliberately strict: a tag needs a non-space, non-`#` body,
 * and `p#` must be a whole word, so `app1`, `文案p2初稿` and `#` on its own all
 * stay plain text until the token is actually finished.
 *
 * Only the **first** `p#` becomes a token. Priority is a single value, so a
 * second one has nothing to apply to — it stays literal text, unpainted, and
 * survives into the title. Rendering it as a chip while saving it as a word
 * would be the one inconsistency this shared scan exists to prevent.
 *
 * Safe against `lastIndex` leakage: only `matchAll` (which clones the regex) is
 * ever run against `TOKEN_PATTERN`.
 */
export function tokenizeQuickInput(raw: string): QuickToken[] {
  const tokens: QuickToken[] = [];
  let cursor = 0;
  let prioritySeen = false;
  let timeSeen = false;

  /**
   * Plain runs are merged rather than emitted one per slice, so a demoted `p#`
   * joins the text around it instead of becoming its own token — otherwise
   * `parseQuickInput`'s `join(" ")` would inject a space that was never typed.
   */
  const pushText = (text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === "text") last.text += text;
    else tokens.push({ kind: "text", text });
  };

  for (const match of raw.matchAll(TOKEN_PATTERN)) {
    // `match[1]` is the leading `^`/whitespace guard — it belongs to the plain
    // run, not to the token, so the token starts after it.
    const start = match.index + match[1].length;
    if (start > cursor) {
      pushText(raw.slice(cursor, start));
    }

    const body = match[2];
    if (body.startsWith("#")) {
      /*
       * An over-long tag demotes to plain text rather than being truncated or
       * silently shortened: both the mirror layer and `parseQuickInput` read
       * this one scan, so a demotion here paints the words as ordinary text
       * *and* saves them into the title — the token never looks accepted and
       * then saves differently, which is the one inconsistency this shared
       * scan exists to prevent.
       */
      if (body.length - 1 > MAX_TAG_LENGTH) {
        pushText(body);
      } else {
        tokens.push({ kind: "tag", text: body, tag: body.slice(1) });
      }
    } else if (/^\d/.test(body)) {
      // A clock time: only a valid one becomes a token, and only the first —
      // the same single-value rule priority follows. `25:00` was never a time,
      // so it stays plain text rather than being silently clamped. The check
      // runs before the prioritySeen demotion: a time and a `p#` are
      // independent values, and typing both is legitimate.
      const time = parseTimeToken(body);
      if (time === null || timeSeen) {
        pushText(body);
      } else {
        timeSeen = true;
        tokens.push({ kind: "time", text: body, time });
      }
    } else if (prioritySeen) {
      pushText(body);
    } else {
      prioritySeen = true;
      tokens.push({ kind: "priority", text: body, priority: PRIORITY_ALIAS[body] });
    }
    cursor = start + body.length;
  }

  if (cursor < raw.length) {
    pushText(raw.slice(cursor));
  }
  return tokens;
}

/**
 * `买牛奶 #日用品 p1` → `{ title: "买牛奶", tags: ["日用品"], priority: "urgent" }`.
 * Tokens are removed from the title and whitespace is normalised. The first
 * `p#` wins; any later one was never tokenised, so it stays in the title as
 * ordinary words — same rule the mirror layer paints with.
 */
export function parseQuickInput(raw: string): QuickInput {
  const tags: string[] = [];
  const plain: string[] = [];
  let priority: Priority | null = null;
  let time: string | null = null;

  for (const token of tokenizeQuickInput(raw)) {
    switch (token.kind) {
      case "text":
        plain.push(token.text);
        break;
      case "tag":
        if (!tags.includes(token.tag)) tags.push(token.tag);
        break;
      case "priority":
        if (priority === null) priority = token.priority;
        break;
      case "time":
        if (time === null) time = token.time;
        break;
    }
  }

  return {
    title: plain.join(" ").replace(/\s+/g, " ").trim(),
    tags,
    priority,
    time,
  };
}
