import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, children, onRemove, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-hover-bg text-sm text-foreground py-1",
          onRemove ? "pl-3 pr-2" : "px-3",
          className
        )}
        {...props}
      >
        {children}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-hover-bg-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }
);
Chip.displayName = "Chip";
