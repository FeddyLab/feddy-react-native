import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { smartReviewUIState } from '../smart-review/ui-state';

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * The pre-prompt sheet shown by `Feddy.requestReviewIfAppropriate(...)`.
 * Five star buttons + a "Not now" dismiss action. Deliberately small
 * and unbranded so it feels like a system-style confirmation rather
 * than a Feddy-branded modal.
 *
 * Mounted automatically by `<FeddyProvider />`.
 */
export function SmartReviewSheet() {
  const [state, setState] = useState(smartReviewUIState.getState());
  const [didFire, setDidFire] = useState(false);

  useEffect(() => smartReviewUIState.subscribe(setState), []);

  // Reset the latch each time visibility flips on.
  useEffect(() => {
    if (state.visible) setDidFire(false);
  }, [state.visible]);

  const handleStar = (stars: number) => {
    if (didFire) return;
    setDidFire(true);
    state.onRated?.(stars);
  };

  const handleCancel = () => {
    if (didFire) return;
    setDidFire(true);
    state.onCancel?.();
  };

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>{t('smartReview.title')}</Text>
            <Text style={styles.subtitle}>{t('smartReview.subtitle')}</Text>
            <View style={styles.stars}>
              {STARS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleStar(s)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.star,
                    pressed && styles.starPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('smartReview.star.a11y', { n: s })}
                >
                  <Text style={styles.starGlyph}>☆</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.cancel,
                pressed && styles.cancelPressed,
              ]}
              hitSlop={8}
            >
              <Text style={styles.cancelText}>{t('action.notNow')}</Text>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
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
    minHeight: 320,
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
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  stars: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  star: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starPressed: {
    opacity: 0.5,
  },
  starGlyph: {
    fontSize: 44,
    color: '#0070f3',
    lineHeight: 50,
    fontWeight: '300',
  },
  cancel: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 4,
  },
  cancelPressed: {
    opacity: 0.5,
  },
  cancelText: {
    fontSize: 15,
    color: '#0070f3',
    fontWeight: '500',
  },
});
