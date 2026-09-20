/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/*
 * Unit tests for the pure logic the app leans on — parsers, selectors,
 * recurrence rules, the sync merge. These run in Node, not a browser: none
 * of the modules under test touch the DOM, and a node run is what CI can do
 * on every commit without a display.
 *
 * The tsconfig keeps `types: ["node"]` out of the app build, so vitest's
 * globals are NOT enabled; tests import { describe, expect, it } explicitly.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
