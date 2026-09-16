import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const flexGap = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-6",
  "2xl": "gap-8",
} as const;

const flexDirection = {
  row: "flex-row",
  column: "flex-col",
  "row-reverse": "flex-row-reverse",
  "column-reverse": "flex-col-reverse",
} as const;

const flexJustify = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
} as const;

const flexAlign = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

export interface FlexProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof flexVariants> {
  as?: React.ElementType;
  direction?: keyof typeof flexDirection;
  justify?: keyof typeof flexJustify;
  align?: keyof typeof flexAlign;
  wrap?: boolean;
}

const flexVariants = cva("flex", {
  variants: {
    direction: flexDirection,
    justify: flexJustify,
    align: flexAlign,
    gap: flexGap,
    wrap: {
      true: "flex-wrap",
      false: "flex-nowrap",
    },
  },
  defaultVariants: {
    direction: "row",
    align: "center",
    gap: "md",
    wrap: false,
  },
});

export const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
  (
    {
      className,
      as: Comp = "div",
      direction,
      justify,
      align,
      wrap,
      gap,
      ...props
    },
    ref
  ) => {
    const Element = Comp as React.ElementType;
    return (
      <Element
        ref={ref}
        className={cn(
          flexVariants({ direction, justify, align, wrap, gap, className })
        )}
        {...props}
      />
    );
  }
);
Flex.displayName = "Flex";

export { flexVariants, flexGap, flexDirection, flexJustify, flexAlign };
