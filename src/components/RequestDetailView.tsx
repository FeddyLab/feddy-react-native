import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as readApi from '../api/read';
import { FeddyError } from '../client';
import { t } from '../i18n';
import { getCurrentClient } from '../runtime';
import type { Attachment, FeedbackComment, FeedbackRequest } from '../types';
import {
  ErrorState,
  formatRelativeTime,
  IconButton,
  LoadingFullScreen,
  StatusChip,
  VoteButton,
} from './_shared';
import { PoweredByBadge } from './PoweredByBadge';

// ---------- Standalone Modal wrapper ----------

export interface RequestDetailViewProps {
  visible: boolean;
  requestId: string;
  onDismiss: () => void;
}

export function RequestDetailView({
  visible,
  requestId,
  onDismiss,
}: RequestDetailViewProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <RequestDetailContent requestId={requestId} onClose={onDismiss} />
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Inner content component (reusable in list/roadmap navigation) ----------

export interface RequestDetailContentProps {
  requestId: string;
  /** Show a back button (e.g. when nested inside RequestListView). */
  onBack?: () => void;
  /** Show a close button (e.g. when used as a standalone Modal). */
  onClose?: () => void;
}

export function RequestDetailContent({
  requestId,
  onBack,
  onClose,
}: RequestDetailContentProps) {
  const [detail, setDetail] = useState<FeedbackRequest | null>(null);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  const [voteOverride, setVoteOverride] = useState<number | null>(null);
  const [votePending, setVotePending] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    const client = getCurrentClient();
    if (!client) {
      setLoadError(t('compose.error.notConfigured'));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [d, c] = await Promise.all([
        readApi.fetchRequest(client, requestId),
        readApi.fetchComments(client, { requestId, limit: 20 }),
      ]);
      setDetail(d);
      setVoted(d.voted);
      setVoteOverride(null);
      setComments(c.items);
      setCommentsCursor(c.nextCursor);
    } catch (err) {
      setLoadError(err instanceof FeddyError ? err.message : t('list.error'));
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMoreComments = useCallback(async () => {
    if (isLoadingMoreComments || !commentsCursor) return;
    const client = getCurrentClient();
    if (!client) return;
    setIsLoadingMoreComments(true);
    try {
      const page = await readApi.fetchComments(client, {
        requestId,
        limit: 20,
        cursor: commentsCursor,
      });
      setComments((prev) => [...prev, ...page.items]);
      setCommentsCursor(page.nextCursor);
    } catch {
      // silently stop pagination
    } finally {
      setIsLoadingMoreComments(false);
    }
  }, [isLoadingMoreComments, commentsCursor, requestId]);

  const handleVoteTap = () => {
    if (votePending || !detail) return;
    const client = getCurrentClient();
    if (!client) return;
    const wasVoted = voted;
    const baseline = voteOverride ?? detail.voteCount;
    if (wasVoted) {
      setVoted(false);
      setVoteOverride(Math.max(0, baseline - 1));
    } else {
      setVoted(true);
      setVoteOverride(baseline + 1);
    }
    setVotePending(true);
    void (async () => {
      try {
        const state = await readApi.upvote(client, { requestId });
        setVoted(state.voted);
        setVoteOverride(state.voteCount);
      } catch {
        setVoted(wasVoted);
        setVoteOverride(baseline);
        Alert.alert(t('detail.vote.failed'), t('detail.tryAgain'));
      } finally {
        setVotePending(false);
      }
    })();
  };

  const handleSendComment = () => {
    const trimmed = commentDraft.trim();
    if (trimmed.length === 0 || isPostingComment) return;
    const client = getCurrentClient();
    if (!client) return;
    setIsPostingComment(true);
    void (async () => {
      try {
        const posted = await readApi.addComment(client, {
          requestId,
          body: trimmed,
        });
        setComments((prev) => [...prev, posted]);
        setCommentDraft('');
      } catch (err) {
        Alert.alert(
          t('detail.comment.failed'),
          err instanceof FeddyError ? err.message : t('detail.tryAgain')
        );
      } finally {
        setIsPostingComment(false);
      }
    })();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={styles.toolbar}>
        {onBack ? (
          <IconButton
            icon="‹"
            onPress={onBack}
            accessibilityLabel="Back"
            variant="primary"
            fontSize={32}
          />
        ) : (
          <View style={styles.toolbarSpacer} />
        )}
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {detail?.title ?? ''}
        </Text>
        {onClose ? (
          <IconButton
            icon="✕"
            onPress={onClose}
            accessibilityLabel={t('action.close')}
            circle
            fontSize={16}
          />
        ) : (
          <View style={styles.toolbarSpacer} />
        )}
      </View>

      {isLoading && !detail ? (
        <LoadingFullScreen />
      ) : loadError && !detail ? (
        <ErrorState message={loadError} onRetry={() => void loadInitial()} />
      ) : detail ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <Text style={styles.title}>{detail.title}</Text>
              <View style={styles.headerMeta}>
                <StatusChip status={detail.status} />
                <Text style={styles.headerDate}>
                  {formatRelativeTime(detail.createdAt)}
                </Text>
              </View>
            </View>
            <VoteButton
              count={voteOverride ?? detail.voteCount}
              voted={voted}
              pending={votePending}
              size="md"
              onPress={handleVoteTap}
            />
          </View>

          {detail.description.length > 0 ? (
            <Text style={styles.description}>{detail.description}</Text>
          ) : null}

          {detail.officialReply && detail.officialReply.length > 0 ? (
            <View style={styles.officialReply}>
              <Text style={styles.sectionLabel}>
                {t('detail.officialReply')}
              </Text>
              <Text style={styles.officialReplyBody}>
                {detail.officialReply}
              </Text>
            </View>
          ) : null}

          {detail.attachments.length > 0 ? (
            <View style={styles.attachmentsSection}>
              <Text style={styles.sectionLabel}>{t('detail.attachments')}</Text>
              <View style={styles.attachmentGrid}>
                {detail.attachments.map((att) => (
                  <AttachmentThumb
                    key={att.key}
                    attachment={att}
                    onPress={() => setLightboxUrl(att.assetUrl)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.commentsSection}>
            <Text style={styles.sectionLabel}>{t('detail.comments')}</Text>
            {comments.length === 0 ? (
              <Text style={styles.emptyComments}>
                {t('detail.comments.empty')}
              </Text>
            ) : (
              comments.map((c) => <CommentRow key={c.id} comment={c} />)
            )}
            {commentsCursor != null ? (
              <Pressable
                onPress={() => void loadMoreComments()}
                style={styles.loadMore}
              >
                {isLoadingMoreComments ? (
                  <ActivityIndicator size="small" color="#888" />
                ) : (
                  <Text style={styles.loadMoreText}>
                    {t('detail.comments.loadMore')}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          <PoweredByBadge />
        </ScrollView>
      ) : null}

      {detail ? (
        <View style={styles.composer}>
          <TextInput
            value={commentDraft}
            onChangeText={setCommentDraft}
            placeholder={t('detail.comment.placeholder')}
            placeholderTextColor="#999"
            style={styles.composerInput}
            editable={!isPostingComment}
            returnKeyType="send"
            onSubmitEditing={handleSendComment}
          />
          <Pressable
            onPress={handleSendComment}
            disabled={commentDraft.trim().length === 0 || isPostingComment}
            style={({ pressed }) => [
              styles.composerSend,
              (commentDraft.trim().length === 0 || isPostingComment) &&
                styles.composerSendDisabled,
              pressed && styles.composerSendPressed,
            ]}
          >
            {isPostingComment ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.composerSendText}>{t('action.send')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={lightboxUrl != null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUrl(null)}
      >
        <Pressable
          style={styles.lightboxBackdrop}
          onPress={() => setLightboxUrl(null)}
        >
          {lightboxUrl ? (
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ---------- Sub-components ----------

function AttachmentThumb({
  attachment,
  onPress,
}: {
  attachment: Attachment;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.attachmentThumb}>
      <Image
        source={{ uri: attachment.assetUrl }}
        style={styles.attachmentImage}
        resizeMode="cover"
      />
    </Pressable>
  );
}

function CommentRow({ comment }: { comment: FeedbackComment }) {
  const isAdmin = comment.authorKind === 'admin';
  const isSelf = comment.isSelf;

  let label: string;
  if (isSelf) {
    label = t('detail.comment.you');
  } else if (isAdmin) {
    label = comment.authorDisplayName?.trim()
      ? comment.authorDisplayName
      : t('detail.comment.team');
  } else {
    label = comment.authorDisplayName?.trim()
      ? comment.authorDisplayName
      : t('detail.comment.anonymous');
  }

  const tone = isAdmin
    ? styles.commentBubbleAdmin
    : isSelf
      ? styles.commentBubbleSelf
      : styles.commentBubbleOther;
  const labelTone = isAdmin
    ? styles.commentLabelAdmin
    : isSelf
      ? styles.commentLabelSelf
      : styles.commentLabelOther;
  const align = isSelf
    ? styles.commentRowAlignEnd
    : styles.commentRowAlignStart;

  return (
    <View style={[styles.commentRow, align]}>
      <View style={[styles.commentBubble, tone]}>
        <View style={styles.commentLabelRow}>
          {isAdmin ? (
            <Text style={[labelTone, styles.commentLabelIcon]}>🛡</Text>
          ) : null}
          <Text style={labelTone} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={styles.commentBody}>{comment.content}</Text>
        <Text style={styles.commentTime}>
          {formatRelativeTime(comment.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    minHeight: 52,
  },
  toolbarSpacer: {
    width: 44,
  },
  toolbarTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  headerMain: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    lineHeight: 26,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerDate: {
    fontSize: 12,
    color: '#888',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  officialReply: {
    marginTop: 4,
  },
  officialReplyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111',
    backgroundColor: '#0070f31a',
    padding: 12,
    borderRadius: 12,
  },
  attachmentsSection: {
    marginTop: 4,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachmentThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f2',
  },
  attachmentImage: {
    width: '100%',
    height: '100%',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5e5',
    marginVertical: 4,
  },
  commentsSection: {
    gap: 4,
  },
  emptyComments: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  comment: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    gap: 4,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  commentRowAlignStart: {
    justifyContent: 'flex-start',
  },
  commentRowAlignEnd: {
    justifyContent: 'flex-end',
  },
  commentBubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderWidth: 1,
    borderRadius: 10,
    gap: 4,
  },
  commentBubbleSelf: {
    backgroundColor: '#fff5e6',
    borderColor: '#fdba74',
  },
  commentBubbleAdmin: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  commentBubbleOther: {
    backgroundColor: 'transparent',
    borderColor: '#d4d4d8',
  },
  commentLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentLabelIcon: {
    fontSize: 12,
  },
  commentLabelSelf: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9a3412',
    letterSpacing: 0.2,
  },
  commentLabelAdmin: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1d4ed8',
    letterSpacing: 0.2,
  },
  commentLabelOther: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52525b',
    letterSpacing: 0.2,
  },
  commentBody: {
    fontSize: 15,
    lineHeight: 21,
    color: '#111',
  },
  commentTime: {
    fontSize: 11,
    color: '#888',
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    fontSize: 13,
    color: '#0070f3',
    fontWeight: '500',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    backgroundColor: '#fafafa',
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
    minHeight: 36,
    color: '#111',
  },
  composerSend: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0070f3',
    borderRadius: 18,
    minWidth: 56,
    alignItems: 'center',
  },
  composerSendPressed: {
    opacity: 0.7,
  },
  composerSendDisabled: {
    opacity: 0.4,
  },
  composerSendText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: '95%',
    height: '85%',
  },
});
