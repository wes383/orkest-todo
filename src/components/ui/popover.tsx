"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /**
   * Optional Portal target. Use this for content that must stay inside a
   * scroll-locked parent, such as a Dialog.
   */
  container?: HTMLElement | null;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 8, container, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "w-72 outline-none bg-surface border border-border rounded-lg shadow-pop p-4",
        // Use Radix data-state + CSS transition for enter/exit animation.
        // Keyframe animations are avoided because their transform conflicts with
        // Radix's transform-based content positioning, causing position glitches on open.
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-none",
        // !important: override z-popover (50) when rendered inside a Dialog
        // (z-modal=60) so the popover content appears above the modal.
        "!z-[100]",
        className
      )}
      /**
       * Prevent Radix from programmatically returning focus to the Trigger on close,
       * avoiding :focus-visible state being inherited from inner elements to the
       * Trigger which would leave a lingering focus ring.
       * See dropdown-menu.tsx for the same issue.
       */
      onCloseAutoFocus={(e) => e.preventDefault()}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
