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
  clearAutoDetectedSubscription,
  clearStoredSubscription,
  getAutoDetectedSubscription,
  getEffectiveSubscription,
  getStoredSubscription,
  setAutoDetectedSubscription,
  setStoredSubscription,
} from '../subscription-store';
import type { Subscription } from '../types';

const MANUAL_KEY = 'app.feddy.subscription.manual';
const AUTO_KEY = 'app.feddy.subscription.auto';

const manual: Subscription = {
  isPaid: true,
  status: 'active',
  productId: 'com.foo.pro_yearly',
  expiresAt: '2027-01-01T00:00:00.000Z',
};

const auto: Subscription = {
  isPaid: true,
  status: 'trial',
  productId: 'com.foo.pro_monthly',
  expiresAt: '2026-06-01T00:00:00.000Z',
};

describe('subscription-store', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('manual slot', () => {
    it('returns null when nothing is stored', async () => {
      expect(await getStoredSubscription()).toBeNull();
    });

    it('round-trips a subscription via AsyncStorage', async () => {
      await setStoredSubscription(manual);
      expect(await getStoredSubscription()).toEqual(manual);
    });

    it('clears via setStoredSubscription(null)', async () => {
      await setStoredSubscription({ isPaid: false, status: 'expired' });
      await setStoredSubscription(null);
      expect(store.has(MANUAL_KEY)).toBe(false);
      expect(await getStoredSubscription()).toBeNull();
    });

    it('clearStoredSubscription removes the entry', async () => {
      await setStoredSubscription({ isPaid: true, status: 'active' });
      await clearStoredSubscription();
      expect(store.has(MANUAL_KEY)).toBe(false);
    });

    it('returns null on malformed cached JSON', async () => {
      store.set(MANUAL_KEY, 'not valid json');
      expect(await getStoredSubscription()).toBeNull();
    });
  });

  describe('auto-detected slot', () => {
    it('round-trips an auto-detected snapshot', async () => {
      await setAutoDetectedSubscription(auto);
      expect(await getAutoDetectedSubscription()).toEqual(auto);
    });

    it('clears via setAutoDetectedSubscription(null)', async () => {
      await setAutoDetectedSubscription(auto);
      await setAutoDetectedSubscription(null);
      expect(store.has(AUTO_KEY)).toBe(false);
    });

    it('clearAutoDetectedSubscription removes the entry', async () => {
      await setAutoDetectedSubscription(auto);
      await clearAutoDetectedSubscription();
      expect(store.has(AUTO_KEY)).toBe(false);
    });

    it('manual and auto slots are independent', async () => {
      await setStoredSubscription(manual);
      await setAutoDetectedSubscription(auto);
      expect(await getStoredSubscription()).toEqual(manual);
      expect(await getAutoDetectedSubscription()).toEqual(auto);
    });
  });

  describe('getEffectiveSubscription precedence', () => {
    it('returns null when neither slot is set', async () => {
      expect(await getEffectiveSubscription()).toBeNull();
    });

    it('returns manual when only manual is set', async () => {
      await setStoredSubscription(manual);
      expect(await getEffectiveSubscription()).toEqual(manual);
    });

    it('returns auto when only auto is set', async () => {
      await setAutoDetectedSubscription(auto);
      expect(await getEffectiveSubscription()).toEqual(auto);
    });

    it('manual override wins when both slots are set', async () => {
      await setStoredSubscription(manual);
      await setAutoDetectedSubscription(auto);
      expect(await getEffectiveSubscription()).toEqual(manual);
    });

    it('falls back to auto after manual is cleared', async () => {
      await setStoredSubscription(manual);
      await setAutoDetectedSubscription(auto);
      await setStoredSubscription(null);
      expect(await getEffectiveSubscription()).toEqual(auto);
    });
  });
});
