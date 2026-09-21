"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    /** Hide the trigger's own chevron. The trigger is a heading wearing a
        dropdown's behaviour — the caret would read as decoration on a line
        whose words already say it opens a menu. Naming it costs nothing:
        `aria-expanded` etc. still come from Radix. */
    hideChevron?: boolean;
  }
>(({ className, children, hideChevron = false, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-base [&>span]:line-clamp-1 [&>span]:text-left",
      className
    )}
    {...props}
  >
    {children}
    {!hideChevron && (
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
      </SelectPrimitive.Icon>
    )}
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-foreground-subtle",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" aria-hidden="true" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-foreground-subtle",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" aria-hidden="true" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    /**
     * Drop Radix's stepped scroll buttons in favour of the theme's own
     * scrollbar: the chevrons page through the list like a microwave's timer
     * buttons, and never say how long the list is. The viewport the buttons
     * used to flank keeps scrolling on the wheel — a scrollbar just reads
     * its place back.
     */
    nativeScroll?: boolean;
  }
>(({ className, children, position = "popper", nativeScroll = false, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative max-h-80 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-surface text-foreground shadow-pop p-1",
        // Use Radix data-state to drive a pure opacity animation.
        // Keyframe animations (with translateY) + data-[side]:translate-y-1 are avoided
        // because CSS transform overrides Radix's transform-based content positioning,
        // causing position glitches on open (content starts flush against the trigger
        // then shifts down to its correct position).
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-none",
        // !important: override z-dropdown (40) when rendered inside a Dialog
        // (z-modal=60) so the select content appears above the modal.
        "!z-[100]",
        className
      )}
      position={position}
      sideOffset={4}
      {...props}
    >
      {!nativeScroll && <SelectScrollUpButton />}
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          // Radix hides its own viewport's scrollbar in a runtime <style>;
          // this class is the selector `globals.css` answers it with.
          nativeScroll && "calendar-select-scroll"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      {!nativeScroll && <SelectScrollDownButton />}
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "py-1.5 pl-9 pr-2 text-xs font-medium text-foreground-subtle",
      className
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    /**
     * Drop the check column, for menus whose trigger is a heading read at a
     * glance rather than a form field — the calendar's month and year. The
     * row in force still wears the weight Radix puts on it
     * (`data-[state=checked]:font-medium`), and the gutter the check held
     * open (`pl-9`) goes back to the text.
     */
    hideIndicator?: boolean;
  }
>(({ className, children, hideIndicator = false, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-md py-2 pr-3 text-sm text-foreground outline-none data-[highlighted]:bg-hover-bg data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-colors",
      hideIndicator ? "pl-3" : "pl-9",
      className
    )}
    {...props}
  >
    {!hideIndicator && (
      <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check
            className="h-4 w-4 text-accent"
            strokeWidth={3}
            aria-hidden="true"
          />
        </SelectPrimitive.ItemIndicator>
      </span>
    )}
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
