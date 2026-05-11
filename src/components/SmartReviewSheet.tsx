import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { smartReviewUIState } from '../smart-review/ui-state';

type Step = 'step1' | 'step2';

/**
 * Pre-prompt sheet shown by `Feddy.requestReviewIfAppropriate(...)`.
 * Two-step like / dislike confirmation replacing the legacy 5-star UI:
 *
 * 1. "Enjoying the app?" with two buttons.
 * 2. If the user likes the app, a second confirmation gates the call
 *    to expo-store-review so Apple's three-per-year quota is not
 *    burned on a user who picked "like" but isn't ready to rate.
 *
 * Mounted automatically by `<FeddyProvider />`.
 */
export function SmartReviewSheet() {
  const [state, setState] = useState(smartReviewUIState.getState());
  const [step, setStep] = useState<Step>('step1');
  const [didFireTerminal, setDidFireTerminal] = useState(false);

  useEffect(() => smartReviewUIState.subscribe(setState), []);

  // Reset the latch + step each time visibility flips on.
  useEffect(() => {
    if (state.visible) {
      setDidFireTerminal(false);
      setStep('step1');
    }
  }, [state.visible]);

  const handleLike = () => {
    if (didFireTerminal) return;
    // Non-terminal: record the funnel event and transition internally.
    state.onLiked?.();
    setStep('step2');
  };

  const handleDislike = () => {
    if (didFireTerminal) return;
    setDidFireTerminal(true);
    state.onDisliked?.();
  };

  const handleStoreConfirmed = () => {
    if (didFireTerminal) return;
    setDidFireTerminal(true);
    state.onStoreConfirmed?.();
  };

  const handleStoreDismissed = () => {
    if (didFireTerminal) return;
    setDidFireTerminal(true);
    state.onStoreDismissed?.();
  };

  const handleBackdropOrClose = () => {
    if (didFireTerminal) return;
    setDidFireTerminal(true);
    // Choose the right "no" path based on which step we were on.
    if (step === 'step1') {
      state.onSheetDismissedBeforeChoice?.();
    } else {
      state.onStoreDismissed?.();
    }
  };

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={handleBackdropOrClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropOrClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            {step === 'step1' ? (
              <Step1 onLike={handleLike} onDislike={handleDislike} />
            ) : (
              <Step2
                onConfirm={handleStoreConfirmed}
                onDismiss={handleStoreDismissed}
              />
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Step1({
  onLike,
  onDislike,
}: {
  onLike: () => void;
  onDislike: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>{t('smartReview.step1.title')}</Text>
      <Text style={styles.subtitle}>{t('smartReview.step1.subtitle')}</Text>
      <View style={styles.buttonRow}>
        <Pressable
          onPress={onDislike}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('smartReview.step1.dislike')}
        >
          <Text style={styles.secondaryButtonText}>
            {t('smartReview.step1.dislike')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onLike}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('smartReview.step1.like')}
        >
          <Text style={styles.primaryButtonText}>
            {t('smartReview.step1.like')}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function Step2({
  onConfirm,
  onDismiss,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>{t('smartReview.step2.title')}</Text>
      <Text style={styles.subtitle}>{t('smartReview.step2.subtitle')}</Text>
      <View style={styles.buttonRow}>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('smartReview.step2.dismiss')}
        >
          <Text style={styles.secondaryButtonText}>
            {t('smartReview.step2.dismiss')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('smartReview.step2.confirm')}
        >
          <Text style={styles.primaryButtonText}>
            {t('smartReview.step2.confirm')}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0008',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
    minHeight: 240,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#d4d4d8',
    borderRadius: 2,
    marginBottom: 20,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 8,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0070f3',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#111',
    fontWeight: '500',
  },
  buttonPressed: {
    opacity: 0.6,
  },
});
