/**
 * Turns URLs inside free text into links — task notes being the one place a
 * user pastes a ticket, a doc, a reference. Kept as a pure function returning
 * segments so the renderer (a React component) and the tests stay trivial.
 *
 * Rules, in order:
 *  1. `http://` / `https://` and bare `www.` are links; nothing else is —
 *     `file://` and custom schemes are refused, because the renderer opens
 *     matches in the system browser and those two schemes are the only ones a
 *     browser can be trusted with.
 *  2. A match stops at whitespace; balanced `() []` pairs are kept (issue
 *     trackers love them), trailing punctuation that nobody means as part of
 *     the address — `. , ; : ! ?` and an unmatched closer — is split back off.
 *  3. The display text is the address itself. Notes are short; rewriting the
 *     label would only hide where the link goes.
 */

export type LinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/** Closers we keep only when the address opened them. */
const PAIRS: Record<string, string> = { ")": "(", "]": "[" };

/** Trailing characters that are sentence punctuation, not address. */
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "…"]);

function splitTail(raw: string): { href: string; tail: string } {
  let href = raw;
  let tail = "";
  for (;;) {
    const last = href[href.length - 1];
    if (last === undefined) break;
    if (TRAILING.has(last)) {
      tail = last + tail;
      href = href.slice(0, -1);
      continue;
    }
    const opener = PAIRS[last];
    if (opener !== undefined) {
      // Keep a balanced closer (wikipedia-style), drop an unmatched one.
      let balance = 0;
      for (const ch of href) {
        if (ch === opener) balance += 1;
        else if (ch === last) balance -= 1;
      }
      if (balance < 0) {
        tail = last + tail;
        href = href.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return { href, tail };
}

export function linkify(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index;
    if (index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, index) });
    }
    const { href, tail } = splitTail(match[0]);
    if (href.length > 0) {
      segments.push({
        kind: "link",
        text: href,
        href: href.startsWith("www.") ? `https://${href}` : href,
      });
    }
    if (tail.length > 0) segments.push({ kind: "text", text: tail });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}
