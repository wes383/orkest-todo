import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Full literal strings (incl. breakpoint prefixes) so Tailwind's JIT
   scanner detects every class that may be emitted. */

const colsBase: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  8: "grid-cols-8",
  10: "grid-cols-10",
  12: "grid-cols-12",
};

const colsSm: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
  8: "sm:grid-cols-8",
  10: "sm:grid-cols-10",
  12: "sm:grid-cols-12",
};

const colsMd: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
  8: "md:grid-cols-8",
  10: "md:grid-cols-10",
  12: "md:grid-cols-12",
};

const colsLg: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  8: "lg:grid-cols-8",
  10: "lg:grid-cols-10",
  12: "lg:grid-cols-12",
};

const colsXl: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
  8: "xl:grid-cols-8",
  10: "xl:grid-cols-10",
  12: "xl:grid-cols-12",
};

const cols2xl: Record<number, string> = {
  1: "2xl:grid-cols-1",
  2: "2xl:grid-cols-2",
  3: "2xl:grid-cols-3",
  4: "2xl:grid-cols-4",
  5: "2xl:grid-cols-5",
  6: "2xl:grid-cols-6",
  8: "2xl:grid-cols-8",
  10: "2xl:grid-cols-10",
  12: "2xl:grid-cols-12",
};

const spanMap: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};

const colStartMap: Record<number, string> = {
  1: "col-start-1",
  2: "col-start-2",
  3: "col-start-3",
  4: "col-start-4",
  5: "col-start-5",
  6: "col-start-6",
  7: "col-start-7",
  8: "col-start-8",
  9: "col-start-9",
  10: "col-start-10",
  11: "col-start-11",
  12: "col-start-12",
};

export type Breakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl";
export type ResponsiveColumns =
  | number
  | Partial<Record<Breakpoint, number>>;

const gridGap = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
  "2xl": "gap-10",
} as const;

const bpColsMap: Record<Breakpoint, Record<number, string>> = {
  base: colsBase,
  sm: colsSm,
  md: colsMd,
  lg: colsLg,
  xl: colsXl,
  "2xl": cols2xl,
};

function resolveColumns(
  columns: ResponsiveColumns,
  responsive?: boolean
): string {
  if (typeof columns === "number") {
    if (responsive) {
      return cn("grid-cols-1", colsSm[columns] ?? "");
    }
    return colsBase[columns] ?? "";
  }
  return Object.entries(columns)
    .map(([bp, val]) => {
      const map = bpColsMap[bp as Breakpoint];
      return map ? map[val as number] ?? "" : "";
    })
    .filter(Boolean)
    .join(" ");
}

export interface GridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<VariantProps<typeof gridVariants>, "gap"> {
  as?: React.ElementType;
  columns?: ResponsiveColumns;
  gap?: keyof typeof gridGap;
  responsive?: boolean;
}

const gridVariants = cva("grid", {
  variants: {
    gap: gridGap,
  },
  defaultVariants: {
    gap: "md",
  },
});

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  (
    {
      className,
      as: Comp = "div",
      columns = 1,
      gap = "md",
      responsive = false,
      ...props
    },
    ref
  ) => {
    const Element = Comp as React.ElementType;
    const colClasses = resolveColumns(columns, responsive);
    return (
      <Element
        ref={ref}
        className={cn(gridVariants({ gap }), colClasses, className)}
        {...props}
      />
    );
  }
);
Grid.displayName = "Grid";

export interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const Row = React.forwardRef<HTMLDivElement, RowProps>(
  ({ className, as: Comp = "div", ...props }, ref) => {
    const Element = Comp as React.ElementType;
    return (
      <Element
        ref={ref}
        className={cn("flex flex-wrap items-center gap-3", className)}
        {...props}
      />
    );
  }
);
Row.displayName = "Row";

export interface ColProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
  span?: number;
  start?: number;
}

export const Col = React.forwardRef<HTMLDivElement, ColProps>(
  ({ className, as: Comp = "div", span, start, ...props }, ref) => {
    const Element = Comp as React.ElementType;
    return (
      <Element
        ref={ref}
        className={cn(
          span != null && spanMap[span] != null && spanMap[span],
          start != null && colStartMap[start] != null && colStartMap[start],
          className
        )}
        {...props}
      />
    );
  }
);
Col.displayName = "Col";

export {
  gridVariants,
  gridGap,
  colsBase,
  colsSm,
  colsMd,
  colsLg,
  colsXl,
  cols2xl,
  spanMap,
  colStartMap,
};
