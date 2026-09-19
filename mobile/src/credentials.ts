/**
 * The Supabase project this page talks to — the same pair the desktop reads
 * from its own env (see the desktop's `src/lib/sync/credentials.ts`). A
 * static page has no backend of its own, so this is as "server-side" as it
 * gets: the values ride inside the built bundle via `mobile/.env.local`
 * (gitignored), and the anon key is public by Supabase's design — the
 * row-level policies, checked against the `x-sync-code` header, are what
 * actually guard the rows.
 */

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();

export const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
).trim();
