import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      store.delete(k);
      return Promise.resolve();
    },
  },
}));

import {
  bumpSession,
  clearAll,
  KEYS,
  markShown,
  snapshot,
  YEARLY_WINDOW_MS,
} from '../smart-review/store';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('smart-review store', () => {
  beforeEach(() => {
    store.clear();
  });

  it('snapshot returns zero-state on a fresh install', async () => {
    const s = await snapshot();
    expect(s).toEqual({
      installDate: null,
      sessionCount: 0,
      lastShownAt: null,
      yearlyCount: 0,
      yearlyWindowStart: null,
    });
  });

  describe('bumpSession', () => {
    it('records installDate on first call', async () => {
      await bumpSession(NOW);
      const s = await snapshot();
      expect(s.installDate).toBe(NOW);
      expect(s.sessionCount).toBe(1);
    });

    it('preserves installDate across subsequent calls', async () => {
      await bumpSession(NOW);
      await bumpSession(NOW + DAY);
      await bumpSession(NOW + 2 * DAY);
      const s = await snapshot();
      expect(s.installDate).toBe(NOW);
      expect(s.sessionCount).toBe(3);
    });

    it('treats malformed sessionCount as 0', async () => {
      store.set(KEYS.sessionCount, 'not-a-number');
      await bumpSession(NOW);
      expect((await snapshot()).sessionCount).toBe(1);
    });
  });

  describe('markShown', () => {
    it('starts a new yearly window on first call', async () => {
      await markShown(NOW);
      const s = await snapshot();
      expect(s.lastShownAt).toBe(NOW);
      expect(s.yearlyCount).toBe(1);
      expect(s.yearlyWindowStart).toBe(NOW);
    });

    it('increments yearlyCount within the window', async () => {
      await markShown(NOW);
      await markShown(NOW + 30 * DAY);
      await markShown(NOW + 60 * DAY);
      const s = await snapshot();
      expect(s.lastShownAt).toBe(NOW + 60 * DAY);
      expect(s.yearlyCount).toBe(3);
      expect(s.yearlyWindowStart).toBe(NOW); // unchanged within window
    });

    it('rolls the window over after 365 days elapse', async () => {
      await markShown(NOW);
      await markShown(NOW + YEARLY_WINDOW_MS + DAY);
      const s = await snapshot();
      expect(s.yearlyCount).toBe(1);
      expect(s.yearlyWindowStart).toBe(NOW + YEARLY_WINDOW_MS + DAY);
    });
  });

  describe('clearAll', () => {
    it('wipes every key', async () => {
      await bumpSession(NOW);
      await markShown(NOW);
      await clearAll();
      const s = await snapshot();
      expect(s).toEqual({
        installDate: null,
        sessionCount: 0,
        lastShownAt: null,
        yearlyCount: 0,
        yearlyWindowStart: null,
      });
    });
  });
});
