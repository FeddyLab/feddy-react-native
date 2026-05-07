import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.4' },
}));

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

import { clearBoardsCache, fetchBoards } from '../api/boards';
import { FeddyError } from '../client';

const CACHE_KEY = 'app.feddy.boards.cache.v1';
const TTL_MS = 60 * 60 * 1000;

interface FakeClient {
  get: ReturnType<typeof vi.fn>;
}

function fakeClient(): FakeClient {
  return { get: vi.fn() };
}

const liveBoards = [
  { key: 'features', name: 'Feature' },
  { key: 'bugs', name: 'Bug' },
  { key: 'roadmap-2026', name: 'Roadmap 2026' },
];

describe('fetchBoards', () => {
  beforeEach(() => {
    store.clear();
  });

  it('fetches from server when no cache exists', async () => {
    const client = fakeClient();
    client.get.mockResolvedValue({ items: liveBoards });
    const result = await fetchBoards(client as never);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ key: 'features', name: 'Feature' });
    expect(client.get).toHaveBeenCalledWith('/v1/boards');
  });

  it('writes successful server response to cache', async () => {
    const client = fakeClient();
    client.get.mockResolvedValue({ items: liveBoards });
    await fetchBoards(client as never);
    const cached = JSON.parse(store.get(CACHE_KEY) as string);
    expect(cached.items).toHaveLength(3);
    expect(cached.fetchedAt).toBeTypeOf('number');
  });

  it('returns cache when fresh and skips the network', async () => {
    store.set(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), items: liveBoards })
    );
    const client = fakeClient();
    const result = await fetchBoards(client as never);
    expect(result).toHaveLength(3);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('returns stale cache and fires a background refresh (stale-while-revalidate)', async () => {
    store.set(
      CACHE_KEY,
      JSON.stringify({
        fetchedAt: Date.now() - TTL_MS - 1,
        items: liveBoards,
      })
    );
    const client = fakeClient();
    client.get.mockResolvedValue({
      items: [...liveBoards, { key: 'new', name: 'New Board' }],
    });

    const result = await fetchBoards(client as never);
    // Returned the stale value immediately.
    expect(result).toHaveLength(3);

    // Let the background refresh microtask flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cached = JSON.parse(store.get(CACHE_KEY) as string);
    expect(cached.items).toHaveLength(4);
  });

  it('falls back to localized defaults on first-load network failure', async () => {
    const client = fakeClient();
    client.get.mockRejectedValue(
      new FeddyError({ code: 'network', message: 'offline' })
    );
    const result = await fetchBoards(client as never);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.key).sort()).toEqual(['bugs', 'features']);
    // Defaults are NOT cached so a later online retry hits the server.
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('falls back to defaults when server returns empty items', async () => {
    const client = fakeClient();
    client.get.mockResolvedValue({ items: [] });
    const result = await fetchBoards(client as never);
    expect(result).toHaveLength(2);
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('clearBoardsCache wipes the slot', async () => {
    store.set(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), items: liveBoards })
    );
    await clearBoardsCache();
    expect(store.has(CACHE_KEY)).toBe(false);
  });
});
