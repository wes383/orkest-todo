import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

export interface IconProps
  extends Omit<React.SVGProps<SVGSVGElement>, "strokeWidth" | "color"> {
  icon: LucideIcon;
  size?: keyof typeof sizeMap;
  strokeWidth?: number;
}

export const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ icon: LucideIconComponent, size = "md", strokeWidth = 2, className, ...props }, ref) => {
    const px = sizeMap[size];
    return (
      <LucideIconComponent
        ref={ref}
        size={px}
        strokeWidth={strokeWidth}
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0", className)}
        {...props}
      />
    );
  }
);
Icon.displayName = "Icon";
