"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

/** Density tiers shared by SelectContent and its items. */
export type SelectDensity = Density;

/**
 * Propagates the density set on `<SelectContent>` down to the items so only the
 * panel needs the prop.
 */
const SelectDensityContext = React.createContext<SelectDensity>("default");

const selectTriggerVariants = cva(
  /* The strong border is a *keyboard* cue: Radix hands focus back to the
     trigger after every selection, and a plain `focus:` would repaint the
     border on that restored focus — a ring mouse users never asked for. */
  "flex w-full items-center justify-between border border-border bg-surface text-foreground placeholder:text-foreground-subtle focus:outline-none focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-base [&>span]:line-clamp-1 [&>span]:text-left",
  {
    variants: {
      size: {
        // Radius is part of the size tier so the h-8 compact trigger stays a
        // rounded rect instead of collapsing into a capsule.
        xs: "h-8 gap-1.5 px-2.5 py-1 text-xs rounded-md",
        sm: "h-10 gap-2 px-3 py-2 text-sm rounded-lg",
        md: "h-12 gap-2 px-4 py-2 text-sm rounded-lg",
        lg: "h-14 gap-2 px-5 py-2.5 text-base rounded-lg",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {
  /** Hide the trigger's own chevron. The trigger is a heading wearing a
      dropdown's behaviour — the caret would read as decoration on a line
      whose words already say it opens a menu. Naming it costs nothing:
      `aria-expanded` etc. still come from Radix. */
  hideChevron?: boolean;
}

/** Size used when no explicit `size` is given, derived from the global density. */
const SELECT_TRIGGER_SIZE_FOR_DENSITY: Record<
  Density,
  NonNullable<VariantProps<typeof selectTriggerVariants>["size"]>
> = {
  compact: "xs",
  default: "md",
  comfortable: "lg",
};

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, size, children, hideChevron = false, ...props }, ref) => {
  const globalDensity = useDensity();
  const resolvedSize = size ?? SELECT_TRIGGER_SIZE_FOR_DENSITY[globalDensity];
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(selectTriggerVariants({ size: resolvedSize, className }))}
      {...props}
    >
      {children}
      {!hideChevron && (
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
});
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

export interface SelectContentProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> {
  /** Row density applied to all items in this panel. Defaults to the surrounding density. */
  density?: SelectDensity;
  /**
   * Drop Radix's stepped scroll buttons in favour of the theme's own
   * scrollbar: the chevrons page through the list like a microwave's timer
   * buttons, and never say how long the list is. The viewport the buttons
   * used to flank keeps scrolling on the wheel — a scrollbar just reads
   * its place back.
   */
  nativeScroll?: boolean;
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, density, children, position = "popper", nativeScroll = false, onCloseAutoFocus, onPointerDown, ...props }, ref) => {
  const globalDensity = useDensity();
  const resolvedDensity = density ?? globalDensity;
  const compact = resolvedDensity === "compact";
  /* A pointerdown anywhere in the panel — an item, its scrollbar — marks the
     close that follows as a mouse close. */
  const pointerDownRef = React.useRef(false);
  return (
    <SelectPrimitive.Portal>
      <SelectDensityContext.Provider value={resolvedDensity}>
        <SelectPrimitive.Content
          ref={ref}
          className={cn(
            "relative max-h-80 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-surface text-foreground shadow-pop",
            compact ? "p-0.5" : "p-1",
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
          onPointerDownCapture={(event) => {
            pointerDownRef.current = true;
            onPointerDown?.(event);
          }}
          onCloseAutoFocus={(event) => {
            /*
             * Radix hands focus back to the trigger on close, and Chromium
             * marks that restored focus `:focus-visible` — so a mouse
             * selection painted the app's global focus outline as a ring
             * around the trigger it had just left. A pointer close skips the
             * restore (the pointer is its own continuity); a keyboard close
             * keeps it, since that outline is the keyboard's indicator.
             * `preventDefault` stops Radix's own trigger focus — its
             * composeEventHandlers checks the flag.
             */
            const pointerClosed = pointerDownRef.current;
            pointerDownRef.current = false;
            if (pointerClosed) event.preventDefault();
            onCloseAutoFocus?.(event);
          }}
          {...props}
        >
          {!nativeScroll && <SelectScrollUpButton />}
          <SelectPrimitive.Viewport
            className={cn(
              compact ? "p-0.5" : "p-1",
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
      </SelectDensityContext.Provider>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

export interface SelectLabelProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label> {
  /** Overrides the density inherited from `<SelectContent>`. */
  density?: SelectDensity;
}

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  SelectLabelProps
>(({ className, density, ...props }, ref) => {
  const ctx = React.useContext(SelectDensityContext);
  const compact = (density ?? ctx) === "compact";
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        "text-xs font-medium text-foreground-subtle",
        compact ? "py-1 pl-8 pr-2" : "py-1.5 pl-9 pr-2",
        className
      )}
      {...props}
    />
  );
});
SelectLabel.displayName = SelectPrimitive.Label.displayName;

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  /** Overrides the density inherited from `<SelectContent>`. */
  density?: SelectDensity;
  /**
   * Drop the check column, for menus whose trigger is a heading read at a
   * glance rather than a form field — the calendar's month and year. The
   * row in force still wears the weight Radix puts on it
   * (`data-[state=checked]:font-medium`), and the gutter the check held
   * open (`pl-9`) goes back to the text.
   */
  hideIndicator?: boolean;
}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, density, children, hideIndicator = false, ...props }, ref) => {
  const ctx = React.useContext(SelectDensityContext);
  const compact = (density ?? ctx) === "compact";
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md text-foreground outline-none data-[highlighted]:bg-hover-bg data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-colors",
        compact
          ? hideIndicator
            ? "py-1.5 pl-2.5 pr-2 text-xs"
            : "py-1.5 pl-8 pr-2 text-xs"
          : hideIndicator
          ? "py-2 pl-3 pr-3 text-sm"
          : "py-2 pl-9 pr-3 text-sm",
        className
      )}
      {...props}
    >
      {!hideIndicator && (
        <span
          className={cn(
            "absolute flex h-3.5 w-3.5 items-center justify-center",
            compact ? "left-2.5" : "left-3"
          )}
        >
          <SelectPrimitive.ItemIndicator>
            <Check
              className={cn("text-accent", compact ? "h-3.5 w-3.5" : "h-4 w-4")}
              strokeWidth={3}
              aria-hidden="true"
            />
          </SelectPrimitive.ItemIndicator>
        </span>
      )}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
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
