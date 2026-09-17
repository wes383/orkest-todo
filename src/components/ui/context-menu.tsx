"use client";

import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ContextMenu root wrapper. Defaults `modal` to `false`, matching the
 * DropdownMenu wrapper: a right-click menu must not scroll-lock the page, and
 * the same `scrollbar-gutter: stable` layout shift applies.
 */
function ContextMenu({
  modal = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root modal={modal} {...props} />;
}
ContextMenu.displayName = "ContextMenu";

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;

export interface ContextMenuSubTriggerProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> {
  inset?: boolean;
}

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  ContextMenuSubTriggerProps
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none",
      "data-[highlighted]:bg-hover-bg data-[state=open]:bg-hover-bg",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4 text-foreground-subtle" />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

export interface ContextMenuSubContentProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent> {}

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  ContextMenuSubContentProps
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-dropdown min-w-48 overflow-hidden bg-surface border border-border rounded-lg shadow-pop p-1",
      /*
       * Submenus are the ones that grow with the data — every tag, every
       * priority — so they get a ceiling and scroll. `overflow-y-auto` after
       * `overflow-hidden` keeps the x axis clipped while the y axis scrolls
       * (tailwind-merge resolves the pair that way), which preserves the
       * rounded corners against a horizontal blowout.
       */
      "max-h-72 overflow-y-auto",
      // Use Radix data-state + CSS transition for enter/exit animation.
      // Avoid keyframe animations because their transform conflicts with
      // Radix's transform-based content positioning, causing misplacement on open.
      "data-[state=open]:animate-fade-in data-[state=closed]:animate-none",
      className
    )}
    {...props}
  />
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

export interface ContextMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> {
  /** Optional Portal target for menus used inside scroll-locked overlays. */
  container?: HTMLElement | null;
}

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  ContextMenuContentProps
>(({ className, container, ...props }, ref) => (
  <ContextMenuPrimitive.Portal container={container ?? undefined}>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        "z-dropdown min-w-48 overflow-hidden bg-surface border border-border rounded-lg shadow-pop p-1",
        // Use Radix data-state + CSS transition for enter/exit animation.
        // Avoid keyframe animations because their transform conflicts with
        // Radix's transform-based content positioning, causing misplacement on open.
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-none",
        className
      )}
      /**
       * Prevents Radix from programmatically returning focus to the Trigger on
       * close — the same reasoning as the DropdownMenu wrapper: menu items are
       * keyboard-reachable, so focus falling back to the trigger would drag
       * :focus-visible with it and leave a ring painted on the row.
       */
      onCloseAutoFocus={(e) => e.preventDefault()}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

export interface ContextMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> {
  inset?: boolean;
  variant?: "default" | "destructive";
}

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  ContextMenuItemProps
>(({ className, inset, variant = "default", ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    data-variant={variant}
    className={cn(
      "relative flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer select-none outline-none transition-colors",
      "data-[highlighted]:bg-hover-bg",
      "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
      "focus:bg-hover-bg",
      inset && "pl-8",
      "data-[variant=destructive]:text-red data-[variant=destructive]:data-[highlighted]:bg-red-soft",
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName = "ContextMenuItem";

export interface ContextMenuLabelProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> {
  inset?: boolean;
}

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  ContextMenuLabelProps
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-3 py-1.5 text-xs font-medium tracking-wide text-foreground-muted",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

export interface ContextMenuSeparatorProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator> {}

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  ContextMenuSeparatorProps
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn("h-px bg-border my-1", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuPrimitive,
};
