"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import type { ToastT } from "sonner";
import { CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { useAppTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export const toastVariants = {
  success: {
    icon: CheckCircle2,
    classes: "border-green-border text-green",
  },
  error: {
    icon: XCircle,
    classes: "border-red-border text-red",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-orange-border text-orange",
  },
  info: {
    icon: Info,
    classes: "border-blue-border text-blue",
  },
} as const;

export type ToastVariant = keyof typeof toastVariants;

/**
 * Shared Orkest-themed classNames applied to every toast (base + variants),
 * so triggered toasts match the static preview in the demo page.
 *
 * Note: Sonner injects `:where([data-sonner-toast]) :where([data-button])`
 * inline styles for action/cancel buttons (background, color, border-radius,
 * height, padding). To override them reliably we use Tailwind's `!` important
 * modifier so our classes win specificity over Sonner's injected styles.
 */
const sharedToastClassNames = {
  /**
   * The right gutter is reserved for the inset close button (see closeButton),
   * so long text and action buttons never run underneath it.
   *
   * Sonner's own defaults are `padding: 16px` and a close button pinned to the
   * top-left corner; every value below wins because Sonner wraps its rules in
   * `:where()`, which carries zero specificity.
   */
  toast:
    "group bg-surface text-foreground border border-border rounded-lg shadow-pop py-3.5 pl-3.5 pr-12 font-sans",
  title: "text-sm font-semibold",
  description: "text-xs text-foreground-muted",
  actionButton:
    "!bg-accent !text-accent-fg !rounded-full !h-8 !px-3 !text-xs !font-medium hover:!bg-accent-hover",
  cancelButton:
    "!bg-surface !border !border-border !text-foreground !rounded-full !h-8 !px-3 !text-xs !font-medium hover:!bg-hover-bg",
  /**
   * Sonner hangs the close button off the top-left corner (LTR: `left: 0` plus
   * `translate(-35%, -35%)`), where it collides with the leading status icon and
   * straddles the card border. Keep it inside the card instead — right edge,
   * vertically centered — and style it after `Dialog`'s close button: a 32px
   * rounded square with a 16px glyph, no background until hover.
   *
   * The geometry overrides (size, radius, offsets, transform) need no `!`
   * because Sonner declares them inside `:where()`, i.e. at zero specificity.
   * The background does: Sonner sets it on `[data-sonner-toast] [data-close-button]`
   * (0-2-0) plus dark-theme (0-3-0) and hover (0-4-0) variants, all of which
   * outrank a plain utility.
   *
   * `left-auto` is required: `left: 0` is set as well, and for an over-constrained
   * absolutely positioned box the left offset wins over the right one.
   */
  closeButton:
    "absolute right-2 top-1/2 left-auto inline-flex h-8 w-8 items-center justify-center rounded-md border-0 text-foreground-muted hover:text-foreground transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring !bg-transparent hover:!bg-hover-bg [&>svg]:h-4 [&>svg]:w-4 [--toast-close-button-transform:translateY(-50%)]",
};

/** Sonner's `toast` function with Orkest theme baked in. */
export const toast = Object.assign(
  (message: string, opts?: Parameters<typeof sonnerToast>[1]) =>
    sonnerToast(message, {
      ...opts,
      classNames: {
        ...sharedToastClassNames,
        ...opts?.classNames,
      },
    }),
  {
    success: (msg: string, opts?: Parameters<typeof sonnerToast.success>[1]) =>
      sonnerToast.success(msg, {
        icon: React.createElement(CheckCircle2, {
          className: "h-4 w-4 text-green",
        }),
        ...opts,
        classNames: {
          ...sharedToastClassNames,
          ...opts?.classNames,
        },
      }),
    error: (msg: string, opts?: Parameters<typeof sonnerToast.error>[1]) =>
      sonnerToast.error(msg, {
        icon: React.createElement(XCircle, { className: "h-4 w-4 text-red" }),
        ...opts,
        classNames: {
          ...sharedToastClassNames,
          ...opts?.classNames,
        },
      }),
    warning: (msg: string, opts?: Parameters<typeof sonnerToast.warning>[1]) =>
      sonnerToast.warning(msg, {
        icon: React.createElement(AlertTriangle, {
          className: "h-4 w-4 text-orange",
        }),
        ...opts,
        classNames: {
          ...sharedToastClassNames,
          ...opts?.classNames,
        },
      }),
    info: (msg: string, opts?: Parameters<typeof sonnerToast.info>[1]) =>
      sonnerToast.info(msg, {
        icon: React.createElement(Info, { className: "h-4 w-4 text-blue" }),
        ...opts,
        classNames: {
          ...sharedToastClassNames,
          ...opts?.classNames,
        },
      }),
    message: sonnerToast.message,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
    loading: sonnerToast.loading,
  }
);

export interface ToasterProps
  extends React.ComponentProps<typeof SonnerToaster> {}

/**
 * Toaster — follows the app theme (light / dark / high-contrast).
 *
 * - `theme` is driven by `useAppTheme().resolvedTheme` to avoid Sonner using the
 *   system preference, which would disagree with the dark class actually rendered by next-themes.
 * - In high-contrast mode a `high-contrast` class is appended so toasts automatically
 *   get stronger borders / contrast via CSS variables.
 */
export const Toaster: React.FC<ToasterProps> = ({ className, ...props }) => {
  const { resolvedTheme, highContrast } = useAppTheme();
  return (
    <SonnerToaster
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      richColors={false}
      closeButton
      className={cn("toaster font-sans", highContrast && "high-contrast", className)}
      toastOptions={{
        classNames: sharedToastClassNames,
      }}
      {...props}
    />
  );
};
Toaster.displayName = "Toaster";

export { SonnerToaster, ToastT };
