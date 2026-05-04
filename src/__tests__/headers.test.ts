import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.4' },
}));

import { buildHeaders } from '../headers';
import { SDK_PLATFORM, SDK_VERSION } from '../version';

describe('buildHeaders', () => {
  it('emits all 9 X-Feddy-* headers + Authorization + User-Agent', () => {
    const h = buildHeaders('fed_abc123def456');
    expect(h['X-Feddy-Sdk-Platform']).toBe(SDK_PLATFORM);
    expect(h['X-Feddy-Sdk-Version']).toBe(SDK_VERSION);
    expect(h['X-Feddy-App-Id']).toBeDefined();
    expect(h['X-Feddy-App-Version']).toBeDefined();
    expect(h['X-Feddy-App-Build']).toBeDefined();
    expect(h['X-Feddy-Os-Name']).toBe('iOS');
    expect(h['X-Feddy-Os-Version']).toBe('17.4');
    expect(h['X-Feddy-Device-Model']).toBeDefined();
    expect(h['X-Feddy-Device-Manufacturer']).toBeDefined();
    expect(h['X-Feddy-Locale']).toBeDefined();
    expect(h.Authorization).toBe('Bearer fed_abc123def456');
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Accept).toBe('application/json');
  });

  it('falls back to "unknown" when expo-* peer deps are absent', () => {
    // Test env has no expo-application / expo-device / expo-localization
    // installed → safeRequire returns null → headers fall back to "unknown".
    const h = buildHeaders('fed_abc123def456');
    expect(h['X-Feddy-App-Id']).toBe('unknown');
    expect(h['X-Feddy-App-Version']).toBe('unknown');
    expect(h['X-Feddy-App-Build']).toBe('unknown');
    expect(h['X-Feddy-Device-Model']).toBe('unknown');
    expect(h['X-Feddy-Device-Manufacturer']).toBe('unknown');
    expect(h['X-Feddy-Locale']).toBe('unknown');
  });

  it('User-Agent encodes SDK identity + host OS for log readability', () => {
    const h = buildHeaders('fed_abc123def456');
    expect(h['User-Agent']).toBe(`Feddy-ReactNative/${SDK_VERSION} (iOS)`);
  });
});
