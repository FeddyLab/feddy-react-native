import * as boardsApi from './api/boards';
import * as readApi from './api/read';
import { uploadAttachment } from './attachments/upload';
import { clearCapabilitiesCache, refreshInBackground } from './capabilities';
import { FeddyClient, FeddyError } from './client';
import { detectActiveSubscription } from './iap-detector';
import {
  getAnonymousToken,
  getLastExternalUserId,
  setAttachmentsEnabled,
  setLastExternalUserId,
} from './identity';
import { getCurrentClient, setCurrentClient } from './runtime';
import type { RequestReviewOptions } from './smart-review';
import * as smartReview from './smart-review';
import { clearQueue, enqueueSubmit, replayQueue } from './submit-queue';
import {
  clearAutoDetectedSubscription,
  clearStoredSubscription,
  getEffectiveSubscription,
  setAutoDetectedSubscription,
  setStoredSubscription,
} from './subscription-store';
import type {
  AddCommentOptions,
  CommentList,
  ConfigureOptions,
  FeedbackComment,
  FeedbackRequest,
  FetchCommentsOptions,
  FetchRequestsOptions,
  IdentifyOptions,
  OpenFeedbackOptions,
  RequestList,
  SubmitRequestOptions,
  Subscription,
  UpvoteOptions,
  VoteState,
} from './types';
import { uiState } from './ui-state';

export { FeddyClient, FeddyError } from './client';
export type { AttachmentPickerButtonProps } from './components/AttachmentPickerButton';
export { AttachmentPickerButton } from './components/AttachmentPickerButton';
export type { FeddyProviderProps } from './components/FeddyProvider';
export { FeddyProvider } from './components/FeddyProvider';
export type {
  FeedbackComposeContentProps,
  FeedbackComposeViewProps,
} from './components/FeedbackComposeView';
export {
  FeedbackComposeContent,
  FeedbackComposeView,
} from './components/FeedbackComposeView';
export { PoweredByBadge } from './components/PoweredByBadge';
export type { RequestDetailViewProps } from './components/RequestDetailView';
export {
  RequestDetailContent,
  RequestDetailView,
} from './components/RequestDetailView';
export type { RequestListViewProps } from './components/RequestListView';
export {
  RequestListView,
  SYSTEM_BOARDS,
} from './components/RequestListView';
export type { RoadmapViewProps } from './components/RoadmapView';
export { RoadmapView } from './components/RoadmapView';
export { SmartReviewSheet } from './components/SmartReviewSheet';
export type { RequestReviewOptions } from './smart-review';
export type {
  AddCommentOptions,
  Attachment,
  Branding,
  CommentList,
  ConfigureOptions,
  FeddyErrorCode,
  FeedbackBoard,
  FeedbackComment,
  FeedbackRequest,
  FetchCommentsOptions,
  FetchRequestsOptions,
  IdentifyOptions,
  OpenFeedbackOptions,
  RequestList,
  RoadmapStatus,
  SubmitRequestOptions,
  Subscription,
  SubscriptionStatus,
  UpvoteOptions,
  VoteState,
} from './types';
export { SDK_VERSION } from './version';

function logError(scope: string, err: unknown): void {
  console.error(
    `[Feddy] ${scope} failed —`,
    err instanceof Error ? err.message : err
  );
}

function requireClient(scope: string): FeddyClient {
  const client = getCurrentClient();
  if (!client) {
    throw new FeddyError({
      code: 'not_configured',
      message: `Feddy.${scope} called before Feddy.configure(...)`,
    });
  }
  return client;
}

/**
 * Public namespace for the Feddy React Native SDK.
 *
 * ```ts
 * Feddy.configure({ apiKey: 'fed_xxxxxxxxxxxx' });
 * Feddy.identify({ userId: 'user_42' });
 * Feddy.openFeedback({ boardKey: 'features' });
 *
 * const list = await Feddy.fetchRequests({ boardKey: 'features' });
 * ```
 *
 * Fire-and-forget methods (`configure` / `identify` / `submitRequest` /
 * `openFeedback` / `reset` / `setSubscription`) are synchronous, never
 * throw, never block. Errors are logged via `console.error`.
 *
 * Read-side methods (`fetchRequests` / `fetchRequest` / `fetchComments` /
 * `upvote` / `addComment`) return Promises and reject with `FeddyError`
 * on failure — the host app needs the response to render UI.
 */
export const Feddy = {
  // ---------- Fire-and-forget public surface ----------

  /**
   * Configure the SDK once at app launch with your **Project ID**
   * (`fed_xxxxxxxxxxxx`, copied from your Feddy dashboard).
   * Invalid IDs (wrong prefix, empty, or a server `fed_sk_*` key) are
   * rejected with a console error.
   */
  configure(opts: ConfigureOptions): void {
    try {
      const client = FeddyClient.create(opts);
      setCurrentClient(client);
      refreshInBackground(client);
      // Bump SmartReview session counter so the install-age + sessions
      // gates have meaningful state. Fire-and-forget; failures don't
      // affect configure.
      void smartReview.bumpSession().catch((err) => {
        logError('configure.bumpSession', err);
      });
      if (opts.autoDetectSubscription !== false) {
        // Read the host app's currently-active entitlement from
        // expo-iap once at configure time. Mirrors iOS's StoreKit
        // detector triggered on configure. Fire-and-forget — when
        // expo-iap is absent or the host hasn't initialised it yet,
        // detector returns null and we just skip writing.
        void (async () => {
          try {
            const detected = await detectActiveSubscription();
            await setAutoDetectedSubscription(detected);
          } catch (err) {
            logError('configure.detectSubscription', err);
          }
        })();
      }
      // Drain any submits that failed to reach the server during a
      // previous launch (kill while offline, server outage, etc).
      // Fire-and-forget; failures are logged inside replayQueue.
      void replayQueue(client).catch((err) => {
        logError('configure.replayQueue', err);
      });
    } catch (err) {
      logError('configure', err);
    }
  },

  /**
   * Identify the current end user. Call this from your auth handler.
   * All fields are optional; when none are passed, the SDK falls back
   * to a per-install anonymous token so writes still attribute
   * correctly. The most recent `Feddy.setSubscription(...)` value (if
   * any) is attached automatically.
   */
  identify(opts: IdentifyOptions = {}): void {
    const client = getCurrentClient();
    if (!client) {
      console.warn('[Feddy] identify called before configure — ignoring');
      return;
    }
    void (async () => {
      try {
        const externalUserId = opts.userId;
        if (externalUserId != null) {
          await setLastExternalUserId(externalUserId);
        }
        const anonymousToken =
          externalUserId == null ? await getAnonymousToken() : undefined;
        // Refresh auto-detected subscription before serializing the
        // identify payload so the most recent entitlement state lands
        // server-side. Manual override (set via Feddy.setSubscription)
        // still takes precedence — see getEffectiveSubscription.
        if (client.autoDetectSubscription) {
          try {
            const detected = await detectActiveSubscription();
            await setAutoDetectedSubscription(detected);
          } catch (err) {
            logError('identify.detectSubscription', err);
          }
        }
        const subscription = await getEffectiveSubscription();
        const subscriptionPayload = subscription
          ? {
              is_paid: subscription.isPaid,
              status: subscription.status,
              product_id: subscription.productId,
              expires_at: subscription.expiresAt,
            }
          : undefined;
        const response = await client.post<{
          attachments_enabled?: boolean;
        }>('/v1/identify', {
          external_user_id: externalUserId,
          anonymous_token: anonymousToken,
          email: opts.email,
          display_name: opts.displayName,
          avatar_url: opts.avatarUrl,
          subscription: subscriptionPayload,
        });
        // Cache the server flag so the compose view's attachment
        // entry UI knows whether to render.
        await setAttachmentsEnabled(response?.attachments_enabled ?? false);
      } catch (err) {
        logError('identify', err);
      }
    })();
  },

  /**
   * Submit a feedback / feature request / bug report on behalf of the
   * current end user. Fire-and-forget: errors are logged. Use
   * `Feddy.openFeedback()` for the built-in compose modal instead.
   */
  submitRequest(opts: SubmitRequestOptions): void {
    const client = getCurrentClient();
    if (!client) {
      console.warn('[Feddy] submitRequest called before configure — ignoring');
      return;
    }
    const trimmed = opts.title.trim();
    if (trimmed.length === 0) {
      console.error('[Feddy] submitRequest title must not be empty');
      return;
    }
    void (async () => {
      // Upload attachments first (≤3, sequential) — failures are
      // skipped, the request still creates with whichever uploaded.
      const attachmentKeys: string[] = [];
      if (opts.imageUris && opts.imageUris.length > 0) {
        for (const uri of opts.imageUris.slice(0, 3)) {
          try {
            const key = await uploadAttachment(client, uri);
            attachmentKeys.push(key);
          } catch (err) {
            console.error(
              '[Feddy] attachment upload failed — skipping one image:',
              err instanceof Error ? err.message : err
            );
          }
        }
      }

      const externalUserId = await getLastExternalUserId();
      const anonymousToken =
        externalUserId == null ? await getAnonymousToken() : undefined;
      const trimmedDescription = opts.description?.trim();
      const body: Record<string, unknown> = {
        external_user_id: externalUserId ?? undefined,
        anonymous_token: anonymousToken,
        title: trimmed,
        description:
          trimmedDescription && trimmedDescription.length > 0
            ? trimmedDescription
            : undefined,
        board_key: opts.boardKey,
        attachment_keys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
      };

      try {
        await client.post('/v1/requests', body);
      } catch (err) {
        // Network failure → persist for replay on next configure().
        // HTTP 4xx/5xx (server-validated rejection) still surfaces
        // as a logged error and is NOT queued — the body is invalid
        // and retries would loop forever.
        if (err instanceof FeddyError && err.code === 'network') {
          try {
            await enqueueSubmit(body);
            console.warn(
              '[Feddy] submitRequest offline — queued for retry on next configure()'
            );
          } catch (queueErr) {
            logError('submitRequest.enqueue', queueErr);
          }
          return;
        }
        logError('submitRequest', err);
      }
    })();
  },

  /**
   * Present the built-in feedback compose modal. Requires
   * `<FeddyProvider />` mounted at your app root.
   */
  openFeedback(opts?: OpenFeedbackOptions): void {
    if (!getCurrentClient()) {
      console.warn('[Feddy] openFeedback called before configure — ignoring');
      return;
    }
    uiState.open(opts);
  },

  /**
   * Override the subscription snapshot the SDK attaches to its next
   * `identify(...)` call. Use when your app's source-of-truth for paid
   * state is RevenueCat, Adapty, or your own server. Manual override
   * always wins over the auto-detected `expo-iap` snapshot.
   *
   * Pass `null` to clear the override and let the auto-detected value
   * (if any) take effect again.
   *
   * Persists across launches via AsyncStorage.
   */
  setSubscription(subscription: Subscription | null): void {
    void setStoredSubscription(subscription).catch((err) => {
      logError('setSubscription', err);
    });
  },

  /**
   * Re-read the host app's currently-active subscription from
   * `expo-iap` (StoreKit 2 on iOS, Play Billing on Android). Call
   * after a purchase, restore, or subscription state change so the
   * SDK's snapshot stays fresh.
   *
   * Fire-and-forget. No-op when `expo-iap` isn't installed or the host
   * disabled `autoDetectSubscription`. The manual override set by
   * `setSubscription(...)` is unaffected.
   */
  refreshSubscription(): void {
    const client = getCurrentClient();
    if (!client) {
      console.warn(
        '[Feddy] refreshSubscription called before configure — ignoring'
      );
      return;
    }
    if (!client.autoDetectSubscription) return;
    void (async () => {
      try {
        const detected = await detectActiveSubscription();
        await setAutoDetectedSubscription(detected);
      } catch (err) {
        logError('refreshSubscription', err);
      }
    })();
  },

  /**
   * Drops any previously configured client and forgets the last
   * identified user + manual subscription override. The anonymous
   * token is intentionally **not** cleared so subsequent writes from
   * the same install still link to any pre-existing anonymous history.
   */
  reset(): void {
    setCurrentClient(null);
    void setLastExternalUserId(null).catch((err) => {
      logError('reset.identity', err);
    });
    void clearStoredSubscription().catch((err) => {
      logError('reset.subscription', err);
    });
    void clearAutoDetectedSubscription().catch((err) => {
      logError('reset.subscription.auto', err);
    });
    void clearCapabilitiesCache().catch((err) => {
      logError('reset.cache', err);
    });
    void clearQueue().catch((err) => {
      logError('reset.queue', err);
    });
    uiState.close();
  },

  // ---------- Read-side public surface (Promise-returning) ----------

  /**
   * Fetch the workspace's public, non-archived boards. Cached locally
   * for 1h with stale-while-revalidate; falls back to the bundled
   * system defaults (`Feature Requests` / `Bug Reports`) on network
   * failure.
   *
   * The built-in compose modal calls this automatically, so most hosts
   * don't need to invoke it directly. Useful when rendering a custom
   * board picker outside the SDK's modals.
   */
  async fetchBoards() {
    return boardsApi.fetchBoards(requireClient('fetchBoards'));
  },

  /**
   * Fetch one page of public-roadmap requests for this workspace.
   * Items are ordered newest-first.
   */
  async fetchRequests(opts: FetchRequestsOptions = {}): Promise<RequestList> {
    return readApi.fetchRequests(requireClient('fetchRequests'), opts);
  },

  /**
   * Fetch a single roadmap request by id. Returns 404 for non-public
   * statuses (`pending` / `reviewed` / `rejected` / `duplicate`).
   */
  async fetchRequest(id: string): Promise<FeedbackRequest> {
    return readApi.fetchRequest(requireClient('fetchRequest'), id);
  },

  /**
   * Fetch comments on a roadmap request, oldest-first. Internal-only
   * operator comments are filtered server-side and never reach the
   * SDK.
   */
  async fetchComments(opts: FetchCommentsOptions): Promise<CommentList> {
    return readApi.fetchComments(requireClient('fetchComments'), opts);
  },

  /**
   * Toggle the current end user's vote on a roadmap request.
   * Idempotent — calling twice in a row first creates the vote, then
   * removes it. Returns the new state.
   */
  async upvote(opts: UpvoteOptions): Promise<VoteState> {
    return readApi.upvote(requireClient('upvote'), opts);
  },

  /**
   * Append a comment to a roadmap request, authored by the current
   * end user.
   */
  async addComment(opts: AddCommentOptions): Promise<FeedbackComment> {
    return readApi.addComment(requireClient('addComment'), opts);
  },

  // ---------- Smart Review ----------

  /**
   * Ask the SDK to consider showing a Smart Review prompt right now.
   * Call from any "user just had a good moment" hook — onboarding
   * completed, save succeeded, level cleared, support ticket marked
   * resolved, etc. The SDK's built-in gates decide whether to actually
   * present anything:
   *
   * - At least 7 days since the SDK first ran on this install
   * - At least 5 cumulative `configure(...)` calls
   * - At least 90 days since the last actual presentation
   * - At most 3 presentations in any rolling 365-day window
   *
   * If all gates pass, a 5-star pre-prompt sheet appears:
   *
   * - **≥ 4 stars** → triggers the system review prompt via
   *   `expo-store-review` (peer dep). The Apple / Play UI handles the
   *   rest; the SDK never sees what the user types into the App Store.
   * - **≤ 3 stars** → presents the built-in compose modal so the
   *   feedback is captured privately instead of as a public 1-3 star
   *   review. This is the "review shield".
   *
   * Fire-and-forget: returns immediately. Requires `<FeddyProvider />`
   * mounted at your app root.
   */
  requestReviewIfAppropriate(opts: RequestReviewOptions = {}): void {
    void smartReview.requestReviewIfAppropriate(opts).catch((err) => {
      logError('requestReviewIfAppropriate', err);
    });
  },

  /**
   * Clear every persisted Smart Review counter — install date, session
   * count, last-shown timestamp, yearly counter.
   *
   * **Debug menus only.** Calling this in production lets users see
   * the prompt more often than designed; the App Store / Play Store
   * also throttle independently and resetSmartReviewState does not
   * reset their counts.
   */
  resetSmartReviewState(): void {
    void smartReview.resetSmartReviewState().catch((err) => {
      logError('resetSmartReviewState', err);
    });
  },
};
