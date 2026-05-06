import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeddyClient } from '../client';
import { localizeBoard, systemDefaultBoards } from '../system-boards';
import type { FeedbackBoard } from '../types';

const CACHE_KEY = 'app.feddy.boards.cache.v1';
const TTL_MS = 60 * 60 * 1000; // 1h

interface CacheEntry {
  fetchedAt: number;
  items: FeedbackBoard[];
}

interface ServerResponse {
  items: Array<{ key: string; name: string }>;
}

/**
 * Hard-coded fallback for first launch / network failure / config errors.
 * Mirrors the two system boards every workspace ships with — names are
 * pulled from the i18n catalog so a Japanese user sees Japanese names
 * even when offline.
 */
function defaultSystemBoards(): FeedbackBoard[] {
  return systemDefaultBoards();
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

async function writeCache(items: FeedbackBoard[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), items } satisfies CacheEntry)
    );
  } catch (err) {
    console.error(
      '[Feddy] boards cache write failed —',
      err instanceof Error ? err.message : err
    );
  }
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < TTL_MS;
}

/**
 * Fetches the workspace's public, non-archived boards from the server,
 * with a 1h AsyncStorage cache. Stale-while-revalidate: returns cached
 * value immediately on hit (even if stale), kicks a background refresh
 * to update for the next call.
 *
 * Falls back to the bundled system defaults (`Feature Requests` / `Bug
 * Reports`, localized) when:
 * - no cache exists and the server is unreachable
 * - the response is empty
 *
 * Use this when you want to render a custom board picker outside the
 * built-in compose modal. The compose modal calls it automatically.
 */
export async function fetchBoards(
  client: FeddyClient
): Promise<FeedbackBoard[]> {
  const cached = await readCache();

  if (cached) {
    if (!isFresh(cached)) {
      // Background refresh — non-blocking.
      void refreshBoards(client);
    }
    return cached.items.length > 0 ? cached.items : defaultSystemBoards();
  }

  // No cache — must hit the network. Fallback on any failure.
  try {
    const response = await client.get<ServerResponse>('/v1/boards');
    const items: FeedbackBoard[] = response.items.map((b) =>
      localizeBoard({ key: b.key, name: b.name })
    );
    if (items.length > 0) {
      await writeCache(items);
      return items;
    }
  } catch (err) {
    console.error(
      '[Feddy] boards fetch failed — using defaults:',
      err instanceof Error ? err.message : err
    );
  }
  return defaultSystemBoards();
}

async function refreshBoards(client: FeddyClient): Promise<void> {
  try {
    const response = await client.get<ServerResponse>('/v1/boards');
    const items: FeedbackBoard[] = response.items.map((b) =>
      localizeBoard({ key: b.key, name: b.name })
    );
    if (items.length > 0) {
      await writeCache(items);
    }
  } catch (err) {
    console.error(
      '[Feddy] boards refresh failed —',
      err instanceof Error ? err.message : err
    );
  }
}

export async function clearBoardsCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
