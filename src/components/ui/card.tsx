import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/** Padding density tiers shared by Card, CardHeader, CardContent and CardFooter. */
export type CardDensity = Density;

const cardHeaderVariants = cva("flex flex-col", {
  variants: {
    density: {
      compact: "gap-1 p-4",
      default: "gap-1.5 p-5",
      comfortable: "gap-2 p-6",
    },
  },
  defaultVariants: { density: "default" },
});

const cardSectionVariants = cva("", {
  variants: {
    density: {
      compact: "p-4 pt-0",
      default: "p-5 pt-0",
      comfortable: "p-6 pt-0",
    },
  },
  defaultVariants: { density: "default" },
});

/**
 * Propagates the density set on `<Card>` down to its sections, so only the
 * card root needs the prop.
 */
const CardDensityContext = React.createContext<CardDensity>("default");

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  hoverable?: boolean;
  /** Padding density. Falls back to the surrounding density, then to "default". */
  density?: CardDensity;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild = false, hoverable = false, density, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    const globalDensity = useDensity();
    const resolvedDensity = density ?? globalDensity;
    return (
      <CardDensityContext.Provider value={resolvedDensity}>
        <Comp
          ref={ref}
          className={cn(
            "rounded-lg border border-border bg-surface text-foreground transition-colors duration-base ease-out",
            hoverable && "hover:border-border-strong",
            className
          )}
          {...props}
        />
      </CardDensityContext.Provider>
    );
  }
);
Card.displayName = "Card";

export interface CardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Pick<VariantProps<typeof cardHeaderVariants>, "density"> {
  asChild?: boolean;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, asChild = false, density, ...props }, ref) => {
    const ctx = React.useContext(CardDensityContext);
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(cardHeaderVariants({ density: density ?? ctx, className }))}
        {...props}
      />
    );
  }
);
CardHeader.displayName = "CardHeader";

export interface CardTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  asChild?: boolean;
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "h3";
    return (
      <Comp
        ref={ref}
        className={cn(
          "font-display text-lg font-semibold leading-tight tracking-tight",
          className
        )}
        {...props}
      />
    );
  }
);
CardTitle.displayName = "CardTitle";

export interface CardDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  asChild?: boolean;
}

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "p";
  return (
    <Comp
      ref={ref}
      className={cn("text-sm text-foreground-muted", className)}
      {...props}
    />
  );
});
CardDescription.displayName = "CardDescription";

export interface CardActionProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const CardAction = React.forwardRef<HTMLDivElement, CardActionProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn("ml-auto self-start", className)}
        {...props}
      />
    );
  }
);
CardAction.displayName = "CardAction";

export interface CardContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Pick<VariantProps<typeof cardSectionVariants>, "density"> {
  asChild?: boolean;
}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, asChild = false, density, ...props }, ref) => {
    const ctx = React.useContext(CardDensityContext);
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(cardSectionVariants({ density: density ?? ctx, className }))}
        {...props}
      />
    );
  }
);
CardContent.displayName = "CardContent";

export interface CardFooterProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Pick<VariantProps<typeof cardSectionVariants>, "density"> {
  asChild?: boolean;
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, asChild = false, density, ...props }, ref) => {
    const ctx = React.useContext(CardDensityContext);
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(
          "flex items-center",
          cardSectionVariants({ density: density ?? ctx, className })
        )}
        {...props}
      />
    );
  }
);
CardFooter.displayName = "CardFooter";
