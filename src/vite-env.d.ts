/// <reference types="vite/client" />

/*
 * Build-time env — the sync credentials, read from `.env.local` at the repo
 * root (gitignored) and inlined by Vite when the bundle is built. See
 * `src/lib/sync/credentials.ts` for why they live there rather than in a
 * form, and `.env.example` for the shape.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
