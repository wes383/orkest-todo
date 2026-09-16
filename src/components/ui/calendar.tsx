"use client";

import * as React from "react";
import { DayPicker, useDayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A type alias, not an `interface … extends`: `React.ComponentProps` of a
 * `forwardRef` component resolves through a conditional type, which an
 * interface cannot extend ("statically known members").
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /**
   * BCP-47 tag the month and weekday names are formatted in.
   *
   * Named `intlLocale` rather than `locale` because `DayPicker` already owns
   * `locale` — a `date-fns` `Locale` *object*, which this project cannot build
   * (date-fns is only a transitive dependency of react-day-picker and is not
   * hoisted, so `date-fns/locale` is not importable). Everything here goes
   * through `Intl` instead, which needs a tag and nothing else.
   */
  intlLocale?: string;
};

/**
 * Everything the caption needs that `DayPicker`'s own props cannot carry: the
 * portal target for the month/year dropdowns, and the locale to name months in
 * — `CalendarMonthCaption` is rendered by the library, so its inputs have to
 * arrive by context.
 */
const CalendarContext = React.createContext<{
  container: HTMLElement | null;
  intlLocale: string;
}>({ container: null, intlLocale: "en" });

/**
 * Month names come from `Intl`, so the caption is localised without a word of
 * translation: `zh-CN` resolves to 1月…12月, `en` to January…December.
 */
function getMonthLabels(intlLocale: string): string[] {
  const fmt = new Intl.DateTimeFormat(intlLocale, { month: "long" });
  return Array.from({ length: 12 }, (_, i) =>
    fmt.format(new Date(2026, i, 1))
  );
}

/**
 * Month caption — prev/next chevrons flanking two dropdowns (month, year).
 *
 * react-day-picker's built-in nav is hidden (`nav: "hidden"` below) because the
 * library's own showcase replaces it wholesale with this: jumping straight to a
 * month or year is far quicker than paging through chevrons, and the two
 * dropdowns sit where the caption text would be, so the header stays one row.
 *
 * The dropdown portals are routed through a context rather than the document
 * body — see `Calendar` — because inside a modal Dialog the body is
 * scroll-locked and pointer-events-disabled.
 */
function CalendarMonthCaption({
  calendarMonth,
  displayIndex,
  ...divProps
}: {
  calendarMonth: { date: Date };
  displayIndex: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { months, goToMonth, dayPickerProps } = useDayPicker();
  const { container: dropdownMenuContainer, intlLocale } =
    React.useContext(CalendarContext);
  const isZh = intlLocale.toLowerCase().startsWith("zh");
  const date = calendarMonth.date;

  const startMonth = dayPickerProps?.startMonth;
  const endMonth = dayPickerProps?.endMonth;
  const prevMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const prevDisabled =
    !!startMonth && prevMonth.getTime() < startMonth.getTime();
  const nextDisabled = !!endMonth && nextMonth.getTime() > endMonth.getTime();

  // Fixed ±10 years when the caller gave no bounds — wide enough that a due
  // date is never unreachable, short enough that the list stays scannable.
  const yearRange = React.useMemo(() => {
    const currentYear = date.getFullYear();
    const startYear = startMonth
      ? startMonth.getFullYear()
      : currentYear - 10;
    const endYear = endMonth ? endMonth.getFullYear() : currentYear + 10;
    const arr: number[] = [];
    for (let y = startYear; y <= endYear; y++) arr.push(y);
    return arr;
  }, [date, startMonth, endMonth]);

  // Keyed on the locale, not on `[]` — the dropdown is a list of every month
  // name, so a stale memo would keep offering the previous language's.
  const monthLabels = React.useMemo(
    () => getMonthLabels(intlLocale),
    [intlLocale]
  );
  const [monthOpen, setMonthOpen] = React.useState(false);
  const [yearOpen, setYearOpen] = React.useState(false);

  const isFirst = displayIndex === 0;
  const isLast = displayIndex === months.length - 1;

  /*
   * `hover:bg-hover-bg` rather than a hover *text* colour: orkest-ui writes
   * `hover:text-foreground-strong` here, but neither its tailwind config nor
   * ours defines a `foreground-strong` token, so in both codebases that class
   * is dropped at build time and these buttons had no hover feedback at all.
   * A hover surface is also the house style for interactive rows elsewhere
   * (`DropdownMenuItem`, `day_button`).
   */
  const captionButtonClass = cn(
    "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-sm font-medium font-display text-foreground",
    "transition-colors duration-base hover:bg-hover-bg",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  );

  return (
    <div
      {...divProps}
      className={cn(
        "flex items-center justify-between gap-1 py-1",
        divProps.className
      )}
    >
      {isFirst ? (
        <button
          type="button"
          aria-label={isZh ? "上个月" : "Previous month"}
          disabled={prevDisabled}
          onClick={() => goToMonth(prevMonth)}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center text-foreground-muted transition-colors duration-base",
            "hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-30"
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <span className="inline-flex h-6 w-6" aria-hidden="true" />
      )}

      <DropdownMenu open={monthOpen} onOpenChange={setMonthOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={captionButtonClass}>
            {monthLabels[date.getMonth()]}
            <ChevronDown className="h-3 w-3 text-foreground-subtle" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          sideOffset={4}
          container={dropdownMenuContainer}
          className="max-h-64 min-w-28 overflow-y-auto overscroll-contain !z-[100]"
        >
          {monthLabels.map((label, idx) => (
            <DropdownMenuItem
              key={idx}
              onClick={() => {
                goToMonth(new Date(date.getFullYear(), idx, 1));
                setMonthOpen(false);
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu open={yearOpen} onOpenChange={setYearOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={captionButtonClass}>
            {date.getFullYear()}
            <ChevronDown className="h-3 w-3 text-foreground-subtle" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          sideOffset={4}
          container={dropdownMenuContainer}
          className="max-h-64 min-w-24 overflow-y-auto overscroll-contain !z-[100]"
        >
          {yearRange.map((y) => (
            <DropdownMenuItem
              key={y}
              onClick={() => {
                goToMonth(new Date(y, date.getMonth(), 1));
                setYearOpen(false);
              }}
            >
              {y}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {isLast ? (
        <button
          type="button"
          aria-label={isZh ? "下个月" : "Next month"}
          disabled={nextDisabled}
          onClick={() => goToMonth(nextMonth)}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center text-foreground-muted transition-colors duration-base",
            "hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-30"
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <span className="inline-flex h-6 w-6" aria-hidden="true" />
      )}
    </div>
  );
}

export const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  (
    {
      className,
      classNames,
      showOutsideDays = true,
      components,
      intlLocale = "en",
      formatters,
      ...props
    },
    ref
  ) => {
    /*
     * Capturing the root node into state (rather than a ref) is deliberate: the
     * month/year dropdowns are portalled, and the portal target is not known
     * until the root has mounted. Routing them here instead of to
     * `document.body` keeps them inside the Dialog's focus trap and above its
     * overlay, and — unlike a body portal — the body carries
     * `pointer-events: none` while a modal Dialog is open.
     */
    const [dropdownMenuContainer, setDropdownMenuContainer] =
      React.useState<HTMLDivElement | null>(null);

    const handleRootRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        setDropdownMenuContainer(node);
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    /*
     * Weekday headers. react-day-picker's own default formatter is pinned to
     * the `enUS` `date-fns` locale and cannot be re-pointed from here (see the
     * note on `intlLocale`), so it is replaced outright. `narrow` gives the
     * single glyph a Chinese calendar uses (日一二三四五六); `short` is what an
     * English one expects (Sun Mon …) — `narrow` there would produce a wall of
     * duplicate S/T letters.
     */
    const isZh = intlLocale.toLowerCase().startsWith("zh");
    const weekdayFormatter = React.useMemo(
      () =>
        new Intl.DateTimeFormat(intlLocale, {
          weekday: isZh ? "narrow" : "short",
        }),
      [intlLocale, isZh]
    );

    return (
      <CalendarContext.Provider
        value={{ container: dropdownMenuContainer, intlLocale }}
      >
        {/*
         * No `react-day-picker/style.css` import anywhere in this project — as
         * in orkest-ui, every rdp slot this renders is covered by the
         * `classNames` map below, so the library's default skin never loads.
         */}
        <div
          ref={handleRootRef}
          className={cn(
            "rounded-lg border border-border bg-surface p-2 shadow-pop",
            className
          )}
        >
          <DayPicker
            showOutsideDays={showOutsideDays}
            classNames={{
              months: "flex flex-col sm:flex-row gap-2",
              month: "flex flex-col gap-1",
              month_caption: "px-1",
              caption_label: "text-sm font-medium font-display",
              nav: "hidden",
              button_previous: "hidden",
              button_next: "hidden",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "flex-1 text-xs font-medium tracking-wide text-foreground-muted text-center py-0.5",
              week: "flex w-full mt-1",
              // No overflow-hidden: would clip range_middle connector bars.
              day: "flex-1 p-0 rounded-md",
              day_button: cn(
                "h-8 w-8 mx-auto rounded-md text-sm hover:bg-hover-bg focus:bg-hover-bg transition-colors duration-base ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "data-[disabled=true]:opacity-40 data-[disabled=true]:pointer-events-none"
              ),
              range_start: "bg-accent text-accent-fg rounded-l-md",
              range_end: "bg-accent text-accent-fg rounded-r-md",
              // !important to override selected's !bg-accent (both classes are
              // applied to middle days in range mode).
              range_middle: "!bg-accent-muted !text-foreground",
              hidden: "invisible",
              outside: "text-foreground-faint",
              // !important: react-day-picker applies both `today` and `selected`
              // to the same td when today is selected. Without !important, CSS
              // source order (not classNames key order) decides the winner.
              selected: "!bg-accent text-accent-fg rounded-md",
              today: "bg-hover-bg rounded-md",
              disabled: "opacity-40 pointer-events-none",
              ...classNames,
            }}
            components={{
              Nav: () => <></>,
              MonthCaption: CalendarMonthCaption,
              Chevron: ({ orientation, ...rest }: { orientation?: "left" | "right" | "up" | "down" } & React.SVGProps<SVGSVGElement>) => {
                if (orientation === "left") return <ChevronLeft className="h-4 w-4" aria-hidden="true" {...rest} />;
                if (orientation === "right") return <ChevronRight className="h-4 w-4" aria-hidden="true" {...rest} />;
                return <ChevronDown className="h-4 w-4" aria-hidden="true" {...rest} />;
              },
              ...components,
            }}
            formatters={{
              formatWeekdayName: (date: Date) => weekdayFormatter.format(date),
              ...formatters,
            }}
            {...props}
          />
        </div>
      </CalendarContext.Provider>
    );
  }
);
Calendar.displayName = "Calendar";
