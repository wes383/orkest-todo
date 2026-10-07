"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

const textareaVariants = cva(
  "w-full bg-surface border leading-relaxed resize-y text-foreground placeholder:text-foreground-subtle focus:outline-none transition-colors duration-base",
  {
    variants: {
      variant: {
        default: "border-border focus:border-border-strong",
        error: "border-red focus:border-red",
      },
      size: {
        // Compact tier uses --radius-md so a short textarea never reads as a capsule.
        xs: "min-h-16 p-2 px-2.5 text-xs rounded-md",
        sm: "min-h-20 p-3 px-3 text-sm rounded-lg",
        md: "min-h-24 p-3 px-4 text-base rounded-xl",
        lg: "min-h-32 p-4 px-5 text-lg rounded-xl",
      },
      state: {
        default: "",
        disabled: "bg-hover-bg cursor-not-allowed opacity-60",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      state: "default",
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  showCount?: boolean;
}

/** Size used when no explicit `size` is given, derived from the global density. */
const TEXTAREA_SIZE_FOR_DENSITY: Record<
  Density,
  NonNullable<VariantProps<typeof textareaVariants>["size"]>
> = {
  compact: "xs",
  default: "md",
  comfortable: "lg",
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      size,
      state,
      disabled,
      showCount = false,
      maxLength,
      value,
      defaultValue,
      onChange,
      ...props
    },
    ref
  ) => {
    const globalDensity = useDensity();
    const resolvedSize = size ?? TEXTAREA_SIZE_FOR_DENSITY[globalDensity];

    const isControlled = value !== undefined;
    const [internalCount, setInternalCount] = React.useState<number>(() =>
      typeof defaultValue === "string" ? defaultValue.length : 0
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInternalCount(e.target.value.length);
      onChange?.(e);
    };

    const count = isControlled
      ? typeof value === "string"
        ? value.length
        : 0
      : internalCount;

    const controlledProps = isControlled
      ? { value }
      : { defaultValue };

    return (
      <div className="w-full">
        <textarea
          ref={ref}
          disabled={disabled}
          maxLength={maxLength}
          autoComplete="off"
          onChange={handleChange}
          className={cn(
            textareaVariants({
              variant,
              size: resolvedSize,
              state: disabled ? "disabled" : state,
            }),
            className
          )}
          {...controlledProps}
          {...props}
        />
        {showCount && (
          <div className="mt-1 flex justify-end text-xs text-foreground-subtle">
            <span aria-live="polite">
              {count}
              {maxLength ? ` / ${maxLength}` : ""}
            </span>
          </div>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
