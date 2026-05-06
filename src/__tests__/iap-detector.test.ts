import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = { OS: 'ios' as 'ios' | 'android' | 'web', Version: '17.4' };

vi.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
}));

const mockGetActiveSubscriptions = vi.fn();

vi.mock('expo-iap', () => ({
  getActiveSubscriptions: (...args: unknown[]) =>
    mockGetActiveSubscriptions(...args),
}));

import {
  detectActiveSubscription,
  type ExpoIapActiveSubscription,
  pickHighestPriority,
} from '../iap-detector';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iosActive(productId: string, expiresInMs: number) {
  return {
    productId,
    expirationDateIOS: Date.now() + expiresInMs,
    isActive: true,
  } satisfies ExpoIapActiveSubscription;
}

function iosExpired(productId: string) {
  return {
    productId,
    expirationDateIOS: Date.now() - DAY,
    isActive: false,
  } satisfies ExpoIapActiveSubscription;
}

describe('pickHighestPriority', () => {
  beforeEach(() => {
    platform.OS = 'ios';
  });

  it('returns null for empty input', () => {
    expect(pickHighestPriority([])).toBeNull();
  });

  it('maps a single iOS active entitlement', () => {
    const result = pickHighestPriority([
      iosActive('com.foo.monthly', 30 * DAY),
    ]);
    expect(result?.isPaid).toBe(true);
    expect(result?.status).toBe('active');
    expect(result?.productId).toBe('com.foo.monthly');
    expect(result?.expiresAt).toBeDefined();
  });

  it('marks an expired iOS entitlement as expired (not paid)', () => {
    const result = pickHighestPriority([iosExpired('com.foo.monthly')]);
    expect(result?.isPaid).toBe(false);
    expect(result?.status).toBe('expired');
    expect(result?.productId).toBe('com.foo.monthly');
  });

  it('reduces stacked entitlements to active over expired', () => {
    const result = pickHighestPriority([
      iosExpired('com.foo.lapsed'),
      iosActive('com.foo.yearly', 365 * DAY),
    ]);
    expect(result?.status).toBe('active');
    expect(result?.productId).toBe('com.foo.yearly');
  });

  it('treats sandbox transactions <24h old as active', () => {
    const result = pickHighestPriority([
      {
        productId: 'com.foo.sandbox',
        environmentIOS: 'Sandbox',
        transactionDate: Date.now() - HOUR,
      },
    ]);
    expect(result?.status).toBe('active');
    expect(result?.isPaid).toBe(true);
  });

  it('treats sandbox transactions >24h old as expired', () => {
    const result = pickHighestPriority([
      {
        productId: 'com.foo.sandbox',
        environmentIOS: 'Sandbox',
        transactionDate: Date.now() - 2 * DAY,
      },
    ]);
    expect(result?.status).toBe('expired');
    expect(result?.isPaid).toBe(false);
  });

  it('respects autoRenewingAndroid on Android', () => {
    platform.OS = 'android';
    const result = pickHighestPriority([
      {
        productId: 'com.foo.android_yearly',
        autoRenewingAndroid: true,
      },
    ]);
    expect(result?.status).toBe('active');
    expect(result?.isPaid).toBe(true);
    // No iOS expiration date → undefined.
    expect(result?.expiresAt).toBeUndefined();
  });

  it('marks Android subscription with autoRenewing=false as expired', () => {
    platform.OS = 'android';
    const result = pickHighestPriority([
      {
        productId: 'com.foo.android_canceled',
        autoRenewingAndroid: false,
      },
    ]);
    expect(result?.status).toBe('expired');
    expect(result?.isPaid).toBe(false);
  });
});

describe('detectActiveSubscription', () => {
  beforeEach(() => {
    platform.OS = 'ios';
    mockGetActiveSubscriptions.mockReset();
  });

  it('returns null when expo-iap throws (e.g. host did not initConnection — same path as module missing)', async () => {
    mockGetActiveSubscriptions.mockImplementation(() => {
      throw new Error('module not initialised');
    });
    expect(await detectActiveSubscription()).toBeNull();
  });

  it('returns null when expo-iap rejects', async () => {
    mockGetActiveSubscriptions.mockRejectedValue(
      new Error('billing unavailable')
    );
    expect(await detectActiveSubscription()).toBeNull();
  });

  it('returns null when expo-iap returns no subscriptions', async () => {
    mockGetActiveSubscriptions.mockResolvedValue([]);
    expect(await detectActiveSubscription()).toBeNull();
  });

  it('returns null when expo-iap returns a non-array (defensive)', async () => {
    mockGetActiveSubscriptions.mockResolvedValue(null);
    expect(await detectActiveSubscription()).toBeNull();
  });

  it('returns the highest-priority entitlement', async () => {
    mockGetActiveSubscriptions.mockResolvedValue([
      { productId: 'lapsed', expirationDateIOS: Date.now() - DAY },
      {
        productId: 'fresh',
        expirationDateIOS: Date.now() + 30 * DAY,
      },
    ]);
    const result = await detectActiveSubscription();
    expect(result?.productId).toBe('fresh');
    expect(result?.status).toBe('active');
    expect(result?.isPaid).toBe(true);
  });
});
