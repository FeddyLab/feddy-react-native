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

import { FeddyError } from '../client';
import {
  __testing,
  clearQueue,
  enqueueSubmit,
  loadQueue,
  type QueuedSubmit,
  replayQueue,
  saveQueue,
} from '../submit-queue';

const QUEUE_KEY = __testing.QUEUE_KEY;
const MAX_QUEUE = __testing.MAX_QUEUE;
const MAX_ATTEMPTS = __testing.MAX_ATTEMPTS;

interface FakeClient {
  post: ReturnType<typeof vi.fn>;
}

function fakeClient(): FakeClient {
  return { post: vi.fn() };
}

describe('submit-queue', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('persistence', () => {
    it('returns [] when nothing is stored', async () => {
      expect(await loadQueue()).toEqual([]);
    });

    it('round-trips a queue via AsyncStorage', async () => {
      const entry: QueuedSubmit = {
        body: { title: 'a' },
        attempts: 0,
        enqueuedAt: 1000,
      };
      await saveQueue([entry]);
      expect(await loadQueue()).toEqual([entry]);
    });

    it('saving an empty array removes the storage entry', async () => {
      await saveQueue([{ body: { title: 'a' }, attempts: 0, enqueuedAt: 1 }]);
      await saveQueue([]);
      expect(store.has(QUEUE_KEY)).toBe(false);
    });

    it('drops the entire queue on corrupted JSON', async () => {
      store.set(QUEUE_KEY, 'not json {]');
      expect(await loadQueue()).toEqual([]);
      // Corruption clears the slot.
      expect(store.has(QUEUE_KEY)).toBe(false);
    });

    it('drops the queue on non-array JSON', async () => {
      store.set(QUEUE_KEY, '{"not":"an array"}');
      expect(await loadQueue()).toEqual([]);
    });

    it('clearQueue removes the entry', async () => {
      await saveQueue([{ body: { title: 'x' }, attempts: 0, enqueuedAt: 1 }]);
      await clearQueue();
      expect(store.has(QUEUE_KEY)).toBe(false);
    });
  });

  describe('enqueueSubmit', () => {
    it('appends a new entry with attempts=0', async () => {
      await enqueueSubmit({ title: 'first' });
      const queue = await loadQueue();
      expect(queue.length).toBe(1);
      expect(queue[0]?.attempts).toBe(0);
      expect(queue[0]?.body).toEqual({ title: 'first' });
      expect(queue[0]?.enqueuedAt).toBeTypeOf('number');
    });

    it('FIFO drops oldest when the queue is at cap', async () => {
      // Pre-fill at cap.
      const initial: QueuedSubmit[] = Array.from(
        { length: MAX_QUEUE },
        (_, i) => ({
          body: { idx: i },
          attempts: 0,
          enqueuedAt: i,
        })
      );
      await saveQueue(initial);

      await enqueueSubmit({ idx: 'newest' });
      const queue = await loadQueue();
      expect(queue.length).toBe(MAX_QUEUE);
      // Oldest (idx 0) is dropped, newest is appended.
      expect(queue[0]?.body).toEqual({ idx: 1 });
      expect(queue.at(-1)?.body).toEqual({ idx: 'newest' });
    });
  });

  describe('replayQueue', () => {
    it('flushes all entries and clears the queue on success', async () => {
      await enqueueSubmit({ title: 'a' });
      await enqueueSubmit({ title: 'b' });
      await enqueueSubmit({ title: 'c' });

      const client = fakeClient();
      client.post.mockResolvedValue(undefined);

      const flushed = await replayQueue(client as never);
      expect(flushed).toBe(3);
      expect(client.post).toHaveBeenCalledTimes(3);
      expect(client.post).toHaveBeenNthCalledWith(1, '/v1/requests', {
        title: 'a',
      });
      expect(client.post).toHaveBeenNthCalledWith(3, '/v1/requests', {
        title: 'c',
      });
      expect(await loadQueue()).toEqual([]);
    });

    it('returns 0 and is a no-op when the queue is empty', async () => {
      const client = fakeClient();
      const flushed = await replayQueue(client as never);
      expect(flushed).toBe(0);
      expect(client.post).not.toHaveBeenCalled();
    });

    it('keeps and increments attempts on HTTP failure (server saw it but rejected)', async () => {
      await enqueueSubmit({ title: 'rejected' });
      const client = fakeClient();
      client.post.mockRejectedValueOnce(
        new FeddyError({ code: 'http', status: 400, message: 'bad' })
      );

      const flushed = await replayQueue(client as never);
      expect(flushed).toBe(0);
      const queue = await loadQueue();
      expect(queue.length).toBe(1);
      expect(queue[0]?.attempts).toBe(1);
    });

    it(`drops an entry after ${MAX_ATTEMPTS} HTTP failures`, async () => {
      await saveQueue([
        {
          body: { title: 'poison' },
          attempts: MAX_ATTEMPTS - 1,
          enqueuedAt: 1,
        },
      ]);
      const client = fakeClient();
      client.post.mockRejectedValueOnce(
        new FeddyError({ code: 'http', status: 422, message: 'invalid' })
      );

      await replayQueue(client as never);
      // attempts went from MAX-1 → MAX, so the entry is dropped.
      expect(await loadQueue()).toEqual([]);
    });

    it('on network error, short-circuits the rest of the queue back to disk', async () => {
      await enqueueSubmit({ title: 'a' });
      await enqueueSubmit({ title: 'b' });
      await enqueueSubmit({ title: 'c' });

      const client = fakeClient();
      client.post.mockRejectedValue(
        new FeddyError({ code: 'network', message: 'offline' })
      );

      const flushed = await replayQueue(client as never);
      expect(flushed).toBe(0);
      // Only the first entry was attempted; all 3 remain.
      expect(client.post).toHaveBeenCalledTimes(1);
      const queue = await loadQueue();
      expect(queue.length).toBe(3);
      expect(queue[0]?.attempts).toBe(1);
      expect(queue[1]?.attempts).toBe(0);
      expect(queue[2]?.attempts).toBe(0);
    });

    it('mixed: flushes succeeding entries, retains failing ones', async () => {
      await enqueueSubmit({ title: 'ok-1' });
      await enqueueSubmit({ title: 'fail' });
      await enqueueSubmit({ title: 'ok-2' });

      const client = fakeClient();
      client.post
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new FeddyError({ code: 'http', status: 500, message: 'oops' })
        )
        .mockResolvedValueOnce(undefined);

      const flushed = await replayQueue(client as never);
      expect(flushed).toBe(2);
      const queue = await loadQueue();
      expect(queue.length).toBe(1);
      expect(queue[0]?.body).toEqual({ title: 'fail' });
      expect(queue[0]?.attempts).toBe(1);
    });
  });
});
