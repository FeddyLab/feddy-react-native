import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Subscription } from './types';

const MANUAL_KEY = 'app.feddy.subscription.manual';
const AUTO_KEY = 'app.feddy.subscription.auto';

/**
 * The subscription snapshot lives in two parallel slots:
 *
 * - **manual** — set by `Feddy.setSubscription(...)` when the host app's
 *   source-of-truth is RevenueCat / Adapty / its own server. Persisted
 *   so a single call after RevenueCat init survives process restarts.
 * - **auto** — set by `iap-detector.detectActiveSubscription()` from
 *   `expo-iap`. Persisted so the snapshot survives a kill before the
 *   next configure / identify wave refreshes it; this matches the iOS
 *   `SubscriptionStore` semantics where the auto value is the
 *   most-recent successfully-read entitlement.
 *
 * Precedence: manual > auto > null. The host can disable auto entirely
 * via `configure({ autoDetectSubscription: false })`.
 */

async function readSlot(key: string): Promise<Subscription | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Subscription;
  } catch {
    return null;
  }
}

async function writeSlot(
  key: string,
  subscription: Subscription | null
): Promise<void> {
  if (subscription == null) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(subscription));
}

export async function getStoredSubscription(): Promise<Subscription | null> {
  return readSlot(MANUAL_KEY);
}

export async function setStoredSubscription(
  subscription: Subscription | null
): Promise<void> {
  return writeSlot(MANUAL_KEY, subscription);
}

export async function clearStoredSubscription(): Promise<void> {
  await AsyncStorage.removeItem(MANUAL_KEY);
}

export async function getAutoDetectedSubscription(): Promise<Subscription | null> {
  return readSlot(AUTO_KEY);
}

export async function setAutoDetectedSubscription(
  subscription: Subscription | null
): Promise<void> {
  return writeSlot(AUTO_KEY, subscription);
}

export async function clearAutoDetectedSubscription(): Promise<void> {
  await AsyncStorage.removeItem(AUTO_KEY);
}

/**
 * Returns the effective `Subscription` snapshot the SDK should attach
 * to the next outbound write. Manual override wins over auto-detected;
 * neither set returns `null` and the SDK omits the field entirely.
 */
export async function getEffectiveSubscription(): Promise<Subscription | null> {
  const manual = await getStoredSubscription();
  if (manual != null) return manual;
  return getAutoDetectedSubscription();
}
