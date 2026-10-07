"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/** Density tiers for the switch track and thumb. */
export type SwitchDensity = Density;

/**
 * Track width and thumb translation are coupled: `translate` must equal
 * trackWidth - thumbWidth - 2, otherwise the thumb overhangs the track.
 */
const switchVariants = {
  compact: { track: "h-[18px] w-8", thumb: "h-[14px] w-[14px] translate-x-[2px] data-[state=checked]:translate-x-[16px]" },
  default: { track: "h-[22px] w-10", thumb: "h-[18px] w-[18px] translate-x-[2px] data-[state=checked]:translate-x-[20px]" },
  comfortable: { track: "h-[26px] w-12", thumb: "h-[22px] w-[22px] translate-x-[2px] data-[state=checked]:translate-x-[24px]" },
} as const;

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  /** Track / thumb density. Falls back to the surrounding density. */
  density?: SwitchDensity;
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, density, ...props }, ref) => {
  const globalDensity = useDensity();
  const sizing = switchVariants[density ?? globalDensity];
  return (
    <SwitchPrimitives.Root
      ref={ref}
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-hover-bg-strong",
        sizing.track,
        className
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-surface shadow-sm transition-transform duration-base",
          sizing.thumb
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
