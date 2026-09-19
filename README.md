# Orkest Todo

A small, fast desktop todo app built with Tauri 2 and React 19. Everything stays
on your machine — no account, no sign-in, no server.

Focus sync is optional and off by default. When you turn it on, the focus switch
and the last two days of focus records are mirrored through your own Supabase
project so a phone can watch the clock and flip the switch remotely; the cloud
is a channel, not an archive, so older history and everything else stays on the
computer. See [PRIVACY.md](PRIVACY.md) and `supabase-schema.sql`.

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
