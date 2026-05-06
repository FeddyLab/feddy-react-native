import { Platform } from 'react-native';
import type { Subscription, SubscriptionStatus } from './types';

/**
 * Subset of `expo-iap` v3.x that we actually consume. Declared
 * structurally so `safeRequire` can hand back `null` when the host app
 * hasn't installed the optional peer dep — the detector then no-ops and
 * the SDK falls back to whatever `Feddy.setSubscription(...)` last set.
 *
 * @see https://hyochan.github.io/expo-iap
 */
interface ExpoIapModule {
  getActiveSubscriptions: (
    productIds?: string[]
  ) => Promise<ExpoIapActiveSubscription[]>;
}

interface ExpoIapActiveSubscription {
  productId: string;
  isActive?: boolean;
  /** ms since epoch. iOS only. */
  expirationDateIOS?: number | null;
  /** Whether the iOS subscription will renew. */
  willExpireSoon?: boolean;
  environmentIOS?: 'Sandbox' | 'Production' | string;
  /** Whether Android Play Billing reports auto-renew on. */
  autoRenewingAndroid?: boolean;
  /** ms since epoch. */
  transactionDate?: number;
}

/**
 * Resolve `expo-iap` lazily. Two implementations co-exist:
 *
 * - **CJS `require`** for React Native / Metro: the bundler statically
 *   analyses the literal `'expo-iap'` and resolves at build time when
 *   the host has installed the optional peer dep, otherwise throws
 *   `MODULE_NOT_FOUND` at first call.
 * - **ESM dynamic `import`** for vitest: the test runner only honours
 *   `vi.mock(...)` for ESM module specifiers, so we fall back to
 *   `import('expo-iap')` when `require` is unavailable (Node ESM mode)
 *   or when CJS resolution returns a module without
 *   `getActiveSubscriptions`.
 */
async function loadExpoIap(): Promise<ExpoIapModule | null> {
  try {
    // ESM dynamic import — hookable by vi.mock and works in any
    // Node 18+ runtime; Metro also accepts a literal-string dynamic
    // import as a regular require.
    const mod = (await import('expo-iap')) as unknown as ExpoIapModule;
    if (mod && typeof mod.getActiveSubscriptions === 'function') {
      return mod;
    }
    // Fall through to CJS in case the runtime returned an interop
    // shape that hides the function.
  } catch {
    // ESM import failed — try CJS for older RN bundles.
  }
  try {
    const mod = require('expo-iap') as ExpoIapModule;
    if (mod && typeof mod.getActiveSubscriptions === 'function') {
      return mod;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Numeric priority used to pick the "most engaged" entitlement when an
 * end user has multiple active subscriptions stacked (e.g. monthly +
 * annual or pro + add-ons). Mirrors the iOS `StoreKitDetector` reduce.
 */
function priorityOf(status: SubscriptionStatus): number {
  switch (status) {
    case 'active':
      return 3;
    case 'trial':
      return 2;
    case 'expired':
      return 1;
    default:
      return 0;
  }
}

function deriveStatus(sub: ExpoIapActiveSubscription): SubscriptionStatus {
  const now = Date.now();

  if (Platform.OS === 'ios') {
    if (typeof sub.expirationDateIOS === 'number') {
      if (sub.expirationDateIOS > now) {
        // Apple's `Transaction` does not expose trial state directly
        // through expo-iap's surface; treat any not-yet-expired
        // entitlement as `active`. Hosts that need finer trial vs
        // active separation should call `Feddy.setSubscription(...)`
        // with their own derivation.
        return 'active';
      }
      return 'expired';
    }
    // Sandbox tester case — sandbox auto-renews on a compressed clock,
    // accept as active when transactionDate is fresh (<24h). Matches
    // the "sandbox active" carve-out in expo-iap docs.
    if (
      sub.environmentIOS === 'Sandbox' &&
      typeof sub.transactionDate === 'number'
    ) {
      const dayMs = 24 * 60 * 60 * 1000;
      return now - sub.transactionDate < dayMs ? 'active' : 'expired';
    }
    return sub.isActive ? 'active' : 'expired';
  }

  if (Platform.OS === 'android') {
    if (sub.autoRenewingAndroid === true) return 'active';
    // Play Billing v8 surfaces no expiry timestamp directly; if expo-iap
    // already evaluated `isActive` (recent purchase), trust it.
    if (sub.isActive === true) return 'active';
    return 'expired';
  }

  return sub.isActive ? 'active' : 'none';
}

function toFeddySubscription(sub: ExpoIapActiveSubscription): Subscription {
  const status = deriveStatus(sub);
  const isPaid = status === 'active' || status === 'trial';
  const expiresAt =
    typeof sub.expirationDateIOS === 'number'
      ? new Date(sub.expirationDateIOS).toISOString()
      : undefined;
  return {
    isPaid,
    status,
    productId: sub.productId,
    expiresAt,
  };
}

/**
 * Pick the highest-priority `Subscription` from an `expo-iap`
 * `getActiveSubscriptions()` response. Exported for unit testing — most
 * callers should use `detectActiveSubscription()` below.
 */
export function pickHighestPriority(
  candidates: ExpoIapActiveSubscription[]
): Subscription | null {
  let best: Subscription | null = null;
  for (const candidate of candidates) {
    const next = toFeddySubscription(candidate);
    if (!best || priorityOf(next.status) > priorityOf(best.status)) {
      best = next;
    }
  }
  return best;
}

/**
 * Read the host app's currently-active subscription from `expo-iap`
 * (StoreKit 2 on iOS, Play Billing on Android) and reduce it to a
 * single `Feddy.Subscription` snapshot.
 *
 * Returns `null` when:
 * - `expo-iap` is not installed (optional peer dep)
 * - `expo-iap` throws (host has not called `initConnection`, sandbox
 *   refused, network issue) — we fail silent; the host's own purchase
 *   flow will recover and a later `Feddy.refreshSubscription()` call
 *   will retry
 * - the user has no active entitlement
 */
export async function detectActiveSubscription(): Promise<Subscription | null> {
  const expoIap = await loadExpoIap();
  if (!expoIap?.getActiveSubscriptions) return null;

  try {
    const subs = await expoIap.getActiveSubscriptions();
    if (!Array.isArray(subs) || subs.length === 0) return null;
    return pickHighestPriority(subs);
  } catch {
    return null;
  }
}

/** Test-only helper. Exported so the type can be reused by the spec. */
export type { ExpoIapActiveSubscription, ExpoIapModule };
