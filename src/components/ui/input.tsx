"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDensity, type Density } from "@/components/density-provider";

/**
 * Input size token map, used to derive icon container height, padding, etc.
 * Corresponds one-to-one with inputVariants.size heights.
 */
const INPUT_HEIGHT: Record<NonNullable<InputProps["size"]>, string> = {
  xs: "h-8",
  sm: "h-10",
  md: "h-12",
  lg: "h-14",
};

/**
 * Icon slot geometry per input size, used by InputWithIcon and PasswordInput.
 * Only `xs` deviates from the original `left-3` / `pl-11` geometry; the other
 * sizes keep their existing values so current rendering is unchanged.
 */
const INPUT_ICON_SLOT: Record<
  NonNullable<InputProps["size"]>,
  { left: string; right: string; padLeft: string; padRight: string }
> = {
  xs: { left: "left-2", right: "right-2", padLeft: "pl-7", padRight: "pr-7" },
  sm: { left: "left-3", right: "right-3", padLeft: "pl-11", padRight: "pr-11" },
  md: { left: "left-3", right: "right-3", padLeft: "pl-11", padRight: "pr-11" },
  lg: { left: "left-3", right: "right-3", padLeft: "pl-11", padRight: "pr-11" },
};

const inputVariants = cva(
  "w-full bg-surface border rounded-lg text-base text-foreground placeholder:text-foreground-subtle focus:outline-none transition-colors duration-base",
  {
    variants: {
      variant: {
        default: "border-border focus:border-border-strong",
        error: "border-red focus:border-red",
      },
      size: {
        // Compact tier drops to --radius-md: at h-8 a rounded-lg corner would be
        // half the height, turning the field into a capsule.
        xs: "h-8 px-2.5 text-xs rounded-md",
        sm: "h-10 px-3 text-sm",
        md: "h-12 px-4 text-base",
        lg: "h-14 px-5 text-lg",
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

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

/** Size used when no explicit `size` is given, derived from the global density. */
const INPUT_SIZE_FOR_DENSITY: Record<
  Density,
  NonNullable<VariantProps<typeof inputVariants>["size"]>
> = {
  compact: "xs",
  default: "md",
  comfortable: "lg",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, state, disabled, ...props }, ref) => {
    const globalDensity = useDensity();
    const resolvedSize = size ?? INPUT_SIZE_FOR_DENSITY[globalDensity];
    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-disabled={disabled ? true : undefined}
        // A desktop app has no use for the browser's saved-addresses dropdown;
        // every field here is a list name or a task title, and autofill's
        // suggestions are noise on top of all of them.
        autoComplete="off"
        className={cn(
          inputVariants({
            variant,
            size: resolvedSize,
            state: disabled ? "disabled" : state,
          }),
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export interface InputWithIconProps extends React.HTMLAttributes<HTMLDivElement> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Input size, used to derive icon container height; must match the inner Input's size. */
  size?: NonNullable<InputProps["size"]>;
  children: React.ReactNode;
}

const InputWithIcon = React.forwardRef<HTMLDivElement, InputWithIconProps>(
  ({ className, leadingIcon, trailingIcon, size, children, ...props }, ref) => {
    const globalDensity = useDensity();
    // Resolve once so the icon slot and the inner input always agree on a size.
    const resolvedSize = size ?? INPUT_SIZE_FOR_DENSITY[globalDensity];
    const slot = INPUT_ICON_SLOT[resolvedSize];
    const input = React.Children.only(children) as React.ReactElement<InputProps>;
    /*
     * The icon paddings come first so the field's own className can override
     * them — `cn` merges left to right. A trailing slot narrower than one icon
     * is what the padding was sized for; a slot holding a chord of keycaps is
     * wider than that, and the text would otherwise run underneath it.
     */
    const inputClassName = cn(
      leadingIcon && slot.padLeft,
      trailingIcon && slot.padRight,
      input.props.className
    );
    const cloned = React.cloneElement(input, {
      className: inputClassName,
      size: resolvedSize,
    });

    const heightClass = INPUT_HEIGHT[resolvedSize];

    return (
      <div
        ref={ref}
        className={cn("relative flex items-center", className)}
        {...props}
      >
        {leadingIcon && (
          <span
            className={cn(
              "pointer-events-none absolute flex items-center justify-center text-foreground-subtle",
              slot.left,
              heightClass
            )}
          >
            {leadingIcon}
          </span>
        )}
        {cloned}
        {trailingIcon && (
          <span
            className={cn(
              "absolute flex items-center justify-center text-foreground-subtle",
              slot.right,
              heightClass
            )}
          >
            {trailingIcon}
          </span>
        )}
      </div>
    );
  }
);
InputWithIcon.displayName = "InputWithIcon";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size">,
    VariantProps<typeof inputVariants> {
  /** aria-label for the toggle button when the password is visible. */
  showLabel?: string;
  /** aria-label for the toggle button when the password is hidden. */
  hideLabel?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    { className, variant, size, disabled, showLabel, hideLabel, ...props },
    ref
  ) => {
    const globalDensity = useDensity();
    const resolvedSize = size ?? INPUT_SIZE_FOR_DENSITY[globalDensity];
    const [show, setShow] = React.useState(false);
    const heightClass = INPUT_HEIGHT[resolvedSize];
    const slot = INPUT_ICON_SLOT[resolvedSize];
    const ariaLabel = show
      ? hideLabel ?? "Hide password"
      : showLabel ?? "Show password";
    return (
      <div className="relative flex items-center">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          variant={variant}
          size={resolvedSize}
          disabled={disabled}
          className={cn(slot.padRight, className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
          className={cn(
            "absolute flex items-center justify-center text-foreground-subtle hover:text-foreground transition-colors disabled:pointer-events-none",
            slot.right,
            heightClass
          )}
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { inputVariants };
export { Input, InputWithIcon, PasswordInput };
