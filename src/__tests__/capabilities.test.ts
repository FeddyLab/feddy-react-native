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
  BRANDING_FALLBACK,
  clearCapabilitiesCache,
  currentBranding,
} from '../capabilities';

const CACHE_KEY = 'app.feddy.capabilities.cache';

describe('capabilities — three-layer fallback', () => {
  beforeEach(() => {
    store.clear();
  });

  it('returns hardcoded fallback when no cache entry exists', async () => {
    const branding = await currentBranding();
    expect(branding).toEqual(BRANDING_FALLBACK);
  });

  it('returns cached Free branding when present', async () => {
    const cached = {
      fetchedAt: Date.now(),
      branding: {
        show: true,
        text: 'Powered by Feddy',
        url: 'https://feddy.app',
        logoUrl: 'https://feddy.app/logo-32.png',
      },
    };
    store.set(CACHE_KEY, JSON.stringify(cached));
    const branding = await currentBranding();
    expect(branding).toEqual(cached.branding);
  });

  it('returns null when cached branding payload is null', async () => {
    store.set(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), branding: null })
    );
    const branding = await currentBranding();
    expect(branding).toBeNull();
  });

  it('serves stale cache as-is (refresh runs in background separately)', async () => {
    const cached = {
      fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25h old
      branding: {
        show: true,
        text: 'Stale value',
        url: 'https://feddy.app',
        logoUrl: null,
      },
    };
    store.set(CACHE_KEY, JSON.stringify(cached));
    const branding = await currentBranding();
    expect(branding?.text).toBe('Stale value');
  });

  it('falls back to hardcoded default on malformed cache JSON', async () => {
    store.set(CACHE_KEY, 'not valid json {');
    const branding = await currentBranding();
    expect(branding).toEqual(BRANDING_FALLBACK);
  });

  it('clearCapabilitiesCache removes the entry', async () => {
    store.set(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), branding: null })
    );
    await clearCapabilitiesCache();
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('hardcoded fallback shows "Powered by Feddy" — fail-secure default', () => {
    expect(BRANDING_FALLBACK.show).toBe(true);
    expect(BRANDING_FALLBACK.text).toBe('Powered by Feddy');
    expect(BRANDING_FALLBACK.url).toBe('https://feddy.app');
    expect(BRANDING_FALLBACK.logoUrl).toBeNull();
  });
});
