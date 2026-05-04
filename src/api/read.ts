import type { FeddyClient } from '../client';
import { FeddyError } from '../client';
import { getAnonymousToken, getLastExternalUserId } from '../identity';
import type {
  AddCommentOptions,
  CommentList,
  FeedbackComment,
  FeedbackRequest,
  FetchCommentsOptions,
  FetchRequestsOptions,
  RequestList,
  UpvoteOptions,
  VoteState,
} from '../types';
import { asUserQuery } from './auth-query';
import {
  decodeCommentList,
  decodeFeedbackComment,
  decodeFeedbackRequest,
  decodeRequestList,
  decodeVoteState,
} from './decoders';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function escapeId(id: string, label: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new FeddyError({
      code: 'invalid_payload',
      message: `${label} must not be empty`,
    });
  }
  return encodeURIComponent(trimmed);
}

export async function fetchRequests(
  client: FeddyClient,
  opts: FetchRequestsOptions = {}
): Promise<RequestList> {
  const limit = clamp(opts.limit ?? 20, 1, 100);
  const userQuery = await asUserQuery();
  const raw = await client.get<Parameters<typeof decodeRequestList>[0]>(
    '/v1/requests',
    {
      ...userQuery,
      board_key: opts.boardKey,
      status: opts.status,
      limit: String(limit),
      cursor: opts.cursor,
    }
  );
  return decodeRequestList(raw);
}

export async function fetchRequest(
  client: FeddyClient,
  id: string
): Promise<FeedbackRequest> {
  const escaped = escapeId(id, 'Request id');
  const userQuery = await asUserQuery();
  const raw = await client.get<Parameters<typeof decodeFeedbackRequest>[0]>(
    `/v1/requests/${escaped}`,
    userQuery
  );
  return decodeFeedbackRequest(raw);
}

export async function fetchComments(
  client: FeddyClient,
  opts: FetchCommentsOptions
): Promise<CommentList> {
  const escaped = escapeId(opts.requestId, 'Request id');
  const limit = clamp(opts.limit ?? 20, 1, 100);
  const raw = await client.get<Parameters<typeof decodeCommentList>[0]>(
    `/v1/requests/${escaped}/comments`,
    {
      limit: String(limit),
      cursor: opts.cursor,
    }
  );
  return decodeCommentList(raw);
}

export async function upvote(
  client: FeddyClient,
  opts: UpvoteOptions
): Promise<VoteState> {
  const escaped = escapeId(opts.requestId, 'Request id');
  const externalUserId = await getLastExternalUserId();
  const anonymousToken =
    externalUserId == null ? await getAnonymousToken() : undefined;
  const raw = await client.post<Parameters<typeof decodeVoteState>[0]>(
    `/v1/requests/${escaped}/vote`,
    {
      external_user_id: externalUserId ?? undefined,
      anonymous_token: anonymousToken,
    }
  );
  return decodeVoteState(raw);
}

export async function addComment(
  client: FeddyClient,
  opts: AddCommentOptions
): Promise<FeedbackComment> {
  const escaped = escapeId(opts.requestId, 'Request id');
  const trimmedBody = opts.body.trim();
  if (trimmedBody.length === 0) {
    throw new FeddyError({
      code: 'invalid_payload',
      message: 'Comment body must not be empty',
    });
  }
  const externalUserId = await getLastExternalUserId();
  const anonymousToken =
    externalUserId == null ? await getAnonymousToken() : undefined;
  const raw = await client.post<Parameters<typeof decodeFeedbackComment>[0]>(
    `/v1/requests/${escaped}/comments`,
    {
      external_user_id: externalUserId ?? undefined,
      anonymous_token: anonymousToken,
      content: trimmedBody,
    }
  );
  return decodeFeedbackComment(raw);
}
