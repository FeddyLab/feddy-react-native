import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { fetchBoards } from '../api/boards';
import { uploadAttachment } from '../attachments/upload';
import { t } from '../i18n';
import {
  getAnonymousToken,
  getAttachmentsEnabled,
  getLastExternalUserId,
} from '../identity';
import { getCurrentClient } from '../runtime';
import { localizedBoardName, systemDefaultBoards } from '../system-boards';
import type { FeedbackBoard } from '../types';
import { AttachmentPickerButton } from './AttachmentPickerButton';
import { PoweredByBadge } from './PoweredByBadge';

// Local fallback used only when no `boards` prop is passed AND the
// initial server fetch hasn't completed yet. Names are i18n-localized.
function bundledFallbackBoards(): FeedbackBoard[] {
  return systemDefaultBoards();
}

// ---------- Standalone Modal wrapper (used by FeddyProvider + direct host use) ----------

export interface FeedbackComposeViewProps {
  visible: boolean;
  /**
   * Override the boards exposed in the picker. When omitted (the
   * common case), the SDK fetches the workspace's public boards from
   * the server (`GET /v1/boards`), cached 1h, with the two system
   * boards as a fallback. Pass a single-element array to lock the
   * form to one board (the picker is hidden).
   */
  boards?: FeedbackBoard[];
  /** Pre-select a board by key. Falls back to the first board if not found. */
  boardKey?: string;
  onDismiss: () => void;
}

/**
 * Built-in feedback compose modal. Host can render this directly with
 * its own visibility state, or rely on `<FeddyProvider />` to mount it
 * once and trigger via `Feddy.openFeedback()`.
 *
 * Designed to nest inside another modal — `RequestListView` and
 * `RoadmapView` mount this directly so the compose sheet slides up
 * over the list rather than replacing it. `<FeedbackComposeContent />`
 * is also exported separately for hosts that want the form without
 * the Modal wrapper (e.g. embedded inside a custom navigation stack).
 */
export function FeedbackComposeView({
  visible,
  boards,
  boardKey,
  onDismiss,
}: FeedbackComposeViewProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <FeedbackComposeContent
        boards={boards}
        boardKey={boardKey}
        onDismiss={onDismiss}
      />
    </Modal>
  );
}

// ---------- Inner content (no Modal — used for direct render + nested cases) ----------

export interface FeedbackComposeContentProps {
  boards?: FeedbackBoard[];
  boardKey?: string;
  onDismiss: () => void;
}

export function FeedbackComposeContent({
  boards: boardsProp,
  boardKey,
  onDismiss,
}: FeedbackComposeContentProps) {
  // When the host doesn't pass `boards`, fetch from the server (1h
  // cached). The bundled fallback renders during the initial fetch so
  // the picker isn't empty and the user can submit immediately.
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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBoardKey, setSelectedBoardKey] = useState(
    () =>
      (boardKey != null && resolvedBoards.some((b) => b.key === boardKey)
        ? boardKey
        : resolvedBoards[0]?.key) ?? ''
  );
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [attachmentsEnabled, setAttachmentsEnabledState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  useEffect(() => {
    void getAttachmentsEnabled().then(setAttachmentsEnabledState);
  }, []);

  useEffect(() => {
    // Keep `selectedBoardKey` in sync with whatever boards/boardKey
    // resolve to. When boards arrive from the network, prefer the
    // host-supplied boardKey if it matches, else first board.
    setSelectedBoardKey((prev) => {
      if (prev && resolvedBoards.some((b) => b.key === prev)) {
        return prev;
      }
      if (boardKey != null && resolvedBoards.some((b) => b.key === boardKey)) {
        return boardKey;
      }
      return resolvedBoards[0]?.key ?? '';
    });
  }, [boardKey, resolvedBoards]);

  const handleClose = () => {
    if (submitting) return;
    onDismiss();
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError(t('compose.error.titleEmpty'));
      return;
    }
    const client = getCurrentClient();
    if (!client) {
      setError(t('compose.error.notConfigured'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const attachmentKeys: string[] = [];
      for (const uri of imageUris.slice(0, 3)) {
        try {
          const key = await uploadAttachment(client, uri);
          attachmentKeys.push(key);
        } catch (err) {
          console.error(
            '[Feddy] attachment upload failed — skipping one image:',
            err instanceof Error ? err.message : err
          );
        }
      }

      const externalUserId = await getLastExternalUserId();
      const anonymousToken =
        externalUserId == null ? await getAnonymousToken() : undefined;
      const trimmedDescription = description.trim();
      await client.post('/v1/requests', {
        external_user_id: externalUserId ?? undefined,
        anonymous_token: anonymousToken,
        title: trimmed,
        description:
          trimmedDescription.length > 0 ? trimmedDescription : undefined,
        board_key: selectedBoardKey,
        attachment_keys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
      });
      onDismiss();
      Alert.alert(t('compose.thanks'));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('compose.error.submitFailed')
      );
      setSubmitting(false);
    }
  };

  const submitDisabled = submitting || title.trim().length === 0;
  const showPicker = resolvedBoards.length > 1;
  const selectedBoardName = localizedBoardName(
    selectedBoardKey,
    resolvedBoards.find((b) => b.key === selectedBoardKey)?.name
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            disabled={submitting}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('action.cancel')}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
              submitting && styles.disabledOpacity,
            ]}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('compose.title')}</Text>
          <Pressable
            onPress={() => {
              void handleSubmit();
            }}
            disabled={submitDisabled}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('action.submit')}
            accessibilityState={{
              disabled: submitDisabled,
              busy: submitting,
            }}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && !submitDisabled && styles.submitButtonPressed,
              submitDisabled && styles.submitButtonDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#0070f3" />
            ) : (
              <Text
                style={[
                  styles.submitIcon,
                  submitDisabled && styles.submitIconDisabled,
                ]}
              >
                ✓
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Section label={t('compose.placeholder.title')}>
            <View style={styles.card}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What's on your mind?"
                placeholderTextColor="#9ca3af"
                style={styles.titleInput}
                editable={!submitting}
                autoFocus
                returnKeyType="next"
              />
            </View>
          </Section>

          <Section label={t('compose.placeholder.description')}>
            <View style={[styles.card, styles.descriptionCard]}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Add details (optional)"
                placeholderTextColor="#9ca3af"
                style={styles.descriptionInput}
                multiline
                editable={!submitting}
              />
            </View>
          </Section>

          {showPicker ? (
            <Section>
              <Pressable
                onPress={() => setCategoryPickerOpen(true)}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.card,
                  styles.categoryRow,
                  pressed && styles.cardPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Category: ${selectedBoardName}`}
              >
                <Text style={styles.categoryLabel}>Category</Text>
                <View style={styles.categoryRight}>
                  <Text style={styles.categoryValue}>{selectedBoardName}</Text>
                  <Text style={styles.categoryChevron}>▾</Text>
                </View>
              </Pressable>
            </Section>
          ) : null}

          {attachmentsEnabled ? (
            <Section>
              <View style={styles.card}>
                <AttachmentPickerButton
                  uris={imageUris}
                  onChange={setImageUris}
                  disabled={submitting}
                />
              </View>
            </Section>
          ) : null}

          {error != null ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <PoweredByBadge />
        </View>
      </KeyboardAvoidingView>

      <CategoryPicker
        visible={categoryPickerOpen}
        boards={resolvedBoards}
        selectedKey={selectedBoardKey}
        onSelect={(key) => {
          setSelectedBoardKey(key);
          setCategoryPickerOpen(false);
        }}
        onDismiss={() => setCategoryPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ---------- Sub-components ----------

function Section({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

interface CategoryPickerProps {
  visible: boolean;
  boards: FeedbackBoard[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onDismiss: () => void;
}

function CategoryPicker({
  visible,
  boards,
  selectedKey,
  onSelect,
  onDismiss,
}: CategoryPickerProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={pickerStyles.backdrop} onPress={onDismiss}>
        <Pressable style={pickerStyles.sheetWrap} onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={pickerStyles.sheet}>
            <View style={pickerStyles.handle} />
            <Text style={pickerStyles.title}>Category</Text>
            {boards.map((b) => {
              const isSelected = b.key === selectedKey;
              return (
                <Pressable
                  key={b.key}
                  onPress={() => onSelect(b.key)}
                  style={({ pressed }) => [
                    pickerStyles.option,
                    pressed && pickerStyles.optionPressed,
                  ]}
                >
                  <Text
                    style={[
                      pickerStyles.optionText,
                      isSelected && pickerStyles.optionTextSelected,
                    ]}
                  >
                    {localizedBoardName(b.key, b.name)}
                  </Text>
                  {isSelected ? (
                    <Text style={pickerStyles.optionCheck}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 56,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  closeButtonPressed: {
    opacity: 0.6,
  },
  disabledOpacity: {
    opacity: 0.4,
  },
  closeIcon: {
    fontSize: 18,
    color: '#111',
    fontWeight: '500',
    lineHeight: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  submitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  submitButtonPressed: {
    opacity: 0.6,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0070f3',
    lineHeight: 22,
    textAlign: 'center',
  },
  submitIconDisabled: {
    color: '#9ca3af',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardPressed: {
    opacity: 0.6,
  },
  descriptionCard: {
    minHeight: 140,
    paddingVertical: 14,
  },
  titleInput: {
    fontSize: 16,
    color: '#111',
    paddingVertical: 4,
    minHeight: 28,
  },
  descriptionInput: {
    fontSize: 15,
    color: '#111',
    minHeight: 110,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111',
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  categoryValue: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
  },
  categoryChevron: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '700',
    lineHeight: 16,
    marginTop: -1,
  },
  error: {
    color: '#c33',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  footer: {
    paddingTop: 4,
  },
});

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0006',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#d4d4d8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  optionPressed: {
    backgroundColor: '#f5f5f7',
  },
  optionText: {
    fontSize: 16,
    color: '#111',
  },
  optionTextSelected: {
    color: '#0070f3',
    fontWeight: '600',
  },
  optionCheck: {
    fontSize: 18,
    color: '#0070f3',
    fontWeight: '700',
  },
});
