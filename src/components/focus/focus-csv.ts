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

import { invoke } from "@tauri-apps/api/core";

import { exportRow, type FocusSpan } from "@/lib/focus-spans";
import { recurRrule } from "@/lib/recur";
import type { Language } from "@/lib/messages";
import type { Todo, TodoList } from "@/lib/types";

const HEADER = "start,end,minutes,list";
const TASKS_HEADER =
  "title,list,status,priority,due,created,completed,rrule,tags,subtasks,notes";

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

/**
 * The whole task set as CSV, one row a task in the order stored. The same
 * spirit as the focus sheet: what the store holds is what the file says, with
 * nothing recomputed — a completed task reads off its `completedAt`, an open
 * one leaves that column empty.
 *
 * The columns are the fields a person sorting their life would want: what the
 * task is, where it lives, whether it is done, when it was due, made, finished,
 * whether it repeats — written as an RFC 5545 RRULE, the one spelling other
 * software already understands — what it was tagged, how it was broken down —
 * each subtask by name, ticked or not, since a bare count would make the file
 * useless for actually working through the list — and anything written about it.
 */
export function tasksCsvOf(todos: Todo[], lists: TodoList[]): string {
  const nameOf = (listId: string): string =>
    lists.find((list) => list.id === listId)?.name ?? "";
  const rows = todos.map((todo) => {
    const subtasks = todo.subtasks
      .map((sub) => `${sub.done ? "[x]" : "[ ]"} ${sub.title}`)
      .join("; ");
    return [
      todo.title,
      nameOf(todo.listId),
      todo.done ? "done" : "open",
      todo.priority,
      todo.dueDate ?? "",
      stamp(todo.createdAt),
      todo.completedAt === null ? "" : stamp(todo.completedAt),
      // Truthiness, not `=== null`: todos persisted before the recur feature
      // carry the field as `undefined`, and a strict null check would let one
      // of those through to `recurRrule` — which reads `.kind` and dies.
      todo.recur ? recurRrule(todo.recur, todo.dueDate) : "",
      todo.tags.join("; "),
      subtasks,
      todo.notes,
    ]
      .map(field)
      .join(",");
  });
  return [TASKS_HEADER, ...rows].join("\r\n") + "\r\n";
}

/** `2026-09-14 14:03:20` — the same stamp format the focus sheet writes, so
    both files read the same way in a spreadsheet. */
function stamp(ms: number): string {
  const at = new Date(ms);
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(
    at.getHours()
  )}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
}

/** True inside the Tauri webview, where the OS folder picker and its file
    writer are reachable through the app's own command — the browser's
    download dance is only the fallback, for a dev server in a plain tab. */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * The two files one export produces, named for the day it was taken — a
 * second export tomorrow will not land on top of the first.
 *
 * The byte-order mark is not optional. Every name in this app is Chinese on
 * the machines it is built for, and Excel still opens a `.csv` as the
 * system's legacy codepage unless the file itself says otherwise — so without
 * the mark the one column a person typed is the one column that arrives as
 * mojibake, whichever side ends up writing the bytes.
 */
function exportFiles(
  spans: FocusSpan[],
  todos: Todo[],
  nameOf: (listId: string | null) => string | null,
  lists: TodoList[],
  lang: Language
): { name: string; contents: string }[] {
  const at = new Date();
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(
    at.getDate()
  )}`;
  return [
    {
      name: `orkest-focus-${day}.csv`,
      contents: `\ufeff${csvOf(spans, nameOf, lang)}`,
    },
    {
      name: `orkest-tasks-${day}.csv`,
      contents: `\ufeff${tasksCsvOf(todos, lists)}`,
    },
  ];
}

/** Hands one blob to the OS as a download. The click dance is the focus
    sheet's, shared now that a single export writes two files. */
function save(blob: Blob, name: string): void {
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

/**
 * The whole app, out: the focus log as it always went, and the task set beside
 * it — one click, two files.
 *
 * Inside the Tauri webview the reader is asked *where*: one native folder
 * picker covers both files, because they belong together and a save dialog
 * per file would make the second pick feel like a mistake. The dated names
 * stand in for the filename box a save dialog would have asked about. Rust
 * writes the bytes and the folder it used comes back, so the caller can say
 * where the files went; `null` is the reader cancelling — nothing happened,
 * nothing is said.
 *
 * Outside Tauri the old browser download runs instead, which has no folder to
 * report and so also answers `null`.
 *
 * Inside Tauri a failing command is rethrown, not fallen back from: the
 * webview's anchor download does nothing there, so a swallowed error would
 * read exactly like a dead button — the caller shows what went wrong instead.
 */
export async function downloadAll(
  spans: FocusSpan[],
  todos: Todo[],
  nameOf: (listId: string | null) => string | null,
  lists: TodoList[],
  lang: Language
): Promise<string | null> {
  const files = exportFiles(spans, todos, nameOf, lists, lang);
  if (inTauri()) {
    return await invoke<string | null>("save_csv_files", { files });
  }
  for (const file of files) {
    save(
      new Blob([file.contents], { type: "text/csv;charset=utf-8" }),
      file.name
    );
  }
  return null;
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}
