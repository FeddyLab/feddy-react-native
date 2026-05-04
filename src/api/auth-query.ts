import { getAnonymousToken, getLastExternalUserId } from '../identity';

/**
 * Build the `as_external_user_id` / `as_anonymous_token` query pair
 * that read endpoints use to compute the per-item `voted` flag.
 * Mirrors how vote / addComment auto-fill body identifiers.
 */
export async function asUserQuery(): Promise<
  Record<string, string | undefined>
> {
  const externalUserId = await getLastExternalUserId();
  if (externalUserId != null) {
    return { as_external_user_id: externalUserId };
  }
  const anonymousToken = await getAnonymousToken();
  return { as_anonymous_token: anonymousToken };
}
