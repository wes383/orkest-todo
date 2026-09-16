import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const sizeMap = {
  thin: "h-1.5",
  default: "h-2",
  thick: "h-3",
} as const;

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number;
  variant?: keyof typeof sizeMap;
  color?: string;
}

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, variant = "default", color, ...props }, ref) => {
  const clamped = Math.min(100, Math.max(0, value));
  const colorClass = color && color.startsWith("bg-") ? color : undefined;
  const colorStyle =
    color && !color.startsWith("bg-") ? { backgroundColor: color } : undefined;

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={clamped}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-hover-bg-strong",
        sizeMap[variant],
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 rounded-full bg-blue transition-all duration-slow ease-out",
          colorClass
        )}
        style={{
          transform: `translateX(-${100 - clamped}%)`,
          ...colorStyle,
        }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = "Progress";

export interface CircularProgressProps extends React.SVGProps<SVGSVGElement> {
  value?: number;
  size?: number;
  strokeWidth?: number;
  label?: React.ReactNode;
  /**
   * Indicator color. Accepts a tailwind class (`stroke-green`) or any CSS color
   * (theme variables included), mirroring `Progress`'s `color` prop.
   */
  color?: string;
}

export const CircularProgress = React.forwardRef<SVGSVGElement, CircularProgressProps>(
  ({ className, value = 0, size = 40, strokeWidth = 4, label, color, style, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clamped / 100) * circumference;

    const colorClass = color && color.startsWith("stroke-") ? color : undefined;
    const colorStyle =
      color && !color.startsWith("stroke-")
        ? { stroke: color }
        : undefined;

    return (
      <div
        className={cn("relative inline-flex items-center justify-center", className)}
        style={{ width: size, height: size, ...style }}
      >
        <svg
          ref={ref}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          {...props}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-hover-bg-strong"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(
              "stroke-blue transition-all duration-slow ease-out",
              colorClass
            )}
            style={colorStyle}
          />
        </svg>
        {label !== undefined && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground-muted">
            {label}
          </span>
        )}
      </div>
    );
  }
);
CircularProgress.displayName = "CircularProgress";
