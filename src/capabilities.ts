import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeddyClient } from './client';
import type { Branding } from './types';

const CACHE_KEY = 'app.feddy.capabilities.cache';
const TTL_MS = 24 * 60 * 60 * 1000;

export const BRANDING_FALLBACK: Branding = {
  show: true,
  text: 'Powered by Feddy',
  url: 'https://feddy.app',
  logoUrl: null,
};

interface CacheEntry {
  fetchedAt: number;
  branding: Branding | null;
}

interface CapabilitiesResponse {
  branding: {
    show: boolean;
    text: string;
    url: string;
    logo_url: string | null;
  } | null;
}

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (err) {
    console.error(
      '[Feddy] capabilities cache write failed —',
      err instanceof Error ? err.message : err
    );
  }
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < TTL_MS;
}

/**
 * What `<PoweredByBadge />` should render right now. Reads cache; on
 * miss returns the bundled fallback so the badge always shows when
 * the network is unreachable.
 */
export async function currentBranding(): Promise<Branding | null> {
  const cached = await readCache();
  if (cached) return cached.branding;
  return BRANDING_FALLBACK;
}

/**
 * Fire-and-forget refresh. Skips the round-trip when the cache is still
 * fresh.
 */
export function refreshInBackground(client: FeddyClient): void {
  void (async () => {
    const cached = await readCache();
    if (cached && isFresh(cached)) return;
    try {
      const response =
        await client.get<CapabilitiesResponse>('/v1/capabilities');
      const normalized: Branding | null = response.branding
        ? {
            show: response.branding.show,
            text: response.branding.text,
            url: response.branding.url,
            logoUrl: response.branding.logo_url,
          }
        : null;
      await writeCache({ fetchedAt: Date.now(), branding: normalized });
    } catch (err) {
      console.error(
        '[Feddy] capabilities refresh failed —',
        err instanceof Error ? err.message : err
      );
    }
  })();
}

export async function clearCapabilitiesCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
