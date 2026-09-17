/**
 * The focus log, out.
 *
 * One row a stretch, which is all the log actually holds — every figure in the
 * panel is derived from these rows, so this file is the complete history rather
 * than a summary of it. Nothing is recomputed and nothing is capped: a stretch
 * the log says ran nine hours is written as nine hours.
 *
 * The list is the one column Pivot had no equivalent of. It is written as a name
 * rather than an id, because the file is meant to be read by a person or a
 * spreadsheet, and it is the *current* name — a list renamed after the fact
 * exports under the name it wears now, which is what someone sorting the file
 * would expect to find in it.
 */

import { exportRow, type FocusSpan } from "@/lib/focus-spans";
import type { Language } from "@/lib/messages";

const HEADER = "start,end,minutes,list";

/**
 * One field, quoted if it has to be.
 *
 * The timestamps and the figures never need this; a list name does, and it is
 * the one column a person typed. A name holding a comma would otherwise split
 * into two columns, and one holding a quote would end the field early — so the
 * RFC's own rule is applied: wrap in quotes, and double every quote inside.
 */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The whole log as CSV, oldest first, with each row's list named.
    `nameOf` resolves a list id — the sheet hands in the same lookup its rows
    use, so the two can never print different names for one list. */
export function csvOf(
  spans: FocusSpan[],
  nameOf: (listId: string | null) => string | null,
  lang: Language
): string {
  const rows = spans.map((span) => {
    const row = exportRow(span, nameOf(span.listId), lang);
    return [row.start, row.end, row.minutes, row.list].map(field).join(",");
  });
  // CRLF, and one at the end of the last row too: that is what RFC 4180 says and
  // what a spreadsheet reading the file expects to find.
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

/** Hands the log to the OS as a download, named for the day it was taken — a
    second export tomorrow will not land on top of the first. */
export function downloadCsv(
  spans: FocusSpan[],
  nameOf: (listId: string | null) => string | null,
  lang: Language
): void {
  const at = new Date();
  const name = `orkest-focus-${at.getFullYear()}-${two(
    at.getMonth() + 1
  )}-${two(at.getDate())}.csv`;
  /*
   * The byte-order mark is not optional here. Every list name in this app is
   * Chinese on the machines it is built for, and Excel still opens a `.csv` as
   * the system's legacy codepage unless the file itself says otherwise — so
   * without the mark the one column a person typed is the one column that
   * arrives as mojibake.
   */
  const blob = new Blob([`\ufeff${csvOf(spans, nameOf, lang)}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  // In the document, because a detached anchor is ignored by some webviews; out
  // again straight away, because it is only ever a vehicle for the click.
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick rather than at once: the download reads the blob
  // after the click returns in some engines, and pulling the URL out from under
  // it cancels the save instead of ending it.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}
