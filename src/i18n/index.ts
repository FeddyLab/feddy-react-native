import de from './de.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import ja from './ja.json';

export type Locale = 'en' | 'es' | 'ja' | 'de' | 'fr';

type Catalog = Record<string, string>;

const catalogs: Record<Locale, Catalog> = {
  en,
  es,
  ja,
  de,
  fr,
};

interface ExpoLocalizationModule {
  getLocales: () => Array<{ languageCode?: string | null }>;
}

let resolvedLocale: Locale | null = null;

function detectLocale(): Locale {
  try {
    const localization = require('expo-localization') as ExpoLocalizationModule;
    if (localization?.getLocales) {
      const locales = localization.getLocales();
      const lang = locales?.[0]?.languageCode?.toLowerCase();
      if (lang && lang in catalogs) return lang as Locale;
    }
  } catch {
    // expo-localization not installed; fall through to en
  }
  return 'en';
}

/**
 * The locale `t(...)` is currently using. Resolves on first access via
 * `expo-localization` (or 'en' fallback) and is cached for the rest of
 * the process; `setLocale(null)` re-detects on next read.
 */
export function currentLocale(): Locale {
  if (resolvedLocale != null) return resolvedLocale;
  resolvedLocale = detectLocale();
  return resolvedLocale;
}

/**
 * Override the locale used by `t(...)`. Useful for tests and for host
 * apps that want to follow an in-app locale picker rather than the
 * device locale. Pass `null` to re-detect from `expo-localization` on
 * the next `t()` call.
 */
export function setLocale(locale: Locale | null): void {
  resolvedLocale = locale;
}

/**
 * Look up a localized string by key. Falls back to English when the
 * current locale's catalog is missing the key, then to the key itself
 * if even English is missing (helps surface typos during development).
 *
 * Supports `{name}` placeholder interpolation via the `params` object.
 */
export function t(
  key: string,
  params: Record<string, string | number> = {}
): string {
  const lc = currentLocale();
  const template = catalogs[lc][key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    return v == null ? `{${k}}` : String(v);
  });
}
