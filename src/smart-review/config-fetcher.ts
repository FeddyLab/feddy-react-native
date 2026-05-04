import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeddyClient } from '../client';
import { DEFAULT_RULES, type SmartReviewRules } from './engine';

const CACHE_KEY = 'app.feddy.smartReview.config.cache';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  rules: SmartReviewRules;
}

interface ConfigResponse {
  kind: string;
  rule: {
    min_days_since_install: number;
    min_sessions: number;
    cooldown_days: number;
    yearly_cap: number;
  };
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

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < TTL_MS;
}

/**
 * Returns the rules to evaluate against right now. Cache hit → those
 * rules. Cache miss → bundled defaults. Stale cache is still served;
 * `refreshInBackground` updates it for the next call.
 */
export async function currentRules(): Promise<SmartReviewRules> {
  const cached = await readCache();
  return cached ? cached.rules : DEFAULT_RULES;
}

/**
 * Fire-and-forget refresh. Skips network round-trip when cache is
 * still fresh.
 */
export function refreshInBackground(client: FeddyClient): void {
  void (async () => {
    const cached = await readCache();
    if (cached && isFresh(cached)) return;
    try {
      const response = await client.get<ConfigResponse>('/v1/config', {
        kind: 'smart_review',
      });
      const rules: SmartReviewRules = {
        minDaysSinceInstall: response.rule.min_days_since_install,
        minSessions: response.rule.min_sessions,
        cooldownDays: response.rule.cooldown_days,
        yearlyCap: response.rule.yearly_cap,
      };
      const entry: CacheEntry = { fetchedAt: Date.now(), rules };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch (err) {
      console.error(
        '[Feddy] SmartReview config refresh failed —',
        err instanceof Error ? err.message : err
      );
    }
  })();
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
