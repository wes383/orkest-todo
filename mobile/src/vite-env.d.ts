/// <reference types="vite/client" />

/*
 * Build-time env — the sync credentials, read from `mobile/.env.local`
 * (gitignored) and inlined by Vite when the page is built. See
 * `mobile/src/credentials.ts` and `mobile/.env.example`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
