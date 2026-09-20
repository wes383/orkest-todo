import * as React from "react";
import { cn } from "@/lib/utils";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

export const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <kbd
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 bg-hover-bg-strong border border-border rounded-sm font-mono text-xs text-foreground-muted",
          className
        )}
        {...props}
      >
        {children}
      </kbd>
    );
  }
);
Kbd.displayName = "Kbd";

export interface KbdChordProps {
  /** One entry per key, in the order the fingers press them. */
  keys: string[];
  className?: string;
}

/**
 * A chord, one keycap per key: `Ctrl` `F`, never `Ctrl F` in a single cap.
 *
 * Two names in one cap read as one key that happens to be called "Ctrl F",
 * and the whole point of a keycap is that it maps to something pressable. The
 * gap here is tighter than the surrounding text's rhythm so the caps stay
 * legibly one chord rather than two adjacent hints.
 */
export function KbdChord({ keys, className }: KbdChordProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key, index) => (
        <Kbd key={index} className="text-[10px]">
          {key}
        </Kbd>
      ))}
    </span>
  );
}
