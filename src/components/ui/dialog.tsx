"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

export interface DialogOverlayProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> {}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  DialogOverlayProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-modal bg-overlay backdrop-blur-sm animate-fade-in",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showClose?: boolean;
  /** aria-label for the close button. */
  closeLabel?: string;
}

/**
 * `relative` on the content is load-bearing, not decoration.
 *
 * The close button below is `absolute`, and with no positioned ancestor it
 * resolves against the `fixed inset-0` wrapper — the viewport — so the ✕ lands
 * in the window's top-right corner instead of on the dialog. What hides that is
 * `animate-fade-slide-in`: a transform makes the content a containing block, so
 * for the 200 ms the animation runs the button is where it belongs, and the
 * moment the animation ends it jumps to the corner.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showClose = true, closeLabel = "Close", ...props }, ref) => (
  <DialogPortal>
    {/* Overlay and Content are siblings under Portal per Radix recommended
        structure, avoiding animation / focus-trap / pointer-events ordering issues. */}
    <DialogOverlay />
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-dialog animate-fade-slide-in p-0 focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted hover:bg-hover-bg hover:text-foreground transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export interface DialogHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const DialogHeader = React.forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-7 pb-2", className)}
      {...props}
    />
  )
);
DialogHeader.displayName = "DialogHeader";

export interface DialogFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const DialogFooter = React.forwardRef<HTMLDivElement, DialogFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex justify-end gap-2 p-5 border-t border-border",
        className
      )}
      {...props}
    />
  )
);
DialogFooter.displayName = "DialogFooter";

export interface DialogTitleProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  DialogTitleProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-display text-2xl font-semibold tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export interface DialogDescriptionProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> {}

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-foreground-muted mt-1", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPrimitive,
};
