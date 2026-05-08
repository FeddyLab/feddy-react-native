import type {
  Attachment,
  CommentList,
  FeedbackComment,
  FeedbackRequest,
  RequestList,
  VoteState,
} from '../types';

interface RawAttachment {
  key: string;
  asset_url: string;
  content_type: string;
  size: number;
}

interface RawFeedbackRequest {
  id: string;
  title: string;
  description?: string;
  request_type?: string;
  status: string;
  priority?: string;
  board_id: string;
  board_key?: string;
  official_reply?: string | null;
  vote_count?: number;
  voted?: boolean;
  created_at: string;
  attachments?: RawAttachment[];
}

interface RawFeedbackComment {
  id: string;
  content: string;
  author_end_user_id?: string | null;
  author_kind?: string;
  author_display_name?: string | null;
  is_self?: boolean;
  created_at: string;
  updated_at?: string;
}

interface RawList<T> {
  items: T[];
  next_cursor: string | null;
}

export function decodeAttachment(raw: RawAttachment): Attachment {
  return {
    key: raw.key,
    assetUrl: raw.asset_url,
    contentType: raw.content_type,
    size: raw.size,
  };
}

export function decodeFeedbackRequest(
  raw: RawFeedbackRequest
): FeedbackRequest {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    requestType: raw.request_type ?? 'feature',
    status: raw.status,
    priority: raw.priority ?? 'medium',
    boardId: raw.board_id,
    boardKey: raw.board_key ?? '',
    officialReply: raw.official_reply ?? null,
    voteCount: raw.vote_count ?? 0,
    voted: raw.voted ?? false,
    createdAt: raw.created_at,
    attachments: (raw.attachments ?? []).map(decodeAttachment),
  };
}

export function decodeFeedbackComment(
  raw: RawFeedbackComment
): FeedbackComment {
  const kind: FeedbackComment['authorKind'] =
    raw.author_kind === 'admin'
      ? 'admin'
      : raw.author_kind === 'end_user'
        ? 'end_user'
        : 'unknown';
  return {
    id: raw.id,
    content: raw.content,
    authorEndUserId: raw.author_end_user_id ?? null,
    authorKind: kind,
    authorDisplayName: raw.author_display_name ?? null,
    isSelf: raw.is_self === true,
    createdAt: raw.created_at,
    // POST /v1/requests/:id/comments doesn't return updated_at on the
    // freshly-created row; default to created_at so the SDK can still
    // surface the row immediately.
    updatedAt: raw.updated_at ?? raw.created_at,
  };
}

export function decodeRequestList(
  raw: RawList<RawFeedbackRequest>
): RequestList {
  return {
    items: raw.items.map(decodeFeedbackRequest),
    nextCursor: raw.next_cursor,
  };
}

export function decodeCommentList(
  raw: RawList<RawFeedbackComment>
): CommentList {
  return {
    items: raw.items.map(decodeFeedbackComment),
    nextCursor: raw.next_cursor,
  };
}

export function decodeVoteState(raw: {
  voted: boolean;
  vote_count: number;
}): VoteState {
  return {
    voted: raw.voted,
    voteCount: raw.vote_count,
  };
}
