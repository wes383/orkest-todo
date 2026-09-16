import type { Priority } from "@/lib/types";

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

const TOKEN_PATTERN = new RegExp(
  `(^|\\s)(#[^\\s#]+|${Object.keys(PRIORITY_ALIAS).join("|")})(?=\\s|$)`,
  "g"
);

export type QuickToken =
  | { kind: "text"; text: string }
  | { kind: "tag"; text: string; tag: string }
  | { kind: "priority"; text: string; priority: Priority };

export interface QuickInput {
  title: string;
  tags: string[];
  /** `null` when no `p#` was typed — the caller decides the fallback. */
  priority: Priority | null;
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
      tokens.push({ kind: "tag", text: body, tag: body.slice(1) });
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
    }
  }

  return {
    title: plain.join(" ").replace(/\s+/g, " ").trim(),
    tags,
    priority,
  };
}
