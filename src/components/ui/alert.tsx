import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 p-3.5 rounded-lg border text-sm",
  {
    variants: {
      variant: {
        info: "bg-blue-soft border-blue-border text-blue",
        success: "bg-green-soft border-green-border text-green",
        warning: "bg-orange-soft border-orange-border text-orange",
        error: "bg-red-soft border-red-border text-red",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconMap: Record<NonNullable<AlertProps["variant"]>, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
  hideIcon?: boolean;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "info", icon, hideIcon = false, children, ...props }, ref) => {
    const Icon = variant ? iconMap[variant] : Info;
    return (
      <div
        ref={ref}
        role="alert"
        data-variant={variant}
        className={cn(alertVariants({ variant, className }))}
        {...props}
      >
        {!hideIcon && (
          <span className="mt-0.5 shrink-0">
            {icon ?? <Icon className="h-4 w-4" aria-hidden="true" />}
          </span>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }
);
Alert.displayName = "Alert";

export interface AlertTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {}

export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  AlertTitleProps
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("font-semibold leading-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

export interface AlertDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  AlertDescriptionProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm opacity-90 mt-1", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export interface AlertIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: NonNullable<AlertProps["variant"]>;
  icon?: LucideIcon;
}

export const AlertIcon = React.forwardRef<HTMLSpanElement, AlertIconProps>(
  ({ className, variant = "info", icon: CustomIcon, ...props }, ref) => {
    const Icon = CustomIcon ?? iconMap[variant] ?? Info;
    return (
      <span
        ref={ref}
        className={cn("mt-0.5 shrink-0", className)}
        {...props}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
);
AlertIcon.displayName = "AlertIcon";
