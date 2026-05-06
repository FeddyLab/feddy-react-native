import { validateApiKey } from './api-key';
import { buildHeaders } from './headers';
import type { FeddyErrorCode } from './types';

export const DEFAULT_BASE_URL = 'https://api.feddy.app';

export class FeddyError extends Error {
  readonly code: FeddyErrorCode;
  readonly status?: number;
  readonly serverCode?: string;

  constructor(opts: {
    code: FeddyErrorCode;
    message: string;
    status?: number;
    serverCode?: string;
  }) {
    super(opts.message);
    this.name = 'FeddyError';
    this.code = opts.code;
    this.status = opts.status;
    this.serverCode = opts.serverCode;
  }
}

interface ServerErrorEnvelope {
  code?: string;
  message?: string;
}

export class FeddyClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly autoDetectSubscription: boolean;

  private constructor(
    apiKey: string,
    baseUrl: string,
    autoDetectSubscription: boolean
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.autoDetectSubscription = autoDetectSubscription;
  }

  static create(opts: {
    apiKey: string;
    baseUrl?: string;
    autoDetectSubscription?: boolean;
  }): FeddyClient {
    const validation = validateApiKey(opts.apiKey);
    if (!validation.ok) {
      throw new FeddyError({
        code: 'invalid_api_key',
        message: validation.reason,
      });
    }
    return new FeddyClient(
      validation.value,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.autoDetectSubscription !== false
    );
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, 'POST', body);
  }

  async get<T = unknown>(
    path: string,
    query: Record<string, string | undefined> = {}
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v.length > 0) params.set(k, v);
    }
    const qs = params.toString();
    const fullPath = qs ? `${path}?${qs}` : path;
    return this.request<T>(fullPath, 'GET', undefined);
  }

  private async request<T>(
    path: string,
    method: string,
    body: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = buildHeaders(this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new FeddyError({
        code: 'network',
        message: err instanceof Error ? err.message : 'Unknown network error',
      });
    }

    const text = await response.text();
    if (!response.ok) {
      let envelope: ServerErrorEnvelope = {};
      try {
        envelope = text ? (JSON.parse(text) as ServerErrorEnvelope) : {};
      } catch {
        // server returned non-JSON; envelope stays empty
      }
      throw new FeddyError({
        code: 'http',
        status: response.status,
        serverCode: envelope.code,
        message: envelope.message ?? `HTTP ${response.status} from ${path}`,
      });
    }

    if (text.length === 0) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new FeddyError({
        code: 'decoding',
        message:
          err instanceof Error
            ? err.message
            : 'Response body is not valid JSON',
      });
    }
  }
}
