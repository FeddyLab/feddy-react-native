import { getCurrentClient } from '../runtime';
import { uiState } from '../ui-state';
import * as configFetcher from './config-fetcher';
import { evaluate } from './engine';
import { logEvent } from './event-logger';
import * as store from './store';
import { smartReviewUIState } from './ui-state';

export interface RequestReviewOptions {
  /**
   * Which dashboard board the low-rating capture lands in (≤3 stars).
   * Same semantics as `boardKey` on `Feddy.submitRequest(...)`.
   */
  boardKey?: string;
  /**
   * Caller-defined label that identifies where this prompt fired —
   * e.g. `"task_50_complete"`. Surfaces in the dashboard funnel.
   * Trimmed and capped at 100 characters; empty/whitespace → undefined.
   */
  trigger?: string;
  /**
   * **Debug only.** Bypass the install-age / session / cooldown / yearly
   * cap gates and always present the sheet. Use only in dev menus —
   * shipping this in production lets users see the prompt more often
   * than designed and breaks server funnel telemetry.
   */
  bypassGates?: boolean;
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
 * Imperative entry point for `Feddy.requestReviewIfAppropriate(...)`.
 *
 * 1. Run gates against persisted state and config-fetched rules.
 * 2. If gated out → log the skip reason, return.
 * 3. If show → mark shown, log 'shown', present sheet.
 * 4. Sheet 4-5 stars → log 'rated' + 'routed_store', invoke
 *    `expo-store-review.requestReview()` if installed.
 * 5. Sheet 1-3 stars → log 'rated' + 'routed_feedback', open compose
 *    (so private capture replaces a public 1-3 star App Store review).
 * 6. Cancel → silent dismiss.
 */
export async function requestReviewIfAppropriate(
  opts: RequestReviewOptions = {}
): Promise<void> {
  const client = getCurrentClient();
  if (!client) {
    console.warn(
      '[Feddy] requestReviewIfAppropriate called before configure — ignoring'
    );
    return;
  }

  const trigger = normalizeTrigger(opts.trigger);
  configFetcher.refreshInBackground(client);

  if (!opts.bypassGates) {
    const [state, rules] = await Promise.all([
      store.snapshot(),
      configFetcher.currentRules(),
    ]);
    const decision = evaluate(Date.now(), state, rules);
    if (decision.kind !== 'show') {
      console.log(`[Feddy] SmartReview skipped — ${decision.kind}`);
      return;
    }
  }

  await store.markShown();
  logEvent(client, { stage: 'shown', trigger });

  smartReviewUIState.open({
    onRated: (stars) => {
      smartReviewUIState.close();
      logEvent(client, { stage: 'rated', rating: stars, trigger });
      if (stars >= 4) {
        logEvent(client, { stage: 'routed_store', rating: stars, trigger });
        const sr = loadStoreReview();
        if (sr) {
          void (async () => {
            try {
              const available = await sr.isAvailableAsync();
              if (available) {
                await sr.requestReview();
              } else {
                console.warn(
                  '[Feddy] expo-store-review not available on this device'
                );
              }
            } catch (err) {
              console.error(
                '[Feddy] expo-store-review failed —',
                err instanceof Error ? err.message : err
              );
            }
          })();
        } else {
          console.warn(
            '[Feddy] expo-store-review peer dep not installed — skipping native review prompt'
          );
        }
      } else {
        logEvent(client, {
          stage: 'routed_feedback',
          rating: stars,
          trigger,
        });
        uiState.open({ boardKey: opts.boardKey });
      }
    },
    onCancel: () => {
      smartReviewUIState.close();
      // No event logged — sheet was dismissed without a rating.
    },
  });
}

export async function resetSmartReviewState(): Promise<void> {
  await store.clearAll();
  await configFetcher.clearCache();
}

export { bumpSession } from './store';
