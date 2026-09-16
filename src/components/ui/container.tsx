import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const containerVariants = cva(
  "mx-auto w-full px-4 sm:px-6 lg:px-8",
  {
    variants: {
      size: {
        sm: "max-w-3xl",
        md: "max-w-5xl",
        lg: "max-w-7xl",
        xl: "max-w-screen-xl",
        full: "max-w-none",
      },
    },
    defaultVariants: {
      size: "xl",
    },
  }
);

export interface ContainerProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof containerVariants> {
  as?: React.ElementType;
  asChild?: boolean;
}

export const Container = React.forwardRef<HTMLElement, ContainerProps>(
  ({ className, size, as: Comp = "div", asChild = false, ...props }, ref) => {
    const Element = asChild ? Slot : (Comp as React.ElementType);
    return (
      <Element
        ref={ref}
        className={cn(containerVariants({ size, className }))}
        {...props}
      />
    );
  }
);
Container.displayName = "Container";

export { containerVariants };
