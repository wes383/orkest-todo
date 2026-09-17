"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { WheelPicker, type WheelPickerItem } from "@/components/ui/wheel-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * TimePicker — iOS-style wheel time picker.
 *
 * - Trigger is a combobox-styled surface (clock icon + formatted time); click opens a Popover.
 * - Popover contains two WheelPicker columns: hour and minute.
 * - 12/24-hour mode and the display format follow the `intlLocale` prop, falling
 *   back to `<html lang>`: `zh` renders "14:30" in 24 hours; `en` renders
 *   "1:05 PM" with an AM/PM column — the same convention `DatePicker` uses.
 * - `minuteStep` controls the minute step (must evenly divide 60), default 1.
 * - Controlled value format: "HH:mm" (24-hour string, the format `<input type="time">` spoke).
 * - Supports both controlled (value + onChange) and uncontrolled (defaultValue) usage.
 */

export interface TimePickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type" | "size"> {
  /** Controlled value, format "HH:mm" (24-hour). */
  value?: string;
  /** Uncontrolled initial value. An empty string renders the placeholder. */
  defaultValue?: string;
  /** Value change callback; receives an "HH:mm" string. */
  onChange?: (value: string) => void;
  /** Minute step; must evenly divide 60. @default 1 */
  minuteStep?: number;
  /** Whether to use 12-hour mode + AM/PM column. Omit to follow `intlLocale`. */
  use12Hour?: boolean;
  /** BCP-47 tag for the display format and this component's own copy. */
  intlLocale?: string;
  /** Size variant of the Popover trigger. */
  size?: "sm" | "md" | "lg";
}

const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 5;

/** `zh` or `en`, resolved the way `DatePicker` resolves its own copy. */
function pick(locale: string, zh: string, en: string): string {
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

/** Parse an "HH:mm" string into { hour, minute }. */
function parseTime(value: string | undefined): { hour: number; minute: number } {
  if (!value) return { hour: 9, minute: 0 };
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return { hour: 9, minute: 0 };
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return { hour: 9, minute: 0 };
  return {
    hour: Math.max(0, Math.min(23, h)),
    minute: Math.max(0, Math.min(59, min)),
  };
}

/** Format an "HH:mm" string into a display string via Intl.DateTimeFormat. */
function formatDisplay(
  value: string | undefined,
  use12Hour: boolean,
  locale: string
): string {
  if (!value) return "";
  const { hour, minute } = parseTime(value);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: use12Hour,
  }).format(date);
}

export const TimePicker = React.forwardRef<HTMLInputElement, TimePickerProps>(
  (
    {
      className,
      value: valueProp,
      defaultValue,
      onChange,
      minuteStep: minuteStepProp = 1,
      use12Hour: use12HourProp,
      size = "md",
      disabled,
      placeholder,
      intlLocale,
      ...props
    },
    ref
  ) => {
    const minuteStep =
      minuteStepProp > 0 && 60 % minuteStepProp === 0 ? minuteStepProp : 1;

    /*
     * Same convention as `DatePicker`: an unconfigured picker still localises
     * itself, because the app keeps `<html lang>` in step with the language.
     */
    const locale =
      intlLocale ||
      (typeof document !== "undefined"
        ? document.documentElement.lang || "en"
        : "en");

    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(
      defaultValue ?? ""
    );
    const value = isControlled ? (valueProp as string) : internalValue;

    const use12Hour =
      use12HourProp ?? !locale.toLowerCase().startsWith("zh");

    const [open, setOpen] = React.useState(false);
    const { hour, minute } = parseTime(value);

    const triggerRef = React.useRef<HTMLDivElement>(null);
    const [dialogContainer, setDialogContainer] = React.useState<HTMLElement | null>(
      null
    );

    React.useEffect(() => {
      setDialogContainer(
        triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null
      );
    }, []);

    const commit = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternalValue(next);
        onChange?.(next);
      },
      [isControlled, onChange]
    );

    const hourItems: WheelPickerItem[] = React.useMemo(() => {
      const arr: WheelPickerItem[] = [];
      const maxHour = use12Hour ? 12 : 23;
      const startHour = use12Hour ? 1 : 0;
      for (let h = startHour; h <= maxHour; h++) {
        arr.push({
          value: h,
          label: use12Hour ? String(h) : String(h).padStart(2, "0"),
        });
      }
      return arr;
    }, [use12Hour]);

    const minuteItems: WheelPickerItem[] = React.useMemo(() => {
      const arr: WheelPickerItem[] = [];
      for (let m = 0; m < 60; m += minuteStep) {
        arr.push({ value: m, label: String(m).padStart(2, "0") });
      }
      return arr;
    }, [minuteStep]);

    const periodItems: WheelPickerItem[] = React.useMemo(
      () => [
        { value: "AM", label: "AM" },
        { value: "PM", label: "PM" },
      ],
      []
    );

    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const currentPeriod = hour < 12 ? "AM" : "PM";

    const handleHourChange = React.useCallback(
      (next: string | number) => {
        const nextH = Number(next);
        let newHour = nextH;
        if (use12Hour) {
          // In 12-hour mode, restore to 24-hour based on AM/PM
          const isPM = hour >= 12;
          if (isPM && nextH !== 12) newHour = nextH + 12;
          else if (!isPM && nextH === 12) newHour = 0;
          else if (isPM && nextH === 12) newHour = 12;
          else newHour = nextH;
        }
        commit(
          `${String(newHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
        );
      },
      [use12Hour, hour, minute, commit]
    );

    const handleMinuteChange = React.useCallback(
      (next: string | number) => {
        const nextMin = Number(next);
        commit(
          `${String(hour).padStart(2, "0")}:${String(nextMin).padStart(2, "0")}`
        );
      },
      [hour, commit]
    );

    const handlePeriodChange = React.useCallback(
      (next: string | number) => {
        let newHour = hour;
        if (next === "PM" && hour < 12) newHour = hour + 12;
        else if (next === "AM" && hour >= 12) newHour = hour - 12;
        commit(
          `${String(newHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
        );
      },
      [hour, minute, commit]
    );

    const displayValue = formatDisplay(value, use12Hour, locale);

    const heightClass =
      size === "sm" ? "h-10" : size === "lg" ? "h-14" : "h-12";

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            ref={triggerRef}
            className={cn(
              "relative flex items-center w-full bg-surface border rounded-lg text-base text-foreground transition-colors duration-base",
              "border-border focus-within:border-border-strong",
              disabled && "bg-hover-bg cursor-not-allowed opacity-60",
              "cursor-pointer",
              heightClass,
              className
            )}
            // Make the div behave like an input: focusable and activatable by a label
            tabIndex={disabled ? -1 : 0}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-disabled={disabled || undefined}
          >
            {/* Hidden real input: carries the value in the "HH:mm" the callers speak */}
            <input
              ref={ref}
              type="hidden"
              value={value}
              disabled={disabled}
              {...props}
            />
            <Clock
              className="pointer-events-none absolute left-3 h-4 w-4 text-foreground-subtle"
              aria-hidden="true"
            />
            <span
              className={cn(
                "pl-10 pr-3 flex-1 truncate",
                !displayValue && "text-foreground-subtle"
              )}
            >
              {displayValue || placeholder || pick(locale, "选择时间", "Pick a time")}
            </span>
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          container={dialogContainer}
          className="w-auto p-3"
        >
          <div className="flex items-center justify-center gap-2">
            <WheelPicker
              aria-label={pick(locale, "小时", "Hour")}
              items={hourItems}
              value={use12Hour ? hour12 : hour}
              onChange={handleHourChange}
              itemHeight={ITEM_HEIGHT}
              visibleCount={VISIBLE_COUNT}
              className="w-12"
            />
            <span
              aria-hidden="true"
              className="text-foreground-muted font-medium select-none"
            >
              :
            </span>
            <WheelPicker
              aria-label={pick(locale, "分钟", "Minute")}
              items={minuteItems}
              value={minute}
              onChange={handleMinuteChange}
              itemHeight={ITEM_HEIGHT}
              visibleCount={VISIBLE_COUNT}
              className="w-12"
            />
            {use12Hour && (
              <WheelPicker
                aria-label={pick(locale, "上午 / 下午", "AM / PM")}
                items={periodItems}
                value={currentPeriod}
                onChange={handlePeriodChange}
                itemHeight={ITEM_HEIGHT}
                visibleCount={VISIBLE_COUNT}
                loop={false}
                className="w-14"
              />
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {pick(locale, "确定", "OK")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

TimePicker.displayName = "TimePicker";
