import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export interface ListProps extends React.HTMLAttributes<HTMLUListElement> {
  density?: "compact" | "default" | "comfortable";
}

const listItemDensity = cva(
  "flex items-center gap-3 px-3 rounded-md hover:bg-hover-bg cursor-pointer transition-colors duration-base ease-out",
  {
    variants: {
      density: {
        compact: "py-1.5",
        default: "py-2",
        comfortable: "py-3",
      },
    },
    defaultVariants: {
      density: "default",
    },
  }
);

export interface ListContextValue {
  density: NonNullable<ListProps["density"]>;
}

const ListContext = React.createContext<ListContextValue>({
  density: "default",
});

export const List = React.forwardRef<HTMLUListElement, ListProps>(
  ({ className, density = "default", ...props }, ref) => {
    return (
      <ListContext.Provider value={{ density }}>
        <ul
          ref={ref}
          className={cn("flex flex-col gap-1", className)}
          {...props}
        />
      </ListContext.Provider>
    );
  }
);
List.displayName = "List";

export interface ListItemProps
  extends React.LiHTMLAttributes<HTMLLIElement>,
    VariantProps<typeof listItemDensity> {
  asChild?: boolean;
}

export const ListItem = React.forwardRef<HTMLLIElement, ListItemProps>(
  ({ className, density, ...props }, ref) => {
    const ctx = React.useContext(ListContext);
    return (
      <li
        ref={ref}
        className={cn(
          listItemDensity({ density: density ?? ctx.density, className })
        )}
        {...props}
      />
    );
  }
);
ListItem.displayName = "ListItem";

export interface ListSeparatorProps
  extends React.HTMLAttributes<HTMLLIElement> {}

export const ListSeparator = React.forwardRef<
  HTMLLIElement,
  ListSeparatorProps
>(({ className, ...props }, ref) => {
  return (
    <li
      ref={ref}
      role="separator"
      aria-orientation="horizontal"
      className={cn("h-px bg-border my-1", className)}
      {...props}
    />
  );
});
ListSeparator.displayName = "ListSeparator";
