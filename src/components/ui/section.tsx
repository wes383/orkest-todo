import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Orkest composition primitives.
 *
 * The component library ships atoms (`Card`, `Badge`, `Tabs`, …) but the
 * *layout* rhythm that ties them together — the panel surface, the subsection
 * label, the section heading — lives in the showcase app (`app/_components/
 * demo-helpers.tsx`). These mirror exactly that vocabulary so the todo app
 * reads like an Orkest surface rather than a pile of components.
 */

/**
 * Panel — the canonical bordered surface for grouping related content.
 * `rounded-lg border border-border bg-surface p-6`.
 */
export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-lg border border-border bg-surface p-6", className)}
    {...props}
  />
));
Panel.displayName = "Panel";

/**
 * SubsectionLabel — the small `13px / medium / wide tracking` caption that sits
 * above a group of controls or a nav cluster.
 */
export const SubsectionLabel = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-block text-[13px] font-medium tracking-wide text-foreground-muted",
      className
    )}
    {...props}
  />
));
SubsectionLabel.displayName = "SubsectionLabel";

/** SectionTitle — `font-display 28px semibold`, orkest's section heading. */
export const SectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "font-display text-3xl font-semibold tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
SectionTitle.displayName = "SectionTitle";

/**
 * Hint — the one-line helper text under a control. Muted, small, and always
 * spaced away from its control by 8px rather than 4px.
 */
export const Hint = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-foreground-subtle",
      className
    )}
    {...props}
  />
));
Hint.displayName = "Hint";
