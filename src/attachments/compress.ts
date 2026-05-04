interface ImageManipulatorModule {
  manipulateAsync: (
    uri: string,
    actions: Array<{
      resize?: { width?: number; height?: number };
    }>,
    options: {
      compress?: number;
      format?: 'jpeg' | 'png' | 'webp';
    }
  ) => Promise<{ uri: string; width: number; height: number }>;
  SaveFormat?: { JPEG: 'jpeg'; PNG: 'png'; WEBP: 'webp' };
}

function loadImageManipulator(): ImageManipulatorModule | null {
  try {
    return require('expo-image-manipulator') as ImageManipulatorModule;
  } catch {
    return null;
  }
}

export interface CompressedImage {
  uri: string;
  size: number;
}

const MAX_LONG_SIDE = 1600;

/**
 * Resize + JPEG-compress an image so the upload stays small. Mirrors
 * the iOS strategy (1600px long side, quality 0.8). When
 * `expo-image-manipulator` isn't installed, returns the original URI
 * unchanged — server cap is 2MB so most photos still upload fine.
 */
export async function compressImage(uri: string): Promise<CompressedImage> {
  const manipulator = loadImageManipulator();
  let resultUri = uri;

  if (manipulator) {
    try {
      // First read original dimensions to decide which axis to clamp.
      const info = await manipulator.manipulateAsync(uri, [], {});
      const isLandscape = info.width >= info.height;
      const resize = isLandscape
        ? { width: MAX_LONG_SIDE }
        : { height: MAX_LONG_SIDE };
      const compressed = await manipulator.manipulateAsync(uri, [{ resize }], {
        compress: 0.8,
        format: 'jpeg',
      });
      resultUri = compressed.uri;
    } catch (err) {
      console.warn(
        '[Feddy] image compression failed; uploading original —',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn(
      '[Feddy] expo-image-manipulator not installed — uploading original (may be larger than necessary)'
    );
  }

  // Read the file size for the sign request.
  const response = await fetch(resultUri);
  const blob = await response.blob();
  return { uri: resultUri, size: blob.size };
}
