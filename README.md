# Orkest Todo

A small, fast desktop todo app built with Tauri 2 and React 19. Everything stays
on your machine — no account, no sync, no server.

## Privacy

Orkest Todo collects nothing and contains no networking code. [PRIVACY.md](PRIVACY.md)
lists what is stored locally and where, plus the only two things that can touch
the network — both of them triggered by you (the CSV export, and opening that
document itself).

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
```
