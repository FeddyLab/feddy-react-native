import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import {
  localizeBoard,
  localizedBoardName,
  SYSTEM_BOARD_KEYS,
  setBoardTranslations,
  systemDefaultBoards,
} from '../system-boards';

describe('system-boards', () => {
  beforeEach(() => {
    setLocale('en');
    setBoardTranslations(null);
  });

  afterEach(() => {
    setBoardTranslations(null);
  });

  describe('SYSTEM_BOARD_KEYS', () => {
    it('contains features and bugs', () => {
      expect(SYSTEM_BOARD_KEYS.has('features')).toBe(true);
      expect(SYSTEM_BOARD_KEYS.has('bugs')).toBe(true);
    });
  });

  describe('localizedBoardName', () => {
    it('returns the i18n catalog value for system keys (en)', () => {
      expect(localizedBoardName('features')).toBe('Feature Requests');
      expect(localizedBoardName('bugs')).toBe('Bug Reports');
    });

    it('returns the i18n catalog value for system keys (ja)', () => {
      setLocale('ja');
      expect(localizedBoardName('features')).toBe('機能リクエスト');
      expect(localizedBoardName('bugs')).toBe('バグ報告');
    });

    it('ignores the server fallback name on system keys', () => {
      // Server may have seeded "Features" (English) into the workspace
      // row; SDK overrides with the device-locale translation.
      setLocale('de');
      expect(localizedBoardName('features', 'Features')).toBe(
        'Funktionswünsche'
      );
    });

    it('returns the server name for custom keys', () => {
      expect(localizedBoardName('roadmap-2026', 'Roadmap 2026')).toBe(
        'Roadmap 2026'
      );
    });

    it('capitalizes the key when no fallback is given (custom key)', () => {
      expect(localizedBoardName('experiments')).toBe('Experiments');
    });

    it('returns empty string for empty key', () => {
      expect(localizedBoardName('')).toBe('');
    });

    it('treats empty fallback as missing', () => {
      expect(localizedBoardName('beta', '')).toBe('Beta');
    });
  });

  describe('localizeBoard', () => {
    it('replaces system board name with i18n value', () => {
      setLocale('es');
      expect(localizeBoard({ key: 'features', name: 'Features' })).toEqual({
        key: 'features',
        name: 'Solicitudes de funciones',
      });
    });

    it('passes through custom boards untouched', () => {
      const board = { key: 'design', name: 'Design Feedback' };
      expect(localizeBoard(board)).toEqual(board);
    });
  });

  describe('host boardTranslations override', () => {
    it('uses host translation for the current locale on a custom key', () => {
      setBoardTranslations({
        'roadmap-2026': {
          en: 'Roadmap 2026',
          ja: 'ロードマップ 2026',
          es: 'Hoja de ruta 2026',
        },
      });
      setLocale('ja');
      expect(localizedBoardName('roadmap-2026', 'Server Roadmap 2026 EN')).toBe(
        'ロードマップ 2026'
      );
    });

    it('falls back to server name when current locale missing in host table', () => {
      setBoardTranslations({
        design: { ja: 'デザインフィードバック' },
      });
      setLocale('es'); // not in the host table
      expect(localizedBoardName('design', 'Design Feedback')).toBe(
        'Design Feedback'
      );
    });

    it('falls back to capitalized key when neither host translation nor server name exists', () => {
      setBoardTranslations({ design: { ja: 'デ' } });
      setLocale('es');
      expect(localizedBoardName('design')).toBe('Design');
    });

    it('does NOT override system keys even when host provides translations', () => {
      setBoardTranslations({
        features: {
          ja: 'カスタム機能',
          en: 'My Custom Features Label',
        },
      } as never);
      setLocale('ja');
      expect(localizedBoardName('features', 'Features')).toBe('機能リクエスト');
      setLocale('en');
      expect(localizedBoardName('features', 'Features')).toBe(
        'Feature Requests'
      );
    });

    it('setBoardTranslations(null) clears the table', () => {
      setBoardTranslations({
        design: { ja: 'デザイン' },
      });
      setBoardTranslations(null);
      setLocale('ja');
      expect(localizedBoardName('design', 'Design')).toBe('Design');
    });

    it('localizeBoard applies host translations on custom keys', () => {
      setBoardTranslations({
        'roadmap-2026': { ja: 'ロードマップ 2026' },
      });
      setLocale('ja');
      const localized = localizeBoard({
        key: 'roadmap-2026',
        name: 'Roadmap 2026',
      });
      expect(localized.name).toBe('ロードマップ 2026');
    });
  });

  describe('systemDefaultBoards', () => {
    it('returns localized features + bugs in order', () => {
      setLocale('fr');
      const boards = systemDefaultBoards();
      expect(boards).toHaveLength(2);
      expect(boards[0]).toEqual({
        key: 'features',
        name: 'Demandes de fonctionnalités',
      });
      expect(boards[1]).toEqual({
        key: 'bugs',
        name: 'Rapports de bugs',
      });
    });
  });
});
