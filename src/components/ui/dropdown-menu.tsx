"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/** Row density tiers shared by DropdownMenuContent and its item components. */
export type DropdownMenuDensity = Density;

const dropdownMenuItemVariants = cva(
  "relative flex items-center rounded-md text-sm cursor-pointer select-none outline-none transition-colors",
  {
    variants: {
      density: {
        compact: "gap-2 px-2 py-1.5",
        default: "gap-2 px-3 py-2",
        comfortable: "gap-2 px-3 py-2.5",
      },
    },
    defaultVariants: { density: "default" },
  }
);

const dropdownMenuCheckItemVariants = cva(
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md text-sm outline-none transition-colors",
  {
    variants: {
      density: {
        compact: "py-1.5 pl-8 pr-2",
        default: "py-2 pl-8 pr-3",
        comfortable: "py-2.5 pl-8 pr-3",
      },
    },
    defaultVariants: { density: "default" },
  }
);

const dropdownMenuLabelVariants = cva(
  "text-xs font-medium tracking-wide text-foreground-muted",
  {
    variants: {
      density: {
        compact: "px-2 py-1",
        default: "px-3 py-1.5",
        comfortable: "px-3 py-2",
      },
    },
    defaultVariants: { density: "default" },
  }
);

const dropdownMenuSubTriggerVariants = cva(
  "flex cursor-default select-none items-center gap-2 rounded-md text-sm outline-none",
  {
    variants: {
      density: {
        compact: "px-2 py-1.5",
        default: "px-3 py-2",
        comfortable: "px-3 py-2.5",
      },
    },
    defaultVariants: { density: "default" },
  }
);

/**
 * Propagates the density set on `<DropdownMenuContent>` down to its items, so
 * only the content root needs the prop.
 */
const DropdownMenuDensityContext =
  React.createContext<DropdownMenuDensity>("default");

/**
 * DropdownMenu root wrapper. Defaults `modal` to `false` to prevent scroll lock,
 * which would otherwise cause a layout shift (page shake) due to the
 * `padding-right` compensation conflicting with `scrollbar-gutter: stable`
 * on the html element. Dropdowns don't need modal focus trapping.
 */
function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={modal} {...props} />;
}
DropdownMenu.displayName = "DropdownMenu";

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export interface DropdownMenuSubTriggerProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>,
    Pick<VariantProps<typeof dropdownMenuSubTriggerVariants>, "density"> {
  inset?: boolean;
}

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  DropdownMenuSubTriggerProps
>(({ className, inset, density, children, ...props }, ref) => {
  const ctx = React.useContext(DropdownMenuDensityContext);
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        dropdownMenuSubTriggerVariants({ density: density ?? ctx }),
        "data-[highlighted]:bg-hover-bg data-[state=open]:bg-hover-bg",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4 text-foreground-subtle" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export interface DropdownMenuSubContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> {}

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  DropdownMenuSubContentProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-dropdown min-w-48 overflow-hidden bg-surface border border-border rounded-lg shadow-pop p-1",
      // Same ceiling as the ContextMenu twin: submenus grow with the data
      // (tags, priorities) and must scroll rather than run off-screen.
      // `overflow-y-auto` keeps the x axis clipped while y scrolls.
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
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
  /** Optional Portal target for menus used inside scroll-locked overlays. */
  container?: HTMLElement | null;
  /** Row density applied to all items in this menu. Falls back to the surrounding density. */
  density?: DropdownMenuDensity;
}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, sideOffset = 6, container, density, ...props }, ref) => {
  const globalDensity = useDensity();
  const resolvedDensity = density ?? globalDensity;
  return (
    <DropdownMenuPrimitive.Portal container={container ?? undefined}>
      <DropdownMenuDensityContext.Provider value={resolvedDensity}>
        <DropdownMenuPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          className={cn(
            "z-dropdown min-w-48 overflow-hidden bg-surface border border-border rounded-lg shadow-pop p-1",
            // Use Radix data-state + CSS transition for enter/exit animation.
            // Avoid keyframe animations because their transform conflicts with
            // Radix's transform-based content positioning, causing misplacement on open.
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-none",
            className
          )}
          /**
           * Prevents Radix from programmatically returning focus to the Trigger on close.
           *
           * Otherwise, per the HTML spec, when script calls .focus() the new focus
           * element's :focus-visible state is inherited from the previous focus
           * element (the menu item). Since menu items are keyboard-reachable, the
           * browser considers them in :focus-visible — so the Trigger also gets
           * :focus-visible, leaving the Button base class's focus-visible:ring-2
           * lingering on the button edge after the menu closes.
           *
           * For DropdownMenu (not Select), focus falling to body on close is an
           * acceptable trade-off: mouse users selecting an item don't need focus
           * restored; keyboard users can Tab back to the Trigger after pressing Esc.
           * If a specific scenario needs focus return preserved (e.g. Select /
           * Combobox), override this handler at the call site.
           */
          onCloseAutoFocus={(e) => e.preventDefault()}
          {...props}
        />
      </DropdownMenuDensityContext.Provider>
    </DropdownMenuPrimitive.Portal>
  );
});
DropdownMenuContent.displayName = "DropdownMenuContent";

export interface DropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>,
    Pick<VariantProps<typeof dropdownMenuItemVariants>, "density"> {
  inset?: boolean;
  variant?: "default" | "destructive";
}

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, inset, variant = "default", density, ...props }, ref) => {
  const ctx = React.useContext(DropdownMenuDensityContext);
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-variant={variant}
      className={cn(
        dropdownMenuItemVariants({ density: density ?? ctx }),
        "data-[highlighted]:bg-hover-bg",
        "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
        "focus:bg-hover-bg",
        inset && "pl-8",
        "data-[variant=destructive]:text-red data-[variant=destructive]:data-[highlighted]:bg-red-soft",
        className
      )}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = "DropdownMenuItem";

export interface DropdownMenuCheckboxItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>,
    Pick<VariantProps<typeof dropdownMenuCheckItemVariants>, "density"> {}

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(({ className, children, checked, density, ...props }, ref) => {
  const ctx = React.useContext(DropdownMenuDensityContext);
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      className={cn(
        dropdownMenuCheckItemVariants({ density: density ?? ctx }),
        "data-[highlighted]:bg-hover-bg",
        "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
        className
      )}
      {...props}
    >
      <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export interface DropdownMenuRadioItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>,
    Pick<VariantProps<typeof dropdownMenuCheckItemVariants>, "density"> {}

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  DropdownMenuRadioItemProps
>(({ className, children, density, ...props }, ref) => {
  const ctx = React.useContext(DropdownMenuDensityContext);
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        dropdownMenuCheckItemVariants({ density: density ?? ctx }),
        "data-[highlighted]:bg-hover-bg",
        "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
        className
      )}
      {...props}
    >
      <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="h-2.5 w-2.5 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export interface DropdownMenuLabelProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>,
    Pick<VariantProps<typeof dropdownMenuLabelVariants>, "density"> {
  inset?: boolean;
}

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  DropdownMenuLabelProps
>(({ className, inset, density, ...props }, ref) => {
  const ctx = React.useContext(DropdownMenuDensityContext);
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        dropdownMenuLabelVariants({ density: density ?? ctx }),
        inset && "pl-8",
        className
      )}
      {...props}
    />
  );
});
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export interface DropdownMenuSeparatorProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> {}

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  DropdownMenuSeparatorProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("h-px bg-border my-1", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export interface DropdownMenuShortcutProps
  extends React.HTMLAttributes<HTMLSpanElement> {}

const DropdownMenuShortcut = React.forwardRef<
  HTMLSpanElement,
  DropdownMenuShortcutProps
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "ml-auto text-xs tracking-wide text-foreground-subtle",
      className
    )}
    {...props}
  />
));
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export interface DropdownMenuArrowProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Arrow> {}

const DropdownMenuArrow = DropdownMenuPrimitive.Arrow;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuArrow,
  DropdownMenuPrimitive,
};
