import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built folder can be dropped onto any static host —
// Netlify drag-and-drop, a Vercel project, a subdirectory, anything.
export default defineConfig({
  plugins: [react()],
  base: "./",
  // An inline (empty) PostCSS config stops Vite from walking up to the
  // desktop app's tailwind/postcss setup one directory above — this page
  // ships one hand-written stylesheet and no framework.
  css: { postcss: {} },
});
