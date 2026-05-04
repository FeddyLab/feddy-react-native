import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.4' },
}));

import { DEFAULT_BASE_URL, FeddyClient, FeddyError } from '../client';

describe('FeddyClient.create', () => {
  it('returns a client for a valid Project ID', () => {
    const c = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    expect(c.apiKey).toBe('fed_abc123def456');
    expect(c.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it('respects custom baseUrl', () => {
    const c = FeddyClient.create({
      apiKey: 'fed_abc123def456',
      baseUrl: 'https://staging.api.feddy.app',
    });
    expect(c.baseUrl).toBe('https://staging.api.feddy.app');
  });

  it('throws FeddyError(invalid_api_key) on fed_sk_* keys', () => {
    let caught: unknown;
    try {
      FeddyClient.create({ apiKey: 'fed_sk_abcdef123456' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FeddyError);
    expect((caught as FeddyError).code).toBe('invalid_api_key');
  });

  it('throws FeddyError(invalid_api_key) on empty apiKey', () => {
    expect(() => FeddyClient.create({ apiKey: '' })).toThrow(FeddyError);
  });

  it('throws FeddyError(invalid_api_key) on malformed apiKey', () => {
    expect(() => FeddyClient.create({ apiKey: 'not-a-key' })).toThrow(
      FeddyError
    );
  });
});

describe('FeddyClient.post (network paths)', () => {
  it('throws FeddyError(network) when fetch rejects', async () => {
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('connection refused'));
    let caught: unknown;
    try {
      await client.post('/v1/identify', {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FeddyError);
    expect((caught as FeddyError).code).toBe('network');
    fetchSpy.mockRestore();
  });

  it('throws FeddyError(http) with envelope code on 4xx', async () => {
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'unauthorized', message: 'bad key' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    let caught: unknown;
    try {
      await client.post('/v1/identify', {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FeddyError);
    const e = caught as FeddyError;
    expect(e.code).toBe('http');
    expect(e.status).toBe(401);
    expect(e.serverCode).toBe('unauthorized');
    expect(e.message).toBe('bad key');
    fetchSpy.mockRestore();
  });
});
