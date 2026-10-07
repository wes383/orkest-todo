import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

const tagVariants = cva("inline-flex items-center rounded-sm font-mono", {
  variants: {
    variant: {
      default: "bg-hover-bg-strong text-foreground-muted",
      solid: "bg-accent text-accent-fg",
    },
    size: {
      sm: "text-[11px] px-1.5 py-px",
      md: "text-xs px-2 py-0.5",
      lg: "text-sm px-2.5 py-1",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

/** Size used when no explicit `size` is given, derived from the global density. */
const TAG_SIZE_FOR_DENSITY: Record<
  Density,
  NonNullable<VariantProps<typeof tagVariants>["size"]>
> = {
  compact: "sm",
  default: "md",
  comfortable: "lg",
};

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, variant, size, ...props }, ref) => {
    const globalDensity = useDensity();
    const resolvedSize = size ?? TAG_SIZE_FOR_DENSITY[globalDensity];
    return (
      <span
        ref={ref}
        className={cn(tagVariants({ variant, size: resolvedSize, className }))}
        {...props}
      />
    );
  }
);
Tag.displayName = "Tag";

export { tagVariants };
