import AsyncStorage from '@react-native-async-storage/async-storage';

const ANON_TOKEN_KEY = 'app.feddy.anonymousToken';
const LAST_USER_ID_KEY = 'app.feddy.lastExternalUserId';
const ATTACHMENTS_ENABLED_KEY = 'app.feddy.attachmentsEnabled';

function generateAnonymousToken(): string {
  // RFC4122 v4-ish UUID using Math.random — sufficient for an opaque
  // per-install token (not used as a security boundary).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getAnonymousToken(): Promise<string> {
  const existing = await AsyncStorage.getItem(ANON_TOKEN_KEY);
  if (existing && existing.length > 0) return existing;
  const fresh = generateAnonymousToken();
  await AsyncStorage.setItem(ANON_TOKEN_KEY, fresh);
  return fresh;
}

export async function getLastExternalUserId(): Promise<string | null> {
  const value = await AsyncStorage.getItem(LAST_USER_ID_KEY);
  return value && value.length > 0 ? value : null;
}

export async function setLastExternalUserId(
  value: string | null
): Promise<void> {
  if (value && value.length > 0) {
    await AsyncStorage.setItem(LAST_USER_ID_KEY, value);
  } else {
    await AsyncStorage.removeItem(LAST_USER_ID_KEY);
  }
}

/**
 * Cached server flag from the last successful `/v1/identify` call.
 * `false` until identify confirms otherwise — the SDK hides the
 * attachment UI rather than showing it speculatively and having
 * uploads rejected.
 */
export async function getAttachmentsEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ATTACHMENTS_ENABLED_KEY);
  return v === '1';
}

export async function setAttachmentsEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ATTACHMENTS_ENABLED_KEY, value ? '1' : '0');
}
