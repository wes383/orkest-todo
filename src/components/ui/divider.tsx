import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const dividerVariants = cva("bg-border", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px h-full",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export interface DividerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "role">,
    VariantProps<typeof dividerVariants> {
  label?: React.ReactNode;
}

export const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, orientation = "horizontal", label, ...props }, ref) => {
    if (label && orientation !== "vertical") {
      return (
        <div
          ref={ref}
          role="separator"
          className={cn("flex w-full items-center", className)}
          {...props}
        >
          <span className="h-px flex-1 bg-border" />
          <span className="px-3 text-xs text-foreground-muted">{label}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    }
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
        className={cn(dividerVariants({ orientation, className }))}
        {...props}
      />
    );
  }
);
Divider.displayName = "Divider";
