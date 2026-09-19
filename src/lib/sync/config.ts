/**
 * Sync configuration — the one thing the settings page persists: whether the
 * sync is on, and the sync code that names whose data this is.
 *
 * The Supabase URL and anon key are baked into the build
 * (see `credentials.ts`) — the user is never asked for them, on the desktop
 * or on the phone. What identifies a person here is the 24-character sync
 * code: it names the rows in the cloud the way a user id would, except the
 * reader can see it, copy it onto a phone, and throw it away with no
 * ceremony. It travels as a request header the row-level policies check.
 */

const STORAGE_KEY = "orkest-sync.v1";

/** The code's alphabet: no 0/O/1/I — the characters a human misreads. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 24;

export interface SyncConfig {
  code: string;
  enabled: boolean;
}

function isConfig(value: unknown): value is SyncConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<SyncConfig>;
  return typeof c.code === "string" && typeof c.enabled === "boolean";
}

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isConfig(parsed)) return parsed;
    }
  } catch {
    /* blocked or unreadable — the shipped empty config takes over */
  }
  return { code: "", enabled: false };
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* blocked — the config lives in memory for this session */
  }
}

/** A fresh 24-character code, out of the crypto the webview already has. */
export function generateSyncCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** What a typed code becomes: upper-cased, stripped of everything that is
    not a letter or a digit — dashes, spaces, full-width characters, the lot. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, CODE_LENGTH);
}

/** `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` — six groups of four for reading aloud. */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}
