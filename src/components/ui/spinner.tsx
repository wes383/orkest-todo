import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const spinnerVariants = cva(
  "inline-block rounded-full border-2 border-hover-bg-strong border-t-accent animate-spin",
  {
    variants: {
      size: {
        sm: "h-3.5 w-3.5",
        md: "h-4 w-4",
        lg: "h-6 w-6",
        xl: "h-10 w-10",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size, label = "Loading", ...props }, ref) => {
    return (
      <span
        ref={ref}
        role="status"
        aria-label={label}
        className={cn(spinnerVariants({ size, className }))}
        {...props}
      />
    );
  }
);
Spinner.displayName = "Spinner";

export { spinnerVariants };
