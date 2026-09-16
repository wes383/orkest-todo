import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tagVariants = cva(
  "inline-flex items-center rounded-sm text-xs px-2 py-0.5 font-mono",
  {
    variants: {
      variant: {
        default: "bg-hover-bg-strong text-foreground-muted",
        solid: "bg-accent text-accent-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span ref={ref} className={cn(tagVariants({ variant, className }))} {...props} />
    );
  }
);
Tag.displayName = "Tag";

export { tagVariants };
