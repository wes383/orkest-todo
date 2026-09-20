import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Moon, Search, Settings, Sun, SunMoon, Timer, Trash2, BarChart3, Languages, Plus, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { parseQuickInput, type QuickInput } from "@/lib/quick-input";
import { PRIORITY_META } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The command palette — Ctrl/Cmd+K. One box that answers "do something" and
 * "go somewhere" with the same keystrokes. Commands are declared by the caller
 * (App), which owns every action; this component is only the picking surface:
 * filter, arrow keys, Enter.
 *
 * One row is not a command. Anything typed that reads as a task gets a "quick
 * add it" row at the foot of the list, parsed with the same `#标签` / `p1–p4`
 * grammar the inline field uses — this box is one keystroke away from being a
 * place to type, so typing a task into it should not be a dead end.
 *
 * Last, never first: a query that matches a command has to keep Enter meaning
 * that command, while a query that matches nothing still lands on the create
 * row by default, because it is then the only row there is.
 */

export interface PaletteCommand {
  id: string;
  labelKey: MessageKey;
  icon?: typeof Zap;
  run: () => void;
}

/**
 * A rendered row. Built as a flat list rather than branching in the JSX so the
 * keyboard — index, clamp, scroll-into-view — sees one array, and does not have
 * to know that the last row came from somewhere else.
 */
interface Row {
  key: string;
  icon: typeof Zap;
  label: string;
  /** Muted note on the right: what the create row pulled out of the query. */
  note?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  onQuickAdd,
  hideShortcutHints,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
  /** Add the typed line as a task. App parses nothing here — it receives the
      same `QuickInput` draft the inline field hands over, so one grammar
      decides what `#标签` and `p1` mean. */
  onQuickAdd: (draft: QuickInput) => void;
  /** Whether the footer spells out how the palette is driven. See
      `AppSettings.hideShortcutHints`. */
  hideShortcutHints: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const matching =
      q === ""
        ? commands
        : commands.filter((cmd) => t(cmd.labelKey).toLowerCase().includes(q));

    const list: Row[] = matching.map((cmd) => ({
      key: cmd.id,
      icon: cmd.icon ?? Zap,
      label: t(cmd.labelKey),
      run: cmd.run,
    }));

    /*
     * The offer to create. Gated on the *title* rather than on the raw query,
     * because the parser can eat a whole line and leave nothing behind: `p1` or
     * `#工作` on their own name no task, and offering to add an untitled one
     * would be offering something the store would refuse anyway.
     *
     * The note repeats the tokens back — `#工作 · 紧急` — which is the only
     * place the user can see that the grammar was recognised rather than taken
     * literally. Without it a `p1` that silently became a priority is
     * indistinguishable from a `p1` that silently stayed in the title.
     */
    const draft = parseQuickInput(query);
    if (draft.title) {
      const note = [
        ...draft.tags.map((tag) => `#${tag}`),
        ...(draft.priority ? [t(PRIORITY_META[draft.priority].shortKey)] : []),
      ].join(" · ");
      list.push({
        key: "palette-create",
        icon: Plus,
        label: t("palette.create", { title: draft.title }),
        note: note || undefined,
        run: () => onQuickAdd(draft),
      });
    }

    return list;
  }, [commands, query, t, onQuickAdd]);

  // Reset for each opening: a palette that remembers an old query reads as
  // stale rather than fast.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after the dialog has mounted its content.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onOpenChange(false);
    // After close: several commands switch screens, and the switch should not
    // fight the dialog's unmount for focus.
    requestAnimationFrame(() => row.run());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="max-w-xl gap-0 overflow-hidden p-0"
        aria-label={t("palette.placeholder")}
      >
        <DialogTitle className="sr-only">{t("palette.placeholder")}</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, rows.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(active);
              }
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-foreground-faint"
          />
        </div>
        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2" role="listbox">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-foreground-subtle">
              {t("palette.empty")}
            </p>
          ) : (
            rows.map((row, index) => {
              const Icon = row.icon;
              return (
                <button
                  key={row.key}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(index)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    index === active
                      ? "bg-hover-bg-strong text-foreground"
                      : "text-foreground-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{row.label}</span>
                  {row.note && (
                    // One size down from the row, like every other annotation in
                    // the app: the queried words are the row, this is about it.
                    <span className="shrink-0 text-xs text-foreground-faint">
                      {row.note}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        {/* Hidden whole rather than left empty: that rule is the footer's only
            content, and a bordered strip holding nothing reads as a bug. The
            palette still works — ↑↓ and Enter are nobody's invention, and every
            row is clickable. */}
        {!hideShortcutHints && (
          <div className="border-t border-border px-4 py-2 text-right text-[11px] text-foreground-faint">
            {t("palette.hint")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Icon choices for the commands App declares, in one import site. */
export const PALETTE_ICONS = {
  plus: Plus,
  timer: Timer,
  stats: BarChart3,
  settings: Settings,
  list: ClipboardList,
  sun: Sun,
  moon: Moon,
  system: SunMoon,
  language: Languages,
  trash: Trash2,
};
