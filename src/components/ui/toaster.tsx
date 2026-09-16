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
  toast:
    "group bg-surface text-foreground border border-border rounded-lg shadow-pop p-3.5 font-sans",
  title: "text-sm font-semibold",
  description: "text-xs text-foreground-muted",
  actionButton:
    "!bg-accent !text-accent-fg !rounded-full !h-8 !px-3 !text-xs !font-medium hover:!bg-accent-hover",
  cancelButton:
    "!bg-surface !border !border-border !text-foreground !rounded-full !h-8 !px-3 !text-xs !font-medium hover:!bg-hover-bg",
  closeButton:
    "text-foreground-muted hover:text-foreground hover:bg-hover-bg rounded-md",
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
