export type ApiKeyValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

const API_KEY_REGEX = /^fed_[A-Za-z0-9]{12}$/;

export function validateApiKey(raw: string): ApiKeyValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Project ID is empty.' };
  }
  if (trimmed.startsWith('fed_sk_')) {
    return {
      ok: false,
      reason:
        'Server API keys (fed_sk_*) must not be embedded in clients. Use your Project ID (fed_xxxxxxxxxxxx) instead.',
    };
  }
  if (!API_KEY_REGEX.test(trimmed)) {
    return {
      ok: false,
      reason:
        'Invalid Project ID. Expected format: fed_ followed by 12 alphanumeric characters.',
    };
  }
  return { ok: true, value: trimmed };
}
