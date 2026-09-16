import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-hover-bg-strong animate-pulse-soft rounded-md h-4 w-full",
          className
        )}
        {...props}
      />
    );
  }
);
Skeleton.displayName = "Skeleton";

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export const SkeletonText = React.forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ className, lines = 3, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    );
  }
);
SkeletonText.displayName = "SkeletonText";

const circleSizeMap = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
} as const;

export interface SkeletonCircleProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof circleSizeMap;
}

export const SkeletonCircle = React.forwardRef<HTMLDivElement, SkeletonCircleProps>(
  ({ className, size = "md", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-hover-bg-strong animate-pulse-soft rounded-full",
          circleSizeMap[size],
          className
        )}
        {...props}
      />
    );
  }
);
SkeletonCircle.displayName = "SkeletonCircle";
