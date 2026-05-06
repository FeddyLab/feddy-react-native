export interface ConfigureOptions {
  apiKey: string;
  baseUrl?: string;
  /**
   * When `true` (default), the SDK reads the host app's currently-active
   * subscription from `expo-iap` (StoreKit 2 on iOS, Play Billing on
   * Android) once after `configure(...)` and again on each
   * `identify(...)` so feedback rows in the dashboard carry up-to-date
   * subscription state.
   *
   * Set to `false` if your app's source-of-truth for paid state is
   * RevenueCat / Adapty / your own server — pass the result of that
   * source to `Feddy.setSubscription(...)` instead.
   *
   * Auto-detection requires the `expo-iap` peer dep to be installed.
   * When it's absent the SDK silently skips detection and only the
   * manual `Feddy.setSubscription(...)` override is used.
   */
  autoDetectSubscription?: boolean;
}

export interface IdentifyOptions {
  userId?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface SubmitRequestOptions {
  title: string;
  description?: string;
  boardKey?: string;
  /**
   * Image URIs to upload as attachments. v0.1 supports up to 3 per
   * request, ≤800KB each (auto-compressed). Gated server-side by the
   * workspace's `attachments_enabled` capability — use the URIs
   * returned from `expo-image-picker`.
   */
  imageUris?: string[];
}

export interface OpenFeedbackOptions {
  boardKey?: string;
}

/**
 * A board to display in the compose view's picker. The `key` is what
 * the SDK writes to `request.board_key` on submit; the `name` is what
 * the user sees.
 */
export interface FeedbackBoard {
  key: string;
  name: string;
}

export interface Branding {
  show: boolean;
  text: string;
  url: string;
  logoUrl: string | null;
}

export type FeddyErrorCode =
  | 'not_configured'
  | 'invalid_api_key'
  | 'invalid_payload'
  | 'network'
  | 'http'
  | 'decoding';

// ---------- Read-side domain types (mirror iOS Feddy.* names) ----------

/**
 * The three publicly-visible roadmap statuses. Backend rejects any
 * other value as `invalid_query` so internal triage state never leaks.
 */
export type RoadmapStatus = 'planned' | 'in_progress' | 'completed';

export interface Attachment {
  key: string;
  assetUrl: string;
  contentType: string;
  size: number;
}

export interface FeedbackRequest {
  id: string;
  title: string;
  description: string;
  requestType: string;
  /**
   * One of `pending` / `planned` / `in_progress` / `completed` /
   * `reviewed` / `rejected` / `duplicate`. The list endpoint only
   * returns the public-roadmap subset; the detail endpoint applies the
   * same filter so any non-public id 404s.
   */
  status: string;
  priority: string;
  boardId: string;
  boardKey: string;
  officialReply: string | null;
  voteCount: number;
  /** Whether the current end user has voted on this request. */
  voted: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
  attachments: Attachment[];
}

export interface RequestList {
  items: FeedbackRequest[];
  /** Pass back as `cursor` to load the next page; `null` = no more. */
  nextCursor: string | null;
}

export interface FeedbackComment {
  id: string;
  content: string;
  authorEndUserId: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

export interface CommentList {
  items: FeedbackComment[];
  nextCursor: string | null;
}

export interface VoteState {
  voted: boolean;
  voteCount: number;
}

// ---------- Subscription (manual override + auto-detect via expo-iap) ----------

export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'none';

export interface Subscription {
  isPaid: boolean;
  status: SubscriptionStatus;
  productId?: string;
  /** ISO 8601 timestamp. */
  expiresAt?: string;
}

// ---------- Method options ----------

export interface FetchRequestsOptions {
  boardKey?: string;
  status?: RoadmapStatus;
  /** 1..100, defaults to 20. */
  limit?: number;
  cursor?: string;
}

export interface FetchCommentsOptions {
  requestId: string;
  /** 1..100, defaults to 20. */
  limit?: number;
  cursor?: string;
}

export interface UpvoteOptions {
  requestId: string;
}

export interface AddCommentOptions {
  requestId: string;
  body: string;
}
