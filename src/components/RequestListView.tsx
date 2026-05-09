import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchBoards } from '../api/boards';
import * as readApi from '../api/read';
import { FeddyError } from '../client';
import { t } from '../i18n';
import { getCurrentClient } from '../runtime';
import { localizedBoardName, systemDefaultBoards } from '../system-boards';
import type { FeedbackBoard, FeedbackRequest } from '../types';
import {
  EmptyState,
  ErrorState,
  IconButton,
  LoadingFooter,
  LoadingFullScreen,
} from './_shared';
import { FeedbackComposeView } from './FeedbackComposeView';
import { PoweredByBadge } from './PoweredByBadge';
import { RequestDetailContent } from './RequestDetailView';
import { RequestRow } from './RequestRow';

/**
 * Bundled fallback used until the server fetch lands. Names are
 * localized via the i18n catalog. Hosts that want a fully synchronous
 * list (e.g. unit tests) can pass `boards={SYSTEM_BOARDS}` explicitly.
 */
export const SYSTEM_BOARDS: FeedbackBoard[] = [
  { key: 'features', name: 'Feature' },
  { key: 'bugs', name: 'Bug' },
];

function bundledFallbackBoards(): FeedbackBoard[] {
  return systemDefaultBoards();
}

export interface RequestListViewProps {
  visible: boolean;
  onDismiss: () => void;
  /**
   * Override the boards exposed in the filter menu. When omitted, the
   * SDK fetches the workspace's public boards (`GET /v1/boards`),
   * cached 1h, with the bundled system boards as a fallback.
   */
  boards?: FeedbackBoard[];
}

export function RequestListView({
  visible,
  onDismiss,
  boards: boardsProp,
}: RequestListViewProps) {
  const [resolvedBoards, setResolvedBoards] = useState<FeedbackBoard[]>(
    () => boardsProp ?? bundledFallbackBoards()
  );

  useEffect(() => {
    if (boardsProp != null) {
      setResolvedBoards(boardsProp);
      return;
    }
    const client = getCurrentClient();
    if (!client) return;
    let cancelled = false;
    void fetchBoards(client).then((items) => {
      if (!cancelled) setResolvedBoards(items);
    });
    return () => {
      cancelled = true;
    };
  }, [boardsProp]);

  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedBoardKey, setSelectedBoardKey] = useState<string | null>(null);
  const [items, setItems] = useState<FeedbackRequest[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [voteOverlays, setVoteOverlays] = useState<Map<string, number>>(
    new Map()
  );
  const [pendingVoteIds, setPendingVoteIds] = useState<Set<string>>(new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadInitial = useCallback(
    async (refresh = false) => {
      const client = getCurrentClient();
      if (!client) {
        setLoadError('Feddy is not configured.');
        setIsInitialLoading(false);
        return;
      }
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }
      setLoadError(null);
      setNextCursor(null);
      try {
        const page = await readApi.fetchRequests(client, {
          boardKey: selectedBoardKey ?? undefined,
          limit: 20,
        });
        if (!isMountedRef.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setVotedIds(
          new Set(page.items.filter((r) => r.voted).map((r) => r.id))
        );
        setVoteOverlays(new Map());
      } catch (err) {
        if (!isMountedRef.current) return;
        setLoadError(err instanceof FeddyError ? err.message : t('list.error'));
      } finally {
        if (isMountedRef.current) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [selectedBoardKey]
  );

  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (visible && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void loadInitial();
    }
  }, [visible, loadInitial]);

  const loadMoreIfNeeded = useCallback(async () => {
    if (isLoadingMore || !nextCursor) return;
    const client = getCurrentClient();
    if (!client) return;
    setIsLoadingMore(true);
    try {
      const page = await readApi.fetchRequests(client, {
        boardKey: selectedBoardKey ?? undefined,
        limit: 20,
        cursor: nextCursor,
      });
      if (!isMountedRef.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setVotedIds((prev) => {
        const next = new Set(prev);
        for (const r of page.items) {
          if (r.voted) next.add(r.id);
        }
        return next;
      });
    } catch {
      // silently stop pagination
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, selectedBoardKey]);

  const handleVoteTap = (item: FeedbackRequest) => {
    if (pendingVoteIds.has(item.id)) return;
    const client = getCurrentClient();
    if (!client) return;
    const wasVoted = votedIds.has(item.id);
    const baseline = voteOverlays.get(item.id) ?? item.voteCount;
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    setVoteOverlays((prev) => {
      const next = new Map(prev);
      next.set(item.id, wasVoted ? Math.max(0, baseline - 1) : baseline + 1);
      return next;
    });
    setPendingVoteIds((prev) => new Set(prev).add(item.id));
    void (async () => {
      try {
        const state = await readApi.upvote(client, { requestId: item.id });
        if (!isMountedRef.current) return;
        setVotedIds((prev) => {
          const next = new Set(prev);
          if (state.voted) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
        setVoteOverlays((prev) => {
          const next = new Map(prev);
          next.set(item.id, state.voteCount);
          return next;
        });
      } catch {
        if (!isMountedRef.current) return;
        // revert optimistic update
        setVotedIds((prev) => {
          const next = new Set(prev);
          if (wasVoted) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
        setVoteOverlays((prev) => {
          const next = new Map(prev);
          next.set(item.id, baseline);
          return next;
        });
        Alert.alert(t('detail.vote.failed'), t('detail.tryAgain'));
      } finally {
        if (isMountedRef.current) {
          setPendingVoteIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      }
    })();
  };

  const boardName = (key: string) =>
    localizedBoardName(key, resolvedBoards.find((b) => b.key === key)?.name);

  const handleCompose = () => {
    setComposeOpen(true);
  };

  const renderHeader = () => {
    return (
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <IconButton
            icon="✕"
            onPress={onDismiss}
            accessibilityLabel={t('action.close')}
            circle
            fontSize={16}
          />
        </View>
        <Text
          style={styles.toolbarTitle}
          numberOfLines={1}
          pointerEvents="none"
        >
          {t('list.title')}
        </Text>
        <View style={styles.toolbarRight}>
          <IconButton
            icon="≡"
            onPress={() => setFilterMenuOpen(true)}
            accessibilityLabel={
              selectedBoardKey
                ? `${t('list.filter.all')}: ${boardName(selectedBoardKey)}`
                : t('list.filter.all')
            }
            circle
            fontSize={18}
          />
          <IconButton
            icon="＋"
            onPress={handleCompose}
            accessibilityLabel={t('compose.title')}
            circle
            fontSize={20}
          />
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderHeader()}
        {isInitialLoading && items.length === 0 ? (
          <LoadingFullScreen />
        ) : loadError && items.length === 0 ? (
          <ErrorState message={loadError} onRetry={() => void loadInitial()} />
        ) : items.length === 0 ? (
          <EmptyState
            title={t('list.empty.title')}
            body={t('list.empty.body')}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <RequestRow
                request={item}
                boardName={boardName(item.boardKey)}
                voteOverlay={voteOverlays.get(item.id)}
                voted={votedIds.has(item.id)}
                votePending={pendingVoteIds.has(item.id)}
                showStatusChip
                onPress={() => setDetailRequestId(item.id)}
                onVote={() => handleVoteTap(item)}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => {
                  void loadInitial(true);
                }}
              />
            }
            onEndReached={() => {
              void loadMoreIfNeeded();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isLoadingMore ? <LoadingFooter /> : null}
          />
        )}
        <PoweredByBadge />
      </SafeAreaView>

      {/* Stacked sheet for detail — iOS layers a second pageSheet on
          top of the list with a built-in slide-in animation and the
          standard pull-to-dismiss gesture, so we don't have to draw
          our own back-button chrome. */}
      <Modal
        visible={detailRequestId != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailRequestId(null)}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {detailRequestId != null && (
            <RequestDetailContent
              requestId={detailRequestId}
              onClose={() => setDetailRequestId(null)}
            />
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={filterMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setFilterMenuOpen(false)}
        >
          <View style={styles.menu}>
            <FilterMenuItem
              label={t('list.filter.allBoards')}
              selected={selectedBoardKey == null}
              onPress={() => {
                setSelectedBoardKey(null);
                setFilterMenuOpen(false);
              }}
            />
            {resolvedBoards.map((b) => (
              <FilterMenuItem
                key={b.key}
                label={b.name}
                selected={selectedBoardKey === b.key}
                onPress={() => {
                  setSelectedBoardKey(b.key);
                  setFilterMenuOpen(false);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>

      <FeedbackComposeView
        visible={composeOpen}
        boards={resolvedBoards}
        boardKey={selectedBoardKey ?? undefined}
        onDismiss={() => {
          setComposeOpen(false);
          void loadInitial(true);
        }}
      />
    </Modal>
  );
}

function FilterMenuItem({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && styles.menuItemPressed,
      ]}
    >
      <Text style={styles.menuItemLabel}>{label}</Text>
      {selected ? <Text style={styles.menuItemCheck}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 56,
    position: 'relative',
  },
  toolbarLeft: {
    zIndex: 1,
  },
  toolbarTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 16,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: '#0008',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingRight: 16,
  },
  menu: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemPressed: {
    backgroundColor: '#f0f0f2',
  },
  menuItemLabel: {
    fontSize: 15,
    color: '#111',
  },
  menuItemCheck: {
    fontSize: 16,
    color: '#0070f3',
    fontWeight: '600',
  },
});
