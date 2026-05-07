import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedbackRequest } from '../types';
import { BoardChip, StatusChip, VoteButton } from './_shared';

export interface RequestRowProps {
  request: FeedbackRequest;
  /** Display name of the board (e.g. "Feature"). */
  boardName: string;
  /** Optimistic vote count override; falls back to `request.voteCount`. */
  voteOverlay?: number;
  voted: boolean;
  votePending: boolean;
  /** Hide the status chip when the parent view groups by status (Roadmap tabs). */
  showStatusChip: boolean;
  onPress: () => void;
  onVote: () => void;
}

export function RequestRow({
  request,
  boardName,
  voteOverlay,
  voted,
  votePending,
  showStatusChip,
  onPress,
  onVote,
}: RequestRowProps) {
  const count = voteOverlay ?? request.voteCount;
  const hasAttachments = request.attachments.length > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <VoteButton
        count={count}
        voted={voted}
        pending={votePending}
        onPress={onVote}
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {request.title}
        </Text>
        {request.description.length > 0 ? (
          <Text style={styles.description} numberOfLines={2}>
            {request.description}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <BoardChip name={boardName} />
          {showStatusChip ? <StatusChip status={request.status} /> : null}
          {hasAttachments ? (
            <Text style={styles.attachmentMeta}>
              📎 {request.attachments.length}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: '#ececef',
  },
  body: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    alignItems: 'center',
  },
  attachmentMeta: {
    fontSize: 11,
    color: '#888',
  },
});
