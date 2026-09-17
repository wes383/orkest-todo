"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Input size token map, used to derive icon container height, padding, etc.
 * Corresponds one-to-one with inputVariants.size heights.
 */
const INPUT_HEIGHT: Record<NonNullable<InputProps["size"]>, string> = {
  sm: "h-10",
  md: "h-12",
  lg: "h-14",
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

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, state, disabled, ...props }, ref) => {
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
            size,
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
  ({ className, leadingIcon, trailingIcon, size = "md", children, ...props }, ref) => {
    const input = React.Children.only(
      children
    ) as React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
    const inputClassName = cn(
      input.props.className,
      leadingIcon && "pl-11",
      trailingIcon && "pr-11"
    );
    const cloned = React.cloneElement(input, { className: inputClassName });

    const heightClass = INPUT_HEIGHT[size];

    return (
      <div
        ref={ref}
        className={cn("relative flex items-center", className)}
        {...props}
      >
        {leadingIcon && (
          <span
            className={cn(
              "pointer-events-none absolute left-3 flex items-center justify-center text-foreground-subtle",
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
              "absolute right-3 flex items-center justify-center text-foreground-subtle",
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
    { className, variant, size = "md", disabled, showLabel, hideLabel, ...props },
    ref
  ) => {
    const [show, setShow] = React.useState(false);
    const heightClass = INPUT_HEIGHT[size ?? "md"];
    const ariaLabel = show
      ? hideLabel ?? "Hide password"
      : showLabel ?? "Show password";
    return (
      <div className="relative flex items-center">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          variant={variant}
          size={size}
          disabled={disabled}
          className={cn("pr-11", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
          className={cn(
            "absolute right-3 flex items-center justify-center text-foreground-subtle hover:text-foreground transition-colors disabled:pointer-events-none",
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
