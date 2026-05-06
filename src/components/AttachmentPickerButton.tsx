import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';

interface ImagePickerModule {
  launchImageLibraryAsync: (opts: {
    mediaTypes?: string;
    allowsMultipleSelection?: boolean;
    selectionLimit?: number;
    quality?: number;
  }) => Promise<{
    canceled: boolean;
    assets?: Array<{ uri: string }>;
  }>;
  MediaTypeOptions?: { Images: string };
  requestMediaLibraryPermissionsAsync: () => Promise<{ status: string }>;
}

function loadImagePicker(): ImagePickerModule | null {
  try {
    return require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null;
  }
}

const MAX_ATTACHMENTS = 3;

export interface AttachmentPickerButtonProps {
  uris: string[];
  onChange: (uris: string[]) => void;
  disabled?: boolean;
}

/**
 * Image attachment picker. Uses `expo-image-picker` (soft peer dep)
 * to launch the system library, capping at 3 images per request to
 * match the server's accepted batch size. Each thumbnail has a remove
 * handle.
 */
export function AttachmentPickerButton({
  uris,
  onChange,
  disabled = false,
}: AttachmentPickerButtonProps) {
  const pickImages = async () => {
    if (uris.length >= MAX_ATTACHMENTS) return;
    const picker = loadImagePicker();
    if (!picker) {
      console.warn(
        '[Feddy] expo-image-picker not installed — install it to enable attachments'
      );
      return;
    }
    try {
      const perm = await picker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        console.warn('[Feddy] media library permission denied');
        return;
      }
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: picker.MediaTypeOptions?.Images ?? 'Images',
        allowsMultipleSelection: true,
        selectionLimit: MAX_ATTACHMENTS - uris.length,
        quality: 1,
      });
      if (result.canceled || !result.assets) return;
      const newUris = result.assets.map((a) => a.uri);
      const merged = [...uris, ...newUris].slice(0, MAX_ATTACHMENTS);
      onChange(merged);
    } catch (err) {
      console.error(
        '[Feddy] image picker failed —',
        err instanceof Error ? err.message : err
      );
    }
  };

  const removeAt = (index: number) => {
    onChange(uris.filter((_, i) => i !== index));
  };

  const canAddMore = uris.length < MAX_ATTACHMENTS && !disabled;

  return (
    <View style={styles.row}>
      {uris.map((uri, index) => (
        <View
          key={`${uri}-${
            // biome-ignore lint/suspicious/noArrayIndexKey: thumbnails align with index
            index
          }`}
          style={styles.thumb}
        >
          <Image source={{ uri }} style={styles.thumbImage} />
          <Pressable
            onPress={() => removeAt(index)}
            disabled={disabled}
            hitSlop={6}
            style={styles.removeButton}
            accessibilityLabel={t('attachment.remove')}
          >
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
      ))}
      {canAddMore ? (
        <Pressable
          onPress={() => {
            void pickImages();
          }}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}
          accessibilityLabel={t('attachment.add')}
        >
          <Text style={styles.addPlus}>＋</Text>
          <Text style={styles.addLabel}>{t('attachment.label')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f0f0f2',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0009',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 14,
  },
  addButton: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addButtonPressed: {
    opacity: 0.6,
  },
  addPlus: {
    fontSize: 22,
    color: '#888',
    lineHeight: 24,
  },
  addLabel: {
    fontSize: 11,
    color: '#888',
  },
});
