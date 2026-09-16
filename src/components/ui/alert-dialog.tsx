"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

export interface AlertDialogOverlayProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay> {}

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  AlertDialogOverlayProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-modal bg-overlay backdrop-blur-sm animate-fade-in",
      className
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

export interface AlertDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> {}

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "w-full max-w-md bg-surface border border-border rounded-lg shadow-dialog animate-fade-slide-in p-0 focus:outline-none",
          className
        )}
        {...props}
      />
    </div>
  </AlertDialogPortal>
));
AlertDialogContent.displayName = "AlertDialogContent";

export interface AlertDialogHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const AlertDialogHeader = React.forwardRef<
  HTMLDivElement,
  AlertDialogHeaderProps
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pb-2", className)} {...props} />
));
AlertDialogHeader.displayName = "AlertDialogHeader";

export interface AlertDialogFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const AlertDialogFooter = React.forwardRef<
  HTMLDivElement,
  AlertDialogFooterProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex justify-end gap-2 p-5 pt-3", className)}
    {...props}
  />
));
AlertDialogFooter.displayName = "AlertDialogFooter";

export interface AlertDialogTitleProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title> {}

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  AlertDialogTitleProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-display text-lg font-semibold tracking-tight",
      className
    )}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

export interface AlertDialogDescriptionProps
  extends React.ComponentPropsWithoutRef<
    typeof AlertDialogPrimitive.Description
  > {}

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  AlertDialogDescriptionProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-foreground-muted mt-1.5", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

export interface AlertDialogActionProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> {
  destructive?: boolean;
}

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  AlertDialogActionProps
>(({ className, destructive = false, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium leading-none select-none transition-all duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
      "h-9 px-4 text-sm",
      destructive
        ? "bg-red text-white hover:bg-red-fg"
        : "bg-accent text-accent-fg hover:bg-accent-hover",
      className
    )}
    {...props}
  />
));
AlertDialogAction.displayName = "AlertDialogAction";

export interface AlertDialogCancelProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> {}

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  AlertDialogCancelProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium leading-none select-none transition-all duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
      "h-9 px-4 text-sm bg-surface text-foreground border border-border hover:bg-hover-bg",
      className
    )}
    {...props}
  />
));
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogPrimitive,
};
