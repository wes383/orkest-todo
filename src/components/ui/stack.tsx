import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const stackGap = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-6",
  "2xl": "gap-8",
} as const;

const stackAlign = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

export interface StackProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {
  as?: React.ElementType;
  gap?: keyof typeof stackGap;
  align?: keyof typeof stackAlign;
  divider?: React.ReactNode;
}

const stackVariants = cva("flex flex-col", {
  variants: {
    gap: stackGap,
    align: stackAlign,
  },
  defaultVariants: {
    gap: "md",
    align: "stretch",
  },
});

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  (
    { className, as: Comp = "div", gap, align, divider, children, ...props },
    ref
  ) => {
    const Element = Comp as React.ElementType;

    if (divider) {
      const items = React.Children.toArray(children).filter(Boolean);
      return (
        <Element
          ref={ref}
          className={cn(stackVariants({ gap, align, className }))}
          {...props}
        >
          {items.map((child, i) => (
            <React.Fragment key={i}>
              {child}
              {i < items.length - 1 && divider}
            </React.Fragment>
          ))}
        </Element>
      );
    }

    return (
      <Element
        ref={ref}
        className={cn(stackVariants({ gap, align, className }))}
        {...props}
      >
        {children}
      </Element>
    );
  }
);
Stack.displayName = "Stack";

export { stackVariants, stackGap, stackAlign };
