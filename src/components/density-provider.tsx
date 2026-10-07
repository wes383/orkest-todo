import * as React from "react";

/**
 * Global density tier for the desktop app.
 *
 * The library ships density as a three-way switch (`compact` / `default` /
 * `comfortable`); this app ships one answer. The whole interface is drawn at
 * the compact tier and there is no control to change it, so the provider holds
 * a constant instead of a piece of state — a `setDensity` nobody could call
 * would only invite a setting the app does not offer.
 *
 * The context still exists so components resolve their sizes the way the
 * library documents: explicit `size` / `density` prop → surrounding density →
 * `"default"`.
 */
export type Density = "compact" | "default" | "comfortable";

/**
 * Desktop density is fixed at `compact`. Kept as a named constant so the intent
 * is obvious at the call site and easy to flip if the app ever grows a switch.
 */
const APP_DENSITY: Density = "compact";

const DensityContext = React.createContext<Density>("default");

export function DensityProvider({ children }: { children: React.ReactNode }) {
  return (
    <DensityContext.Provider value={APP_DENSITY}>
      {children}
    </DensityContext.Provider>
  );
}

/**
 * The surrounding density, falling back to `"default"` when no provider is
 * mounted. Density-aware components read this to pick their default size.
 */
export function useDensity(): Density {
  return React.useContext(DensityContext);
}
