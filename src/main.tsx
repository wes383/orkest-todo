import React from "react";
import ReactDOM from "react-dom/client";

/*
 * Self-hosted webfonts — the exact families orkest-ui loads through
 * `next/font/google` (see its app/layout.tsx):
 *
 *   Inter            → --font-inter            (UI body text)
 *   Manrope          → --font-manrope          (display face: headings + numerals)
 *   JetBrains Mono   → --font-jetbrains-mono   (code, shortcuts, tabular figures)
 *   Noto Sans SC     → --font-noto-sans-sc     (CJK glyphs / Source Han Sans)
 *
 * next/font only exists inside Next.js, so without these imports the
 * `var(--font-manrope, 'Manrope')` stack in globals.css resolved to nothing and
 * every glyph silently fell through to the system CJK font — which is why the
 * stat numerals did not render as Manrope.
 *
 * @fontsource ships variable fonts split into unicode-range subsets, so the
 * browser downloads only the slices a screen actually uses, and everything is
 * bundled locally (the Tauri shell has no guaranteed network access).
 */
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/noto-sans-sc";

import App from "./App";
import { NativeWindowTheme } from "@/components/native-window-theme";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider, applyDocumentLanguage, detectLanguage } from "@/lib/i18n";
import "./styles/globals.css";

/*
 * `<html lang>` is set before the first render, not from the provider's effect.
 * The copied `ui/calendar.tsx` and `ui/date-picker.tsx` read it during render to
 * choose an `Intl` locale, and `index.html` can only carry one static value —
 * so without this, a Chinese window would paint its calendar in English for a
 * frame and then snap.
 */
applyDocumentLanguage(detectLanguage());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <NativeWindowTheme />
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
