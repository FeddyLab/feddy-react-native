import { getCurrentClient } from '../runtime';
import { logEvent } from './event-logger';

export interface RequestSystemReviewDirectOptions {
  /**
   * Caller-defined label that identifies where in your app this
   * prompt fired from — e.g. `"paywall_purchase_success"`. Surfaces
   * in the dashboard funnel. Trimmed and capped at 100 characters;
   * empty / whitespace → undefined.
   */
  trigger?: string;
}

function normalizeTrigger(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length <= 100 ? trimmed : trimmed.slice(0, 100);
}

interface ExpoStoreReviewModule {
  isAvailableAsync: () => Promise<boolean>;
  requestReview: () => Promise<void>;
}

function loadStoreReview(): ExpoStoreReviewModule | null {
  try {
    return require('expo-store-review') as ExpoStoreReviewModule;
  } catch {
    return null;
  }
}

/**
 * Imperative entry point for
 * `Feddy.requestSystemReviewDirect({ trigger })`. Bypasses the
 * Smart Review like / dislike pre-prompt and invokes
 * `expo-store-review.requestReview()` immediately. Use only for
 * moments where the host has already established positive
 * sentiment (e.g. immediately after a paywall purchase succeeds).
 *
 * Deliberately does NOT consult or update SmartReview state — the
 * install-age / session / cooldown / yearly-cap gates belong to
 * the shield flow only. Apple / Google opaque per-app yearly caps
 * still apply; that judgement is on the host.
 */
export async function requestSystemReviewDirect(
  opts: RequestSystemReviewDirectOptions = {}
): Promise<void> {
  const client = getCurrentClient();
  if (!client) {
    console.warn(
      '[Feddy] requestSystemReviewDirect called before configure — ignoring'
    );
    return;
  }

  const trigger = normalizeTrigger(opts.trigger);

  const sr = loadStoreReview();
  if (!sr) {
    console.warn(
      '[Feddy] expo-store-review peer dep not installed — skipping native review prompt'
    );
    return;
  }

  try {
    const available = await sr.isAvailableAsync();
    if (!available) {
      console.warn('[Feddy] expo-store-review not available on this device');
      return;
    }
    await sr.requestReview();
    logEvent(client, { stage: 'system_direct', trigger });
  } catch (err) {
    console.error(
      '[Feddy] expo-store-review failed —',
      err instanceof Error ? err.message : err
    );
  }
}
