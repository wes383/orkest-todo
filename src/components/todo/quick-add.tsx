import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { CalendarPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Hint } from "@/components/ui/section";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  parseQuickInput,
  tokenizeQuickInput,
  type QuickInput,
  type QuickToken,
} from "@/lib/quick-input";
import { PRIORITY_META, TITLE_MAX, type PriorityMeta } from "@/lib/types";

/**
 * Token paint. Two rules make these safe to drop into running text:
 *
 * 1. `px-px -mx-px` is width-neutral. An inline box advances by
 *    `margin + border + padding + content`, so ±1px cancels and every glyph
 *    after the token stays exactly where the field laid it out. That matters
 *    because the caret is positioned from the field's own text, not from this
 *    layer — if the mirror drifted, clicking would land on the wrong character.
 * 2. `py-0.5` on an inline box only bleeds paint. Vertical padding never
 *    touches line height, so a token can't push its own line box around.
 *
 * 1px is the practical ceiling for the horizontal bleed, not a taste call:
 * `#汇报 #Q3` is a normal thing to type, the space between two tokens is only
 * ~3.5px at this size, and past roughly 1.7px per side the two chips bleed into
 * each other until they read as one. So the chip-ness has to come from the
 * tint, the radius and the vertical padding instead of from padding.
 *
 * Which also means: no font weight, size or letter-spacing changes are allowed
 * here, however nice a bolder chip would look.
 */
const TOKEN_FRAME = "rounded-sm px-px -mx-px py-0.5";
const TAG_PAINT = "bg-hover-bg-strong text-foreground-muted";

/** Keyed by `PRIORITY_META[...].badge` so the inline chip and the card agree. */
const PRIORITY_PAINT: Record<PriorityMeta["badge"], string> = {
  danger: "bg-red-soft text-red-fg",
  warning: "bg-orange-soft text-orange-fg",
  info: "bg-blue-soft text-blue-fg",
  secondary: "bg-muted text-foreground-muted",
};

/** One run of the mirror layer: plain text, a `#tag`, or a `p#` priority. */
function Token({ token }: { token: QuickToken }) {
  switch (token.kind) {
    case "text":
      return <>{token.text}</>;
    case "tag":
      return <span className={cn(TOKEN_FRAME, TAG_PAINT)}>{token.text}</span>;
    case "priority":
      return (
        <span
          className={cn(
            TOKEN_FRAME,
            PRIORITY_PAINT[PRIORITY_META[token.priority].badge]
          )}
        >
          {token.text}
        </span>
      );
  }
}

export interface QuickAddHandle {
  /** Put the caret in the field, ready to type. */
  focus: () => void;
}

export interface QuickAddProps {
  /** Shown in the hint so users know where the task will land. */
  listName: string;
  /** Parsed draft — title, tags and priority already pulled out of the syntax. */
  onAdd: (draft: QuickInput) => void;
  onOpenFullEditor: () => void;
  /**
   * React 19 hands `ref` down as a plain prop, so there is no `forwardRef`
   * wrapper here.
   *
   * The only reason to reach into this component from outside is to focus the
   * field — the tray's 新建任务 does exactly that, since a native menu cannot
   * host a text box and the next best thing is landing the caret where the user
   * was going to type anyway.
   */
  ref?: Ref<QuickAddHandle>;
}

/**
 * QuickAdd — a single "inline field" surface: `rounded-lg` shell, no inner
 * input chrome, border strengthens on focus-within. The trailing button opens
 * the full editor so the fast path never hides the thorough one.
 *
 * The field itself paints nothing: its glyphs are `text-transparent` and a
 * mirror layer underneath paints them instead, so `#标签` and `p1` can turn into
 * chips *in place* while typing. A native `<input>` has no way to style a
 * substring, and this keeps everything else native — caret, selection, IME
 * composition, undo, keyboard handling. `syncScroll` is what keeps the two
 * layers locked together once the text overflows.
 */
export function QuickAdd({
  listName,
  onAdd,
  onOpenFullEditor,
  ref,
}: QuickAddProps) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  /*
   * While an IME is composing, the value holds provisional text — styling it
   * would make a chip flicker in and out as the pinyin changes, so the mirror
   * shows the raw run until the composition is committed.
   */
  const tokens = useMemo<QuickToken[]>(
    () => (composing ? [{ kind: "text", text: value }] : tokenizeQuickInput(value)),
    [composing, value]
  );

  /** A single-line field scrolls its own text; the mirror has to follow it. */
  const syncScroll = useCallback(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (input && mirror) {
      mirror.style.transform = `translateX(${-input.scrollLeft}px)`;
    }
  }, []);

  // Runs after the DOM has the new value, because that is when the field has
  // finally scrolled — the change handler fires before React commits.
  useLayoutEffect(syncScroll, [syncScroll, value]);

  const submit = () => {
    const draft = parseQuickInput(value);
    if (!draft.title) return;
    onAdd(draft);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-1.5 pl-3.5 transition-colors duration-base ease-out focus-within:border-border-strong">
        <Icon icon={Plus} size="sm" className="text-foreground-subtle" />

        <div className="relative min-w-0 flex-1">
          {/*
           * The paint layer. `aria-hidden` because it is a duplicate of the
           * field's text, and clipped exactly like the field's own inner editor
           * (same box: the field is `border-0 px-0`).
           */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-sm text-foreground"
          >
            <div ref={mirrorRef} className="whitespace-pre">
              {tokens.map((token, index) => (
                <Token key={index} token={token} />
              ))}
            </div>
          </div>

          {/*
           * `relative z-10` is load-bearing: the mirror is absolutely
           * positioned, so without it the mirror would paint *over* the field
           * and bury the caret under its own chips.
           *
           * `rounded-none` is load-bearing too, and not cosmetic. The shell
           * already owns the shape, but `inputVariants` still stamps
           * `rounded-lg` (16px) on the field, and Chromium clips a single-line
           * control's inner content to its own rounded border box. The caret is
           * painted at x = 0, right where that arc is shallowest — on a 36px
           * field a 16px radius leaves only ~4px of room at the very edge, so
           * the caret got its top and bottom shaved off and antialiased into a
           * faded stub instead of a full-height bar. Squaring the field (the
           * shell is what's visible) removes the clip entirely.
           */}
          <Input
            ref={inputRef}
            size="sm"
            value={value}
            placeholder={t("quickAdd.placeholder")}
            aria-label={t("quickAdd.aria")}
            // The whole line is a title, so it stops where a title stops. The
            // field itself is transparent and the mirror above paints the
            // words, but the mirror is driven by the same `value` — so the
            // ceiling shows up there the moment it is reached.
            maxLength={TITLE_MAX}
            className="quick-add-field relative z-10 h-9 w-full rounded-none border-0 bg-transparent px-0 text-transparent caret-foreground focus:border-0"
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onScroll={syncScroll}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenFullEditor}
              aria-label={t("quickAdd.openEditor")}
            >
              <Icon icon={CalendarPlus} size="sm" />
              {t("quickAdd.detailButton")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("quickAdd.detailHint")}</TooltipContent>
        </Tooltip>
      </div>

      {/*
       * Hints are progressive disclosure — they appear only while the field has
       * focus. As a permanently visible row this was three clauses of standing
       * explanation under an empty input, which made it the noisiest element on
       * the screen; none of it is needed to use the field, since the
       * placeholder already says Enter saves.
       */}
      {focused && (
        <Hint className="animate-fade-in pl-1">
          <span>{t("quickAdd.intoList", { list: listName })}</span>
          <span aria-hidden="true" className="text-foreground-faint">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd className="text-[10px]">{t("quickAdd.tagSyntax")}</Kbd>
            {t("common.tags")}
          </span>
          <span aria-hidden="true" className="text-foreground-faint">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd className="text-[10px]">p1</Kbd>
            <span className="text-foreground-faint">–</span>
            <Kbd className="text-[10px]">p4</Kbd>
            {t("quickAdd.priorityHint")}
          </span>
          <span aria-hidden="true" className="text-foreground-faint">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd className="text-[10px]">Ctrl</Kbd>
            <Kbd className="text-[10px]">N</Kbd>
            {t("quickAdd.fullEditorHint")}
          </span>
        </Hint>
      )}
    </div>
  );
}
