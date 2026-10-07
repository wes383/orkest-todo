"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/** Density tiers for the checkbox box and its check glyph. */
export type CheckboxDensity = Density;

const checkboxVariants = {
  compact: { box: "h-3.5 w-3.5 rounded-[3px]", icon: "h-2.5 w-2.5" },
  default: { box: "h-4 w-4 rounded-[4px]", icon: "h-3 w-3" },
  comfortable: { box: "h-5 w-5 rounded-[5px]", icon: "h-4 w-4" },
} as const;

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** Box density. Falls back to the surrounding density. */
  density?: CheckboxDensity;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, density, ...props }, ref) => {
  const globalDensity = useDensity();
  const sizing = checkboxVariants[density ?? globalDensity];
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer shrink-0 border border-border-strong bg-surface shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-fg data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:text-accent-fg transition-colors",
        sizing.box,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? (
          <Minus className={sizing.icon} strokeWidth={3} aria-hidden="true" />
        ) : (
          <Check className={sizing.icon} strokeWidth={3} aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export interface CheckboxOption {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
}

export interface CheckboxGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: CheckboxOption[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  orientation?: "vertical" | "horizontal";
  name?: string;
  /** Row density for the options. Falls back to the surrounding density. */
  density?: CheckboxDensity;
}

const CheckboxGroup = React.forwardRef<HTMLDivElement, CheckboxGroupProps>(
  (
    {
      className,
      options,
      value,
      defaultValue,
      onValueChange,
      orientation = "vertical",
      density,
      name,
      ...props
    },
    ref
  ) => {
    const globalDensity = useDensity();
    const resolvedDensity = density ?? globalDensity;
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<string[]>(
      defaultValue ?? []
    );
    const selected = isControlled ? value : internalValue;

    const toggle = (v: string, checked: boolean) => {
      const next = checked
        ? [...selected, v]
        : selected.filter((x) => x !== v);
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    };

    return (
      <div
        ref={ref}
        role="group"
        className={cn(
          "flex",
          resolvedDensity === "compact"
            ? "gap-2"
            : resolvedDensity === "comfortable"
            ? "gap-3.5"
            : "gap-3",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
          className
        )}
        {...props}
      >
        {options.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={cn(
                "inline-flex items-center text-foreground cursor-pointer select-none",
                resolvedDensity === "compact"
                  ? "gap-1.5 text-xs"
                  : resolvedDensity === "comfortable"
                  ? "gap-2.5 text-sm"
                  : "gap-2 text-sm",
                opt.disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <Checkbox
                name={name}
                value={opt.value}
                checked={checked}
                disabled={opt.disabled}
                density={resolvedDensity}
                onCheckedChange={(c) => toggle(opt.value, c === true)}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    );
  }
);
CheckboxGroup.displayName = "CheckboxGroup";

export { Checkbox, CheckboxGroup };
