"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/** Density tiers shared by Tabs, TabsList, TabsTrigger and TabsContent. */
export type TabsDensity = Density;

/**
 * Propagates the density set on `<Tabs>` down to the list / trigger / content so
 * only the tab root needs the prop.
 */
const TabsDensityContext = React.createContext<TabsDensity>("default");

const tabsListVariants = cva("inline-flex items-center", {
  variants: {
    density: {
      compact: "gap-0.5 p-0.5",
      default: "gap-1 p-1",
      comfortable: "gap-1.5 p-1.5",
    },
  },
  defaultVariants: { density: "default" },
});

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium text-foreground-muted rounded-md transition-colors duration-base ease-out",
  {
    variants: {
      density: {
        compact: "px-3 py-1.5 text-xs",
        default: "px-4 py-2.5 text-sm",
        comfortable: "px-5 py-3 text-base",
      },
    },
    defaultVariants: { density: "default" },
  }
);

const tabsContentVariants = cva("focus:outline-none animate-fade-in", {
  variants: {
    density: {
      compact: "mt-3",
      default: "mt-4",
      comfortable: "mt-5",
    },
  },
  defaultVariants: { density: "default" },
});

export interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** Density for the whole tab set. Falls back to the surrounding density. */
  density?: TabsDensity;
}

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ density, ...props }, ref) => {
  const globalDensity = useDensity();
  const resolvedDensity = density ?? globalDensity;
  return (
    <TabsDensityContext.Provider value={resolvedDensity}>
      <TabsPrimitive.Root ref={ref} {...props} />
    </TabsDensityContext.Provider>
  );
});
Tabs.displayName = "Tabs";

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, density, ...props }, ref) => {
  const ctx = React.useContext(TabsDensityContext);
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ density: density ?? ctx, className }))}
      {...props}
    />
  );
});
TabsList.displayName = "TabsList";

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, density, ...props }, ref) => {
  const ctx = React.useContext(TabsDensityContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        tabsTriggerVariants({ density: density ?? ctx }),
        "hover:text-foreground hover:bg-hover-bg",
        "focus-visible:outline-none focus-visible:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:text-foreground data-[state=active]:bg-hover-bg",
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>,
    VariantProps<typeof tabsContentVariants> {}

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, density, ...props }, ref) => {
  const ctx = React.useContext(TabsDensityContext);
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(tabsContentVariants({ density: density ?? ctx, className }))}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsPrimitive };
