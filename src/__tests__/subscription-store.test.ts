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
  clearStoredSubscription,
  getStoredSubscription,
  setStoredSubscription,
} from '../subscription-store';
import type { Subscription } from '../types';

const KEY = 'app.feddy.subscription.manual';

describe('subscription-store', () => {
  beforeEach(() => {
    store.clear();
  });

  it('returns null when nothing is stored', async () => {
    expect(await getStoredSubscription()).toBeNull();
  });

  it('round-trips a subscription via AsyncStorage', async () => {
    const sub: Subscription = {
      isPaid: true,
      status: 'active',
      productId: 'com.foo.pro_monthly',
      expiresAt: '2026-12-31T00:00:00Z',
    };
    await setStoredSubscription(sub);
    expect(await getStoredSubscription()).toEqual(sub);
  });

  it('clears via setStoredSubscription(null)', async () => {
    await setStoredSubscription({
      isPaid: false,
      status: 'expired',
    });
    await setStoredSubscription(null);
    expect(store.has(KEY)).toBe(false);
    expect(await getStoredSubscription()).toBeNull();
  });

  it('clearStoredSubscription removes the entry', async () => {
    await setStoredSubscription({ isPaid: true, status: 'active' });
    await clearStoredSubscription();
    expect(store.has(KEY)).toBe(false);
  });

  it('returns null on malformed cached JSON', async () => {
    store.set(KEY, 'not valid json');
    expect(await getStoredSubscription()).toBeNull();
  });
});
