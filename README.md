# Orkest Todo

A small, fast desktop todo app built with Tauri 2 and React 19. Everything stays
on your machine — no account, no sign-in, no server.

## Getting started

Requires [Node.js](https://nodejs.org/) 20+, [pnpm](https://pnpm.io/) and a
[Rust toolchain](https://www.rust-lang.org/tools/install).

```bash
pnpm install
pnpm tauri dev
```

Build a release bundle:

```bash
pnpm tauri build
```

Frontend-only dev server:

```bash
pnpm dev          # http://localhost:1420
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
```

The mobile remote page lives in `mobile/` and ships its own dev/build/typecheck
scripts (`pnpm --dir mobile dev|build|typecheck`).
