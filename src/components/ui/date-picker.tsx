"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DatePickerMode = "single" | "range";

export interface DateRange {
  from: Date;
  to?: Date;
}

export interface DatePickerShortcut {
  label: string;
  getValue: () => Date | DateRange;
}

export interface DatePickerProps {
  mode?: DatePickerMode;
  value?: Date | DateRange | null;
  defaultValue?: Date | DateRange | null;
  onChange?: (value: Date | DateRange | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: Date[];
  shortcuts?: DatePickerShortcut[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  /** BCP-47 tag for the trigger's date format and this component's own copy. */
  intlLocale?: string;
  "aria-label"?: string;
}

/**
 * The handful of strings this component owns.
 *
 * An inline two-language ternary rather than the app's dictionary, on purpose:
 * this is a library copy that must keep working wherever it is dropped, without
 * an `I18nProvider` above it. Everything else it renders is either a `prop` or
 * comes from `Intl`.
 */
const pick = (zh: string, en: string, isZh: boolean) => (isZh ? zh : en);

/**
 * Default shortcut column.
 *
 * A single date is offered as 今天 / 昨天 / 明天 / 本周一 / 本月初 because this
 * component is generic — it is also the right set for picking a report date,
 * which can legitimately be in the past. Callers with a narrower meaning (a due
 * date, say) should pass their own `shortcuts`; that is what the prop is for.
 */
function getDefaultShortcuts(
  mode: DatePickerMode,
  isZh: boolean
): DatePickerShortcut[] {
  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const addDays = (n: number) => {
    const d = today();
    d.setDate(d.getDate() + n);
    return d;
  };
  const startOfWeek = () => {
    const d = today();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  };
  const endOfWeek = () => {
    const d = startOfWeek();
    d.setDate(d.getDate() + 6);
    return d;
  };
  const startOfMonth = () => {
    const d = today();
    d.setDate(1);
    return d;
  };
  const endOfMonth = () => {
    const d = startOfMonth();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d;
  };

  if (mode === "range") {
    return [
      {
        label: pick("本周", "This week", isZh),
        getValue: () => ({ from: startOfWeek(), to: endOfWeek() }),
      },
      {
        label: pick("上周", "Last week", isZh),
        getValue: () => {
          const s = startOfWeek();
          s.setDate(s.getDate() - 7);
          const e = endOfWeek();
          e.setDate(e.getDate() - 7);
          return { from: s, to: e };
        },
      },
      {
        label: pick("本月", "This month", isZh),
        getValue: () => ({ from: startOfMonth(), to: endOfMonth() }),
      },
      {
        label: pick("上月", "Last month", isZh),
        getValue: () => {
          const s = startOfMonth();
          s.setMonth(s.getMonth() - 1);
          const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
          return { from: s, to: e };
        },
      },
      {
        label: pick("最近 7 天", "Last 7 days", isZh),
        getValue: () => ({ from: addDays(-6), to: today() }),
      },
      {
        label: pick("最近 30 天", "Last 30 days", isZh),
        getValue: () => ({ from: addDays(-29), to: today() }),
      },
    ];
  }

  return [
    { label: pick("今天", "Today", isZh), getValue: today },
    { label: pick("昨天", "Yesterday", isZh), getValue: () => addDays(-1) },
    { label: pick("明天", "Tomorrow", isZh), getValue: () => addDays(1) },
    { label: pick("本周一", "This Monday", isZh), getValue: startOfWeek },
    { label: pick("本月初", "Start of month", isZh), getValue: startOfMonth },
  ];
}

/**
 * Renders the selection for the trigger. The year is always included — in an
 * editor an ambiguous "9月20日" is worse than a slightly longer one, and the
 * trigger has the width to spare.
 */
function formatDate(
  date: Date | DateRange | undefined,
  mode: DatePickerMode,
  locale: string
): string {
  if (!date) return "";
  if (mode === "range") {
    const r = date as DateRange;
    if (!r.from) return "";
    const fmt = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (!r.to) return fmt.format(r.from);
    return `${fmt.format(r.from)} – ${fmt.format(r.to)}`;
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date as Date);
}

/**
 * DatePicker — a trigger styled like `Input`, opening a popover that pairs a
 * calendar with a column of relative shortcuts.
 *
 * The shortcuts are not decoration: "明天" is one click, whereas the same task
 * through the grid is find-today, then find-tomorrow's cell. 清除 lives at the
 * foot of that column (pushed down with `mt-auto`) so clearing is part of the
 * same surface instead of a second button next to the field.
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      mode = "single",
      value: valueProp,
      defaultValue,
      onChange,
      minDate,
      maxDate,
      disabledDates,
      shortcuts,
      placeholder,
      size = "md",
      disabled,
      className,
      contentClassName,
      intlLocale,
      "aria-label": ariaLabel,
    },
    ref
  ) => {
    /*
     * Falls back to `<html lang>`, which the app keeps in step with the chosen
     * language — so an unconfigured `DatePicker` still localises itself, and a
     * `DatePicker` inside a pure browser page with no app shell still works.
     */
    const locale =
      intlLocale ||
      (typeof document !== "undefined"
        ? document.documentElement.lang || "en"
        : "en");
    const isZh = locale.toLowerCase().startsWith("zh");

    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = React.useState<
      Date | DateRange | undefined | null
    >(defaultValue ?? undefined);
    const value = isControlled
      ? (valueProp as Date | DateRange | undefined | null)
      : internalValue;

    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLDivElement>(null);
    /*
     * Portal target for the calendar. Inside a modal Dialog the body is
     * scroll-locked and has `pointer-events: none`, so a body portal would be
     * both unclickable and outside the focus trap. Portalling into the dialog
     * itself keeps the popover interactive; `null` (no surrounding dialog) falls
     * back to the default body portal.
     */
    const [dialogContainer, setDialogContainer] =
      React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
      setDialogContainer(
        triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null
      );
    }, []);

    const finalShortcuts =
      shortcuts === undefined ? getDefaultShortcuts(mode, isZh) : shortcuts;

    const disabledConfig = React.useMemo(() => {
      type Matcher = NonNullable<DayPickerProps["disabled"]>;
      const arr: Exclude<Matcher, Date | ((d: Date) => boolean)>[] = [];
      if (minDate || maxDate) {
        const m: Record<string, Date> = {};
        if (minDate) m.before = minDate;
        if (maxDate) m.after = maxDate;
        arr.push(m as unknown as (typeof arr)[number]);
      }
      if (disabledDates?.length) {
        for (const d of disabledDates)
          arr.push(d as unknown as (typeof arr)[number]);
      }
      return arr.length ? (arr as unknown as Matcher) : undefined;
    }, [minDate, maxDate, disabledDates]);

    const commit = React.useCallback(
      (next: Date | DateRange | undefined) => {
        /*
         * Always sync the internal copy, not only when uncontrolled. The
         * controlled detection is `valueProp !== undefined`, so a caller that
         * passes `undefined` while empty flips this component between modes
         * across renders; without this sync a stale internal Date would
         * resurrect in the trigger the moment it flips back.
         */
        setInternalValue(next);
        onChange?.(next);
      },
      [onChange]
    );

    /** Single mode closes on pick — the choice is final the moment it is made. */
    const handleDayPickerSelect = React.useCallback(
      (selected: unknown) => {
        if (mode === "single") {
          commit(selected as Date | undefined);
          if (selected) setOpen(false);
        } else {
          commit(selected as DateRange | undefined);
        }
      },
      [mode, commit]
    );

    const handleShortcutClick = React.useCallback(
      (shortcut: DatePickerShortcut) => {
        commit(shortcut.getValue());
        if (mode === "single") setOpen(false);
      },
      [mode, commit]
    );

    const handleClear = React.useCallback(() => {
      commit(undefined);
      if (mode === "single") setOpen(false);
    }, [mode, commit]);

    const displayValue = formatDate(value ?? undefined, mode, locale);

    // Mirrors `inputVariants.size` so the trigger lines up with a real Input.
    const heightClass =
      size === "sm" ? "h-10" : size === "lg" ? "h-14" : "h-12";

    type DayPickerProps = React.ComponentProps<typeof DayPicker>;

    const calendarElement =
      mode === "single" ? (
        <Calendar
          mode="single"
          selected={value as Date | undefined}
          onSelect={(d) => handleDayPickerSelect(d)}
          disabled={disabledConfig}
          numberOfMonths={1}
          intlLocale={locale}
        />
      ) : (
        <Calendar
          mode="range"
          selected={value as DateRange | undefined}
          onSelect={(r) => handleDayPickerSelect(r)}
          disabled={disabledConfig}
          numberOfMonths={2}
        />
      );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            ref={triggerRef}
            className={cn(
              "relative flex items-center w-full bg-surface border rounded-lg text-base text-foreground transition-colors duration-base cursor-pointer",
              "border-border focus-within:border-border-strong",
              disabled && "bg-hover-bg cursor-not-allowed opacity-60",
              heightClass,
              className
            )}
            tabIndex={disabled ? -1 : 0}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={ariaLabel}
            aria-disabled={disabled || undefined}
          >
            <input
              ref={ref}
              type="hidden"
              value={
                value
                  ? mode === "single"
                    ? (value as Date).toISOString()
                    : JSON.stringify({
                        from: (value as DateRange).from?.toISOString(),
                        to: (value as DateRange).to?.toISOString(),
                      })
                  : ""
              }
              disabled={disabled}
            />
            <CalendarIcon
              className="pointer-events-none absolute left-3 h-4 w-4 text-foreground-subtle"
              aria-hidden="true"
            />
            <span
              className={cn(
                "pl-10 pr-3 flex-1 truncate",
                !displayValue && "text-foreground-subtle"
              )}
            >
              {displayValue || placeholder || pick("选择日期", "Select a date", isZh)}
            </span>
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          container={dialogContainer}
          className={cn("w-auto p-0", contentClassName)}
        >
          <div className="flex">
            {finalShortcuts.length > 0 && (
              <div className="flex flex-col gap-1 p-2 min-w-24">
                {finalShortcuts.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => handleShortcutClick(s)}
                    className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-hover-bg transition-colors duration-base"
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="mt-auto text-left text-sm px-3 py-1.5 rounded-md text-foreground-muted hover:bg-hover-bg hover:text-foreground transition-colors duration-base"
                >
                  {isZh ? "清除" : "Clear"}
                </button>
              </div>
            )}
            <div className="p-0">{calendarElement}</div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

DatePicker.displayName = "DatePicker";
