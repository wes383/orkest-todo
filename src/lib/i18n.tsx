import * as React from "react";
import {
  LOCALES,
  translate,
  type Language,
  type MessageKey,
  type MessageVars,
} from "@/lib/messages";

/**
 * The language preference is a UI setting, not app data — it lives in its own
 * storage key so that clearing tasks never resets it, and so its format can
 * change without touching the `orkest-todo.v1` state blob.
 */
const STORAGE_KEY = "orkest-todo.language";

function isLanguage(value: unknown): value is Language {
  return value === "zh" || value === "en";
}

/**
 * Which language to open in.
 *
 * English is the default; Chinese is the one exception, and it is granted only
 * on positive evidence — the whole `navigator.languages` preference list, not
 * just its head, so `["en-US", "zh-CN"]` still gets English (the first language
 * the user actually reads) while `["zh-Hans-CN", "en"]` gets Chinese.
 *
 * An explicit choice always wins over detection: without that check, switching
 * to English on a Chinese machine would be undone by the next launch.
 */
export function detectLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage blocked (private mode, disabled cookies) — fall through */
  }

  const tags =
    typeof navigator !== "undefined" && navigator.languages?.length
      ? navigator.languages
      : typeof navigator !== "undefined"
      ? [navigator.language]
      : [];

  return tags.some((tag) => tag.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

/**
 * Mirror the language onto `<html lang>`.
 *
 * This is not just a formality for screen readers: `ui/calendar.tsx` and
 * `ui/date-picker.tsx` are library copies that read `<html lang>` to pick an
 * `Intl` locale, so this attribute is the bridge that localises month names and
 * the date in the picker's trigger.
 */
export function applyDocumentLanguage(lang: Language) {
  document.documentElement.lang = LOCALES[lang];
}

export interface I18nValue {
  language: Language;
  /** BCP-47 tag for `Intl` — `zh-CN` / `en`. */
  locale: string;
  setLanguage: (lang: Language) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
}

const I18nContext = React.createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>(detectLanguage);

  const setLanguage = React.useCallback((next: Language) => {
    /*
     * Written synchronously rather than from an effect. `ui/calendar.tsx` reads
     * `<html lang>` *during render* to build its month labels, so deferring this
     * to after commit would paint one frame of the previous locale — and, worse,
     * a memoised reader could latch onto the stale value.
     */
    applyDocumentLanguage(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the choice still applies for this session */
    }
    setLanguageState(next);
  }, []);

  // Covers the first mount (and any change that did not come through
  // `setLanguage`), so the attribute is correct even before the first click.
  React.useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const value = React.useMemo<I18nValue>(
    () => ({
      language,
      locale: LOCALES[language],
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = React.useContext(I18nContext);
  if (!value) {
    // Loud on purpose: every string in the app comes from here, and a missing
    // provider would otherwise show up as a screen full of message keys.
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}
