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
import type { FeedbackBoard, FeedbackRequest, RoadmapStatus } from '../types';
import {
  EmptyState,
  ErrorState,
  IconButton,
  LoadingFooter,
  LoadingFullScreen,
  statusLabel,
} from './_shared';
import { FeedbackComposeContent } from './FeedbackComposeView';
import { PoweredByBadge } from './PoweredByBadge';
import { RequestDetailContent } from './RequestDetailView';
import { RequestRow } from './RequestRow';

function bundledFallbackBoards(): FeedbackBoard[] {
  return [
    { key: 'features', name: t('board.features') },
    { key: 'bugs', name: t('board.bugs') },
  ];
}

const TABS: RoadmapStatus[] = ['planned', 'in_progress', 'completed'];

export interface RoadmapViewProps {
  visible: boolean;
  onDismiss: () => void;
  boards?: FeedbackBoard[];
}

type Screen =
  | { kind: 'roadmap' }
  | { kind: 'detail'; requestId: string }
  | { kind: 'compose' };

interface TabState {
  items: FeedbackRequest[];
  nextCursor: string | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  votedIds: Set<string>;
  voteOverlays: Map<string, number>;
  pendingVoteIds: Set<string>;
}

const initialTabState = (): TabState => ({
  items: [],
  nextCursor: null,
  isInitialLoading: true,
  isRefreshing: false,
  isLoadingMore: false,
  loadError: null,
  votedIds: new Set(),
  voteOverlays: new Map(),
  pendingVoteIds: new Set(),
});

export function RoadmapView({
  visible,
  onDismiss,
  boards: boardsProp,
}: RoadmapViewProps) {
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

  const [screen, setScreen] = useState<Screen>({ kind: 'roadmap' });
  const [activeTab, setActiveTab] = useState<RoadmapStatus>('planned');
  const [tabs, setTabs] = useState<Record<RoadmapStatus, TabState>>(() => ({
    planned: initialTabState(),
    in_progress: initialTabState(),
    completed: initialTabState(),
  }));
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateTab = useCallback(
    (status: RoadmapStatus, mut: (prev: TabState) => TabState) => {
      setTabs((prev) => ({ ...prev, [status]: mut(prev[status]) }));
    },
    []
  );

  const loadInitial = useCallback(
    async (status: RoadmapStatus, refresh = false) => {
      const client = getCurrentClient();
      if (!client) {
        updateTab(status, (s) => ({
          ...s,
          loadError: t('compose.error.notConfigured'),
          isInitialLoading: false,
        }));
        return;
      }
      updateTab(status, (s) => ({
        ...s,
        isInitialLoading: !refresh,
        isRefreshing: refresh,
        loadError: null,
        nextCursor: null,
      }));
      try {
        const page = await readApi.fetchRequests(client, { status, limit: 20 });
        if (!isMountedRef.current) return;
        updateTab(status, () => ({
          items: page.items,
          nextCursor: page.nextCursor,
          isInitialLoading: false,
          isRefreshing: false,
          isLoadingMore: false,
          loadError: null,
          votedIds: new Set(page.items.filter((r) => r.voted).map((r) => r.id)),
          voteOverlays: new Map(),
          pendingVoteIds: new Set(),
        }));
      } catch (err) {
        if (!isMountedRef.current) return;
        updateTab(status, (s) => ({
          ...s,
          isInitialLoading: false,
          isRefreshing: false,
          loadError: err instanceof FeddyError ? err.message : t('list.error'),
        }));
      }
    },
    [updateTab]
  );

  // Use a ref to read latest `tabs` without making it a useEffect dep —
  // otherwise the effect re-fires on every tab state mutation.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    if (visible && screen.kind === 'roadmap') {
      const tab = tabsRef.current[activeTab];
      if (tab.items.length === 0 && tab.loadError == null) {
        void loadInitial(activeTab);
      }
    }
  }, [visible, activeTab, screen.kind, loadInitial]);

  const loadMore = useCallback(
    async (status: RoadmapStatus) => {
      const tab = tabsRef.current[status];
      if (tab.isLoadingMore || !tab.nextCursor) return;
      const client = getCurrentClient();
      if (!client) return;
      updateTab(status, (s) => ({ ...s, isLoadingMore: true }));
      try {
        const page = await readApi.fetchRequests(client, {
          status,
          limit: 20,
          cursor: tab.nextCursor,
        });
        if (!isMountedRef.current) return;
        updateTab(status, (s) => {
          const newVotedIds = new Set(s.votedIds);
          for (const r of page.items) {
            if (r.voted) newVotedIds.add(r.id);
          }
          return {
            ...s,
            items: [...s.items, ...page.items],
            nextCursor: page.nextCursor,
            votedIds: newVotedIds,
            isLoadingMore: false,
          };
        });
      } catch {
        if (!isMountedRef.current) return;
        updateTab(status, (s) => ({ ...s, isLoadingMore: false }));
      }
    },
    [updateTab]
  );

  const handleVoteTap = (item: FeedbackRequest) => {
    const status = activeTab;
    const tab = tabsRef.current[status];
    if (tab.pendingVoteIds.has(item.id)) return;
    const client = getCurrentClient();
    if (!client) return;
    const wasVoted = tab.votedIds.has(item.id);
    const baseline = tab.voteOverlays.get(item.id) ?? item.voteCount;
    updateTab(status, (s) => {
      const newVoted = new Set(s.votedIds);
      const newOverlays = new Map(s.voteOverlays);
      const newPending = new Set(s.pendingVoteIds);
      if (wasVoted) newVoted.delete(item.id);
      else newVoted.add(item.id);
      newOverlays.set(
        item.id,
        wasVoted ? Math.max(0, baseline - 1) : baseline + 1
      );
      newPending.add(item.id);
      return {
        ...s,
        votedIds: newVoted,
        voteOverlays: newOverlays,
        pendingVoteIds: newPending,
      };
    });
    void (async () => {
      try {
        const state = await readApi.upvote(client, { requestId: item.id });
        if (!isMountedRef.current) return;
        updateTab(status, (s) => {
          const newVoted = new Set(s.votedIds);
          const newOverlays = new Map(s.voteOverlays);
          const newPending = new Set(s.pendingVoteIds);
          if (state.voted) newVoted.add(item.id);
          else newVoted.delete(item.id);
          newOverlays.set(item.id, state.voteCount);
          newPending.delete(item.id);
          return {
            ...s,
            votedIds: newVoted,
            voteOverlays: newOverlays,
            pendingVoteIds: newPending,
          };
        });
      } catch {
        if (!isMountedRef.current) return;
        updateTab(status, (s) => {
          const newVoted = new Set(s.votedIds);
          const newOverlays = new Map(s.voteOverlays);
          const newPending = new Set(s.pendingVoteIds);
          if (wasVoted) newVoted.add(item.id);
          else newVoted.delete(item.id);
          newOverlays.set(item.id, baseline);
          newPending.delete(item.id);
          return {
            ...s,
            votedIds: newVoted,
            voteOverlays: newOverlays,
            pendingVoteIds: newPending,
          };
        });
        Alert.alert(t('detail.vote.failed'), t('detail.tryAgain'));
      }
    })();
  };

  const boardName = (key: string) =>
    resolvedBoards.find((b) => b.key === key)?.name ??
    (key.length === 0 ? '' : key.charAt(0).toUpperCase() + key.slice(1));

  const tab = tabs[activeTab];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {screen.kind === 'detail' ? (
          <RequestDetailContent
            requestId={screen.requestId}
            onBack={() => setScreen({ kind: 'roadmap' })}
          />
        ) : screen.kind === 'compose' ? (
          <FeedbackComposeContent
            boards={resolvedBoards}
            onDismiss={() => {
              setScreen({ kind: 'roadmap' });
              void loadInitial(activeTab, true);
            }}
          />
        ) : (
          <>
            <View style={styles.toolbar}>
              <View style={styles.toolbarSide}>
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
                {t('roadmap.title')}
              </Text>
              <View style={styles.toolbarSide}>
                <IconButton
                  icon="＋"
                  onPress={() => setScreen({ kind: 'compose' })}
                  accessibilityLabel={t('compose.title')}
                  circle
                  fontSize={20}
                />
              </View>
            </View>

            <View style={styles.segmentedRow}>
              {TABS.map((status) => {
                const isActive = status === activeTab;
                return (
                  <Pressable
                    key={status}
                    onPress={() => setActiveTab(status)}
                    style={({ pressed }) => [
                      styles.segment,
                      isActive && styles.segmentActive,
                      pressed && !isActive && styles.segmentPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        isActive && styles.segmentTextActive,
                      ]}
                    >
                      {statusLabel(status)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tab.isInitialLoading && tab.items.length === 0 ? (
              <LoadingFullScreen />
            ) : tab.loadError && tab.items.length === 0 ? (
              <ErrorState
                message={tab.loadError}
                onRetry={() => void loadInitial(activeTab)}
              />
            ) : tab.items.length === 0 ? (
              <EmptyState
                title={t('roadmap.empty.titleFormat', {
                  status: statusLabel(activeTab).toLowerCase(),
                })}
                body={t('roadmap.empty.body')}
              />
            ) : (
              <FlatList
                data={tab.items}
                keyExtractor={(r) => r.id}
                renderItem={({ item }) => (
                  <RequestRow
                    request={item}
                    boardName={boardName(item.boardKey)}
                    voteOverlay={tab.voteOverlays.get(item.id)}
                    voted={tab.votedIds.has(item.id)}
                    votePending={tab.pendingVoteIds.has(item.id)}
                    showStatusChip={false}
                    onPress={() =>
                      setScreen({ kind: 'detail', requestId: item.id })
                    }
                    onVote={() => handleVoteTap(item)}
                  />
                )}
                refreshControl={
                  <RefreshControl
                    refreshing={tab.isRefreshing}
                    onRefresh={() => {
                      void loadInitial(activeTab, true);
                    }}
                  />
                }
                onEndReached={() => {
                  void loadMore(activeTab);
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  tab.isLoadingMore ? <LoadingFooter /> : null
                }
              />
            )}
            <PoweredByBadge />
          </>
        )}
      </SafeAreaView>
    </Modal>
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
  toolbarSide: {
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
  segmentedRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 3,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentActive: {
    backgroundColor: '#0070f3',
  },
  segmentPressed: {
    opacity: 0.6,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
