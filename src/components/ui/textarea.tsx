"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "w-full min-h-24 p-3 px-4 bg-surface border rounded-xl text-base leading-relaxed resize-y text-foreground placeholder:text-foreground-subtle focus:outline-none transition-colors duration-base",
  {
    variants: {
      variant: {
        default: "border-border focus:border-border-strong",
        error: "border-red focus:border-red",
      },
      state: {
        default: "",
        disabled: "bg-hover-bg cursor-not-allowed opacity-60",
      },
    },
    defaultVariants: {
      variant: "default",
      state: "default",
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  showCount?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
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
          onChange={handleChange}
          className={cn(
            textareaVariants({
              variant,
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
