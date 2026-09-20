import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The same four families the desktop loads (see src/main.tsx there): the page
 * borrows the desk's type scale, and a scale with no fonts behind it is only
 * half the design. @fontsource halves them into unicode-range subsets, so the
 * phone downloads the slices it paints and nothing else.
 *
 *   Inter           → --font-inter           (UI body text)
 *   Manrope         → --font-manrope         (display face: headings)
 *   JetBrains Mono  → --font-jetbrains-mono  (the clock, the sync code)
 *   Noto Sans SC    → --font-noto-sans-sc    (CJK glyphs / Source Han Sans)
 */
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/noto-sans-sc";

import { App } from "./app";
import "./style.css";

/*
 * The service worker is registered from the built page only: in `vite dev` a
 * worker would cache modules Vite is still rewriting, which turns every hot
 * reload into a mystery. Registration is also a pure nicety — a browser that
 * refuses it (private mode, an http origin that is not localhost) still gets
 * the whole page.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* no offline shell — the page itself is unaffected */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
