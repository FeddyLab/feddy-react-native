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
  getAnonymousToken,
  getAttachmentsEnabled,
  getLastExternalUserId,
  setAttachmentsEnabled,
  setLastExternalUserId,
} from '../identity';

describe('identity', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('anonymous token', () => {
    it('generates and persists a token on first call', async () => {
      const token = await getAnonymousToken();
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('returns the same token on subsequent calls', async () => {
      const first = await getAnonymousToken();
      const second = await getAnonymousToken();
      expect(second).toBe(first);
    });

    it('regenerates after the storage entry is wiped', async () => {
      const first = await getAnonymousToken();
      store.clear();
      const second = await getAnonymousToken();
      expect(second).not.toBe(first);
    });
  });

  describe('lastExternalUserId', () => {
    it('returns null when nothing is stored', async () => {
      expect(await getLastExternalUserId()).toBeNull();
    });

    it('round-trips a non-empty value', async () => {
      await setLastExternalUserId('user_42');
      expect(await getLastExternalUserId()).toBe('user_42');
    });

    it('clears via setLastExternalUserId(null)', async () => {
      await setLastExternalUserId('user_42');
      await setLastExternalUserId(null);
      expect(await getLastExternalUserId()).toBeNull();
    });

    it('clears via setLastExternalUserId("")', async () => {
      await setLastExternalUserId('user_42');
      await setLastExternalUserId('');
      expect(await getLastExternalUserId()).toBeNull();
    });
  });

  describe('attachmentsEnabled', () => {
    it('defaults to false when nothing is stored', async () => {
      expect(await getAttachmentsEnabled()).toBe(false);
    });

    it('round-trips true', async () => {
      await setAttachmentsEnabled(true);
      expect(await getAttachmentsEnabled()).toBe(true);
    });

    it('round-trips false', async () => {
      await setAttachmentsEnabled(true);
      await setAttachmentsEnabled(false);
      expect(await getAttachmentsEnabled()).toBe(false);
    });
  });
});
