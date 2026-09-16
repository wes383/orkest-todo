import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild = false, hoverable = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(
          "rounded-lg border border-border bg-surface text-foreground transition-colors duration-base ease-out",
          hoverable && "hover:border-border-strong",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn("flex flex-col gap-1.5 p-5", className)}
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

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn("p-5 pt-0", className)}
        {...props}
      />
    );
  }
);
CardContent.displayName = "CardContent";

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn("flex items-center p-5 pt-0", className)}
        {...props}
      />
    );
  }
);
CardFooter.displayName = "CardFooter";
