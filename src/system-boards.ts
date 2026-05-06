import { currentLocale, type Locale, t } from './i18n';
import type { FeedbackBoard } from './types';

/**
 * Board keys the SDK ships first-party translations for. Any board
 * with a key in this set has its display name pulled from the SDK's
 * bundled i18n catalog (`board.<key>`) — this lookup is **not**
 * overridable by the host. Mirrors iOS `FeedbackBoard.featureRequest`
 * / `.bugReport` static factories.
 */
export const SYSTEM_BOARD_KEYS = new Set(['features', 'bugs']);

/**
 * Host-supplied translations for **custom** board keys (anything the
 * workspace admin created beyond `features` / `bugs`). Keyed by board
 * key, then by SDK locale. The host owns this table — set it once via
 * `Feddy.configure({ boardTranslations: ... })`. Missing locales fall
 * through to the server-supplied `board.name` (i.e. whatever the admin
 * typed in the dashboard).
 *
 * Has no effect on system keys: `features` / `bugs` are always pulled
 * from the SDK's bundled catalog so SDK-shipped UI stays internally
 * consistent regardless of host overrides.
 */
export type BoardTranslations = Record<string, Partial<Record<Locale, string>>>;

let hostBoardTranslations: BoardTranslations = {};

export function setBoardTranslations(
  translations: BoardTranslations | null | undefined
): void {
  hostBoardTranslations = translations ?? {};
}

export function getBoardTranslations(): BoardTranslations {
  return hostBoardTranslations;
}

/**
 * Display-name resolution for a board key. Precedence:
 *
 * 1. SDK system key (`features` / `bugs`) → bundled i18n catalog.
 *    Locked — host overrides are ignored to keep first-party UI
 *    consistent with iOS / Android SDK siblings.
 * 2. Host translation for `key` at the current device locale (set via
 *    `Feddy.configure({ boardTranslations })`).
 * 3. `fallbackName` — typically the server's `board.name` (admin's
 *    dashboard input) or, when picker boards are pre-resolved,
 *    whatever they hold at that point.
 * 4. Capitalized key as a last-ditch label so the picker is never
 *    empty.
 */
export function localizedBoardName(key: string, fallbackName?: string): string {
  if (SYSTEM_BOARD_KEYS.has(key)) {
    return t(`board.${key}`);
  }
  const hostEntry = hostBoardTranslations[key];
  if (hostEntry) {
    const localized = hostEntry[currentLocale()];
    if (localized != null && localized.length > 0) {
      return localized;
    }
  }
  if (fallbackName != null && fallbackName.length > 0) {
    return fallbackName;
  }
  if (key.length === 0) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Re-localizes a board's display name when its key is a known system
 * board OR when the host has supplied a translation for it. Custom
 * boards without host translations are returned untouched — the
 * server's `name` is what the admin typed.
 */
export function localizeBoard(board: FeedbackBoard): FeedbackBoard {
  const localized = localizedBoardName(board.key, board.name);
  return localized === board.name ? board : { key: board.key, name: localized };
}

/**
 * The two boards every Feddy workspace ships with, with names pulled
 * from the SDK's bundled localization catalog. Mirrors iOS
 * `FeedbackBoard.systemDefaults`.
 */
export function systemDefaultBoards(): FeedbackBoard[] {
  return [
    { key: 'features', name: t('board.features') },
    { key: 'bugs', name: t('board.bugs') },
  ];
}
