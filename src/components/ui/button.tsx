import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dev-only warning: `asChild + loading` is unsupported because Slot renders
 * the child element directly (no wrapper to inject the spinner into, and
 * `disabled` cannot be applied to arbitrary children). Catch this mistake
 * early instead of silently rendering a clickable "loading" element.
 *
 * Note: `import.meta.env.DEV` replaces the original `process.env.NODE_ENV`
 * check — this is a Vite app, so `process` does not exist at runtime.
 */
function warnAsChildLoading(asChild: boolean, loading: boolean) {
  if (import.meta.env.DEV && asChild && loading) {
    console.warn(
      "[Orkest UI Button] `asChild` and `loading` cannot be used together: " +
        "cannot inject spinner or block interaction in asChild mode. Use a controlled disabled state or handle loading UI in the child element."
    );
  }
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium leading-none select-none transition-all duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-hover",
        outline: "bg-surface text-foreground border border-border hover:bg-hover-bg",
        ghost: "bg-transparent text-foreground hover:bg-hover-bg",
        danger: "bg-red text-white hover:bg-red-fg",
        subtle: "bg-hover-bg text-foreground hover:bg-hover-bg-strong",
        link: "bg-transparent text-foreground underline-offset-4 hover:underline rounded-none",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10 p-0",
        "icon-sm": "h-9 w-9 p-0",
        fab: "h-[60px] w-[60px] p-0 shadow-fab",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref
  ) => {
    warnAsChildLoading(asChild, loading);

    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...(!asChild ? { disabled: disabled || loading } : {})}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="group"
        className={cn(
          "inline-flex -space-x-px",
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none [&>*]:focus-visible:z-10",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ButtonGroup.displayName = "ButtonGroup";

export { buttonVariants };
