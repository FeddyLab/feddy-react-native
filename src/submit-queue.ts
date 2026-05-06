import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FeddyClient, FeddyError } from './client';

const QUEUE_KEY = 'app.feddy.submit.queue';
/** Hard cap on stored entries — FIFO drop when full. */
const MAX_QUEUE = 50;
/** Per-entry attempt budget — drop poisoned entries after this many tries. */
const MAX_ATTEMPTS = 5;

/**
 * One queued `submitRequest` body, captured at the moment the call
 * site failed. We serialize the fully-resolved request body (external
 * user id, anonymous token, attachment keys already uploaded to R2)
 * so a later replay does not need to re-resolve identity or re-upload
 * — both can be invalid by then (user logged out, presigned URL
 * expired). The trade-off is that subsequent identify calls don't
 * retroactively re-tag old queued submits, which matches what users
 * intuitively expect.
 */
export interface QueuedSubmit {
  body: Record<string, unknown>;
  attempts: number;
  /** ms since epoch. */
  enqueuedAt: number;
}

export async function loadQueue(): Promise<QueuedSubmit[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueuedSubmit[];
  } catch {
    // Corruption — drop the entire queue. Same fail-secure pattern as
    // capabilities and subscription stores.
    await AsyncStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

export async function saveQueue(queue: QueuedSubmit[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function enqueueSubmit(
  body: Record<string, unknown>
): Promise<void> {
  const queue = await loadQueue();
  if (queue.length >= MAX_QUEUE) {
    // FIFO drop oldest. Newer feedback is more likely to still match
    // what the user actually typed.
    queue.shift();
  }
  queue.push({ body, attempts: 0, enqueuedAt: Date.now() });
  await saveQueue(queue);
}

/**
 * Drain the queue against the configured client. Runs sequentially so
 * a server suddenly accepting writes doesn't trigger a thundering
 * herd. The first network error short-circuits the rest of the queue
 * back to disk, since downstream entries would just fail the same
 * way; a later `configure()` wave will retry.
 *
 * Returns the count of entries actually flushed (delivered to the
 * server, irrespective of dropped-after-cap entries) — exposed for
 * tests.
 */
export async function replayQueue(client: FeddyClient): Promise<number> {
  const initial = await loadQueue();
  if (initial.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedSubmit[] = [];
  let stopped = false;

  for (let i = 0; i < initial.length; i++) {
    const entry = initial[i];
    if (stopped || !entry) {
      if (entry) remaining.push(entry);
      continue;
    }

    try {
      await client.post('/v1/requests', entry.body);
      flushed++;
    } catch (err) {
      const isNetwork = err instanceof FeddyError && err.code === 'network';
      const next: QueuedSubmit = {
        ...entry,
        attempts: entry.attempts + 1,
      };

      if (isNetwork) {
        // Server unreachable — keep this entry, abort the rest of the
        // run, and let configure / next failure trigger another wave.
        remaining.push(next);
        stopped = true;
        continue;
      }

      if (next.attempts >= MAX_ATTEMPTS) {
        console.warn(
          `[Feddy] dropping queued submit after ${MAX_ATTEMPTS} failed attempts —`,
          err instanceof Error ? err.message : err
        );
        continue;
      }
      remaining.push(next);
    }
  }

  await saveQueue(remaining);
  return flushed;
}

export const __testing = {
  QUEUE_KEY,
  MAX_QUEUE,
  MAX_ATTEMPTS,
};
