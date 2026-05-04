import { Platform } from 'react-native';
import { SDK_PLATFORM, SDK_VERSION } from './version';

const UNKNOWN = 'unknown';

interface ExpoApplicationModule {
  applicationId: string | null;
  nativeApplicationVersion: string | null;
  nativeBuildVersion: string | null;
}

interface ExpoDeviceModule {
  modelName: string | null;
  manufacturer: string | null;
}

interface ExpoLocalizationModule {
  getLocales: () => Array<{ languageTag: string }>;
}

function safeRequire<T>(name: string): T | null {
  try {
    return require(name) as T;
  } catch {
    return null;
  }
}

function detectOsName(): string {
  if (Platform.OS === 'ios') return 'iOS';
  if (Platform.OS === 'android') return 'Android';
  return Platform.OS;
}

function detectLocale(): string {
  const localization = safeRequire<ExpoLocalizationModule>('expo-localization');
  if (localization?.getLocales) {
    const locales = localization.getLocales();
    const tag = locales?.[0]?.languageTag;
    if (typeof tag === 'string' && tag.length > 0) return tag;
  }
  return UNKNOWN;
}

export function buildHeaders(apiKey: string): Record<string, string> {
  const application = safeRequire<ExpoApplicationModule>('expo-application');
  const device = safeRequire<ExpoDeviceModule>('expo-device');
  const osName = detectOsName();
  const osVersion = String(Platform.Version);

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': `Feddy-ReactNative/${SDK_VERSION} (${osName})`,
    'X-Feddy-Sdk-Platform': SDK_PLATFORM,
    'X-Feddy-Sdk-Version': SDK_VERSION,
    'X-Feddy-App-Id': application?.applicationId ?? UNKNOWN,
    'X-Feddy-App-Version': application?.nativeApplicationVersion ?? UNKNOWN,
    'X-Feddy-App-Build': application?.nativeBuildVersion ?? UNKNOWN,
    'X-Feddy-Os-Name': osName,
    'X-Feddy-Os-Version': osVersion,
    'X-Feddy-Device-Model': device?.modelName ?? UNKNOWN,
    'X-Feddy-Device-Manufacturer': device?.manufacturer ?? UNKNOWN,
    'X-Feddy-Locale': detectLocale(),
  };
}
