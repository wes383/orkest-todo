/**
 * The Supabase project this app's sync talks to — read from the build's env
 * (`.env.local` at the repo root, not committed; see `.env.example` for the
 * shape) and inlined here by Vite at build time, so the values never sit in
 * a form and never ride along in git.
 *
 * The anon key is a public value by Supabase's own design: it names a
 * project, and the row-level policies in `supabase-schema.sql` — not this
 * key — decide who reads what, by checking the `x-sync-code` header against
 * each row's `owner_code`. The env file is a convenience for building, not
 * a vault.
 */

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();

export const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
).trim();
