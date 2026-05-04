import { describe, expect, it } from 'vitest';
import {
  decodeAttachment,
  decodeCommentList,
  decodeFeedbackComment,
  decodeFeedbackRequest,
  decodeRequestList,
  decodeVoteState,
} from '../api/decoders';

describe('decodeAttachment', () => {
  it('maps snake_case wire fields to camelCase', () => {
    const decoded = decodeAttachment({
      key: 'att_abc',
      asset_url: 'https://cdn.feddy.app/att_abc.jpg',
      content_type: 'image/jpeg',
      size: 12345,
    });
    expect(decoded).toEqual({
      key: 'att_abc',
      assetUrl: 'https://cdn.feddy.app/att_abc.jpg',
      contentType: 'image/jpeg',
      size: 12345,
    });
  });
});

describe('decodeFeedbackRequest', () => {
  it('decodes a full payload', () => {
    const r = decodeFeedbackRequest({
      id: 'req_1',
      title: 'Add dark mode',
      description: 'Pretty please',
      request_type: 'feature',
      status: 'planned',
      priority: 'high',
      board_id: 'brd_1',
      board_key: 'features',
      official_reply: 'Coming soon',
      vote_count: 42,
      voted: true,
      created_at: '2026-05-04T10:00:00Z',
      attachments: [
        {
          key: 'a',
          asset_url: 'https://x',
          content_type: 'image/jpeg',
          size: 1,
        },
      ],
    });
    expect(r.officialReply).toBe('Coming soon');
    expect(r.voteCount).toBe(42);
    expect(r.voted).toBe(true);
    expect(r.boardKey).toBe('features');
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0]?.assetUrl).toBe('https://x');
  });

  it('defaults missing optional fields', () => {
    const r = decodeFeedbackRequest({
      id: 'req_2',
      title: 'No description',
      status: 'planned',
      board_id: 'brd_1',
      created_at: '2026-05-04T10:00:00Z',
    });
    expect(r.description).toBe('');
    expect(r.requestType).toBe('feature');
    expect(r.priority).toBe('medium');
    expect(r.boardKey).toBe('');
    expect(r.officialReply).toBeNull();
    expect(r.voteCount).toBe(0);
    expect(r.voted).toBe(false);
    expect(r.attachments).toEqual([]);
  });
});

describe('decodeFeedbackComment', () => {
  it('falls back updatedAt → createdAt when server omits it', () => {
    const c = decodeFeedbackComment({
      id: 'cmt_1',
      content: 'Nice idea',
      author_end_user_id: 'eu_1',
      created_at: '2026-05-04T10:00:00Z',
    });
    expect(c.updatedAt).toBe('2026-05-04T10:00:00Z');
    expect(c.authorEndUserId).toBe('eu_1');
  });
});

describe('decodeRequestList / decodeCommentList', () => {
  it('decodes pagination cursor', () => {
    const list = decodeRequestList({
      items: [],
      next_cursor: 'cursor_xyz',
    });
    expect(list.nextCursor).toBe('cursor_xyz');
  });

  it('handles null nextCursor', () => {
    const list = decodeCommentList({ items: [], next_cursor: null });
    expect(list.nextCursor).toBeNull();
  });
});

describe('decodeVoteState', () => {
  it('maps vote_count → voteCount', () => {
    const v = decodeVoteState({ voted: true, vote_count: 17 });
    expect(v).toEqual({ voted: true, voteCount: 17 });
  });
});
