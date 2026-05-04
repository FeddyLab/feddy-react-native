import type { FeddyClient } from '../client';
import { FeddyError } from '../client';
import { buildHeaders } from '../headers';
import { compressImage } from './compress';

interface SignResponse {
  upload_url: string;
  asset_url: string;
  key: string;
}

/**
 * Two-step attachment upload mirroring iOS:
 *
 * 1. `POST /v1/attachments/sign` — server returns an HMAC-signed
 *    upload ticket (URL + key + ttl). Server gates here: workspaces
 *    without attachments enabled get `feature_not_available` and the
 *    SDK should never have called this in the first place (the entry
 *    UI is hidden).
 * 2. `PUT <upload_url>` — raw JPEG bytes streamed to R2.
 *
 * Returns the attachment key, which the caller passes in
 * `attachment_keys` on the subsequent `POST /v1/requests`.
 */
export async function uploadAttachment(
  client: FeddyClient,
  imageUri: string
): Promise<string> {
  const compressed = await compressImage(imageUri);

  const sign = await client.post<SignResponse>('/v1/attachments/sign', {
    content_type: 'image/jpeg',
    size: compressed.size,
  });

  await putBytes(client, sign.upload_url, compressed.uri);
  return sign.key;
}

async function putBytes(
  client: FeddyClient,
  uploadPath: string,
  fileUri: string
): Promise<void> {
  const url = uploadPath.startsWith('http')
    ? uploadPath
    : `${client.baseUrl}${uploadPath}`;

  const fileBlob = await (await fetch(fileUri)).blob();

  // Reuse buildHeaders so the X-Feddy-* headers ride along on the upload
  // (server tolerates them on the upload endpoint, useful for telemetry).
  const headers = buildHeaders(client.apiKey);
  headers['Content-Type'] = 'image/jpeg';

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers,
      body: fileBlob,
    });
  } catch (err) {
    throw new FeddyError({
      code: 'network',
      message: err instanceof Error ? err.message : 'Upload network error',
    });
  }

  if (!response.ok) {
    let envelopeCode: string | undefined;
    let envelopeMessage: string | undefined;
    try {
      const text = await response.text();
      if (text) {
        const parsed = JSON.parse(text) as {
          code?: string;
          message?: string;
        };
        envelopeCode = parsed.code;
        envelopeMessage = parsed.message;
      }
    } catch {
      // server returned non-JSON
    }
    throw new FeddyError({
      code: 'http',
      status: response.status,
      serverCode: envelopeCode,
      message:
        envelopeMessage ?? `HTTP ${response.status} during attachment upload`,
    });
  }
}
