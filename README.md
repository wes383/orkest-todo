# Orkest Todo

A small, fast desktop todo app built with Tauri 2 and React 19. Everything stays
on your machine — no account, no sign-in, no server.

Tasks, focus time and statistics live on the desktop; the phone gets an
installable remote page that flips the focus switch and shows today's total.
`Ctrl+Alt+F` flips the focus switch from outside the app, and can be turned off
in Settings.

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
