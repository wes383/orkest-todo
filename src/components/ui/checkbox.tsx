"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-[4px] border border-border-strong bg-surface shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-fg data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:text-accent-fg transition-colors",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
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
      name,
      ...props
    },
    ref
  ) => {
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
          "flex gap-3",
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
                "inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none",
                opt.disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <Checkbox
                name={name}
                value={opt.value}
                checked={checked}
                disabled={opt.disabled}
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
