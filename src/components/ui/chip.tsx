import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/** Density tiers for the chip pill. */
export type ChipDensity = Density;

const chipVariants = {
  compact: {
    shell: "gap-1 text-xs py-0.5",
    withRemove: "pl-2.5 pr-1.5",
    plain: "px-2.5",
    close: "h-3.5 w-3.5",
    closeIcon: "h-2.5 w-2.5",
  },
  default: {
    shell: "gap-1.5 text-sm py-1",
    withRemove: "pl-3 pr-2",
    plain: "px-3",
    close: "h-4 w-4",
    closeIcon: "h-3 w-3",
  },
  comfortable: {
    shell: "gap-1.5 text-sm py-1.5",
    withRemove: "pl-3.5 pr-2.5",
    plain: "px-3.5",
    close: "h-4 w-4",
    closeIcon: "h-3 w-3",
  },
} as const;

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
  /** Chip density. Falls back to the surrounding density. */
  density?: ChipDensity;
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, children, onRemove, density, ...props }, ref) => {
    const globalDensity = useDensity();
    const sizing = chipVariants[density ?? globalDensity];
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border border-border bg-hover-bg text-foreground",
          sizing.shell,
          onRemove ? sizing.withRemove : sizing.plain,
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
            className={cn(
              "inline-flex items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-hover-bg-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              sizing.close
            )}
          >
            <X className={sizing.closeIcon} />
          </button>
        )}
      </span>
    );
  }
);
Chip.displayName = "Chip";
