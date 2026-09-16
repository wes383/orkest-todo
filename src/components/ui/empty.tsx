import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-lg bg-surface/60",
          className
        )}
        {...props}
      />
    );
  }
);
Empty.displayName = "Empty";

export interface EmptyIconProps extends React.HTMLAttributes<HTMLDivElement> {}

export const EmptyIcon = React.forwardRef<HTMLDivElement, EmptyIconProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "h-10 w-10 text-foreground-faint mb-4 flex items-center justify-center",
          className
        )}
        {...props}
      />
    );
  }
);
EmptyIcon.displayName = "EmptyIcon";

export interface EmptyTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {}

export const EmptyTitle = React.forwardRef<
  HTMLHeadingElement,
  EmptyTitleProps
>(({ className, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      className={cn("font-display text-lg font-semibold", className)}
      {...props}
    />
  );
});
EmptyTitle.displayName = "EmptyTitle";

export interface EmptyDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  EmptyDescriptionProps
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn(
        "text-sm text-foreground-muted mt-2 mb-4",
        className
      )}
      {...props}
    />
  );
});
EmptyDescription.displayName = "EmptyDescription";

export interface EmptyActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

export const EmptyActions = React.forwardRef<
  HTMLDivElement,
  EmptyActionsProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
});
EmptyActions.displayName = "EmptyActions";
