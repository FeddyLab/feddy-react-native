import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../i18n';

// ---------- Colour + label helpers (pure) ----------

export function statusChipColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#22c55e';
    case 'in_progress':
      return '#3b82f6';
    case 'planned':
      return '#f97316';
    case 'rejected':
    case 'duplicate':
      return '#9ca3af';
    default:
      return '#6b7280';
  }
}

const KNOWN_STATUSES = new Set([
  'planned',
  'in_progress',
  'completed',
  'pending',
  'reviewed',
  'rejected',
  'duplicate',
]);

export function statusLabel(status: string): string {
  if (KNOWN_STATUSES.has(status)) return t(`status.${status}`);
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const sec = Math.floor(ms / 1000);
  if (sec < 30) return t('time.justNow');
  if (sec < 60) return t('time.secondsAgo', { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t('time.minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('time.hoursAgo', { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t('time.daysAgo', { n: day });
  return new Date(iso).toLocaleDateString();
}

// ---------- StatusChip ----------

export function StatusChip({ status }: { status: string }) {
  const color = statusChipColor(status);
  return (
    <View
      style={[
        sharedStyles.chip,
        { backgroundColor: `${color}26`, borderColor: `${color}40` },
      ]}
    >
      <Text style={[sharedStyles.chipText, { color }]}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

// ---------- BoardChip ----------

export function BoardChip({ name }: { name: string }) {
  return (
    <View style={[sharedStyles.chip, sharedStyles.boardChip]}>
      <Text style={[sharedStyles.chipText, sharedStyles.boardChipText]}>
        {name}
      </Text>
    </View>
  );
}

// ---------- VoteButton ----------

export interface VoteButtonProps {
  count: number;
  voted: boolean;
  pending?: boolean;
  size?: 'sm' | 'md';
  onPress: () => void;
}

export function VoteButton({
  count,
  voted,
  pending = false,
  size = 'sm',
  onPress,
}: VoteButtonProps) {
  const dim =
    size === 'md'
      ? { w: 48, h: 52, icon: 14, count: 13 }
      : { w: 44, h: 48, icon: 14, count: 12 };

  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={voted ? t('action.upvoted') : t('action.upvote')}
      style={({ pressed }) => [
        voteStyles.base,
        { width: dim.w, height: dim.h },
        voted ? voteStyles.voted : voteStyles.unvoted,
        pressed && voteStyles.pressed,
        pending && voteStyles.pending,
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={voted ? '#fff' : '#666'} />
      ) : (
        <>
          <Text
            style={[
              voteStyles.chevron,
              { fontSize: dim.icon, color: voted ? '#fff' : '#111' },
            ]}
          >
            ▲
          </Text>
          <Text
            style={[
              voteStyles.count,
              { fontSize: dim.count, color: voted ? '#fff' : '#111' },
            ]}
          >
            {count}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ---------- LoadingFooter ----------

export function LoadingFooter() {
  return (
    <View style={sharedStyles.loadingFooter}>
      <ActivityIndicator size="small" color="#888" />
      <Text style={sharedStyles.loadingFooterText}>
        {t('list.loadingMore')}
      </Text>
    </View>
  );
}

// ---------- EmptyState ----------

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={sharedStyles.emptyState}>
      <Text style={sharedStyles.emptyTitle}>{title}</Text>
      {body ? <Text style={sharedStyles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

// ---------- ErrorState ----------

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={sharedStyles.emptyState}>
      <Text style={sharedStyles.emptyBody}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          sharedStyles.retryButton,
          pressed && sharedStyles.retryPressed,
        ]}
      >
        <Text style={sharedStyles.retryText}>{t('action.retry')}</Text>
      </Pressable>
    </View>
  );
}

// ---------- LoadingFullScreen ----------

export function LoadingFullScreen() {
  return (
    <View style={sharedStyles.loadingFull}>
      <ActivityIndicator size="large" color="#888" />
    </View>
  );
}

// ---------- IconButton (toolbar action — ✕ etc.) ----------

export interface IconButtonProps {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /**
   * "primary" colors the glyph blue; "neutral" uses the text colour.
   * Ignored when `circle` is true (circle always uses neutral).
   */
  variant?: 'primary' | 'neutral';
  /**
   * Render with a white circular background + soft shadow (matches the
   * compose modal's ✕ button). Used in toolbars sitting on the gray
   * page background.
   */
  circle?: boolean;
  /** Tap target size in points; default 44 (Apple HIG minimum). */
  size?: number;
  fontSize?: number;
}

/**
 * 44×44 (HIG) tap target with a centered glyph. Used for toolbar
 * actions (close ✕, plus ＋, back ‹) where text labels would localize
 * inconsistently across en / es / ja / de / fr.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  variant = 'primary',
  circle = false,
  size = 44,
  fontSize = 22,
}: IconButtonProps) {
  const circleSize = 36;
  const dim = circle ? circleSize : size;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={circle ? 8 : 4}
      style={({ pressed }) => [
        iconButtonStyles.base,
        { width: dim, height: dim },
        circle && iconButtonStyles.circleBg,
        pressed && iconButtonStyles.pressed,
        disabled && iconButtonStyles.disabled,
      ]}
    >
      <Text
        style={[
          iconButtonStyles.glyph,
          { fontSize },
          circle
            ? iconButtonStyles.circleGlyph
            : variant === 'primary'
              ? iconButtonStyles.primary
              : iconButtonStyles.neutral,
        ]}
      >
        {icon}
      </Text>
    </Pressable>
  );
}

// ---------- Styles ----------

const sharedStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  boardChip: {
    backgroundColor: '#f0f0f2',
    borderColor: '#e5e5e5',
  },
  boardChipText: {
    color: '#666',
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingFooterText: {
    fontSize: 13,
    color: '#888',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0070f3',
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const iconButtonStyles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBg: {
    borderRadius: 18,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.5,
  },
  disabled: {
    opacity: 0.3,
  },
  glyph: {
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  primary: {
    color: '#0070f3',
  },
  neutral: {
    color: '#111',
  },
  circleGlyph: {
    color: '#111',
  },
});

const voteStyles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  unvoted: {
    backgroundColor: '#f0f0f2',
    borderColor: '#d4d4d8',
  },
  voted: {
    backgroundColor: '#f97316',
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  pending: {
    opacity: 0.6,
  },
  chevron: {
    fontWeight: '700',
    lineHeight: 16,
  },
  count: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
