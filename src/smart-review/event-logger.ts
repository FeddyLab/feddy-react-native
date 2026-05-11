import type { FeddyClient } from '../client';
import { getAnonymousToken, getLastExternalUserId } from '../identity';

export type ReviewPromptEventStage =
  | 'shown'
  | 'liked'
  | 'disliked'
  | 'routed_store'
  | 'routed_feedback'
  | 'dismissed_store_confirm'
  | 'dismissed';

export interface LogEventArgs {
  stage: ReviewPromptEventStage;
  trigger?: string;
}

/**
 * Funnel telemetry for Smart Review. Fire-and-forget — failures are
 * logged and dropped. Telemetry must never affect the user's prompt
 * experience (no retries, no offline queue, no thrown errors).
 */
export function logEvent(client: FeddyClient, args: LogEventArgs): void {
  void (async () => {
    try {
      const externalUserId = await getLastExternalUserId();
      const anonymousToken =
        externalUserId == null ? await getAnonymousToken() : undefined;
      await client.post('/v1/review-prompt-events', {
        external_user_id: externalUserId ?? undefined,
        anonymous_token: anonymousToken,
        stage: args.stage,
        trigger: args.trigger,
      });
    } catch (err) {
      console.error(
        `[Feddy] SmartReview event '${args.stage}' upload failed —`,
        err instanceof Error ? err.message : err
      );
    }
  })();
}
