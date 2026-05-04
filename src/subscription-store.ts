import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Subscription } from './types';

const STORE_KEY = 'app.feddy.subscription.manual';

/**
 * Manual subscription override set by `Feddy.setSubscription(...)`.
 * Persisted across launches via AsyncStorage so a host app that calls
 * it once after RevenueCat init keeps the override even after the
 * process restarts.
 *
 * v0.1 has no auto-detection (StoreKit 2 / Play Billing are native APIs
 * deferred to v0.x.y). The manual override is the only source.
 */
export async function getStoredSubscription(): Promise<Subscription | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Subscription;
  } catch {
    return null;
  }
}

export async function setStoredSubscription(
  subscription: Subscription | null
): Promise<void> {
  if (subscription == null) {
    await AsyncStorage.removeItem(STORE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(subscription));
}

export async function clearStoredSubscription(): Promise<void> {
  await AsyncStorage.removeItem(STORE_KEY);
}
