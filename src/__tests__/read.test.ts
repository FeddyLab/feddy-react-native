import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.4' },
}));

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (k: string) => Promise.resolve(storage.get(k) ?? null),
    setItem: (k: string, v: string) => {
      storage.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      storage.delete(k);
      return Promise.resolve();
    },
  },
}));

import { addComment, fetchRequest, fetchRequests, upvote } from '../api/read';
import { FeddyClient, FeddyError } from '../client';

function mockJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('read API URL building + decoding', () => {
  it('fetchRequests sends limit + cursor + status + as_anonymous_token', async () => {
    storage.clear();
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockJsonResponse({ items: [], next_cursor: null })
      );

    await fetchRequests(client, {
      boardKey: 'features',
      status: 'planned',
      limit: 50,
      cursor: 'cur_1',
    });

    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('/v1/requests');
    expect(url).toContain('limit=50');
    expect(url).toContain('cursor=cur_1');
    expect(url).toContain('board_key=features');
    expect(url).toContain('status=planned');
    expect(url).toContain('as_anonymous_token=');
    fetchSpy.mockRestore();
  });

  it('fetchRequests clamps limit to 100', async () => {
    storage.clear();
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockJsonResponse({ items: [], next_cursor: null })
      );

    await fetchRequests(client, { limit: 9999 });

    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('limit=100');
    fetchSpy.mockRestore();
  });

  it('fetchRequest URL-encodes the id segment', async () => {
    storage.clear();
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockJsonResponse({
        id: 'req with spaces',
        title: 't',
        status: 'planned',
        board_id: 'b',
        created_at: '2026-01-01T00:00:00Z',
      })
    );

    await fetchRequest(client, 'req with spaces');

    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('/v1/requests/req%20with%20spaces');
    fetchSpy.mockRestore();
  });

  it('fetchRequest rejects empty id with FeddyError(invalid_payload)', async () => {
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    let caught: unknown;
    try {
      await fetchRequest(client, '   ');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FeddyError);
    expect((caught as FeddyError).code).toBe('invalid_payload');
  });

  it('upvote posts to /v1/requests/<id>/vote with auth body', async () => {
    storage.clear();
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse({ voted: true, vote_count: 1 }));

    const result = await upvote(client, { requestId: 'req_1' });

    expect(result).toEqual({ voted: true, voteCount: 1 });
    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('/v1/requests/req_1/vote');
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    fetchSpy.mockRestore();
  });

  it('addComment rejects empty body with FeddyError(invalid_payload)', async () => {
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    let caught: unknown;
    try {
      await addComment(client, { requestId: 'req_1', body: '   ' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FeddyError);
    expect((caught as FeddyError).code).toBe('invalid_payload');
  });

  it('addComment trims body before sending', async () => {
    storage.clear();
    const client = FeddyClient.create({ apiKey: 'fed_abc123def456' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockJsonResponse({
        id: 'cmt_1',
        content: 'hi',
        created_at: '2026-01-01T00:00:00Z',
      })
    );

    await addComment(client, { requestId: 'req_1', body: '  hi  ' });

    const init = fetchSpy.mock.calls[0]?.[1];
    const body = JSON.parse(init?.body as string);
    expect(body.content).toBe('hi');
    fetchSpy.mockRestore();
  });
});
