import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { currentBranding, refreshInBackground } from '../capabilities';
import { getCurrentClient } from '../runtime';
import type { Branding } from '../types';

/**
 * Footer rendered at the bottom of the SDK's feedback views. Reads
 * the cached branding payload from `capabilities.ts`:
 *
 * - `null` → renders nothing.
 * - non-null → renders text + optional logo, opens `branding.url`
 *   on tap.
 *
 * Triggers a background capabilities refresh on mount so any change
 * on the dashboard converges within 24h.
 */
export function PoweredByBadge() {
  // undefined = pre-resolution; null = no payload; object = render.
  const [branding, setBranding] = useState<Branding | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    void currentBranding().then((b) => {
      if (!cancelled) setBranding(b);
    });
    const client = getCurrentClient();
    if (client) refreshInBackground(client);
    return () => {
      cancelled = true;
    };
  }, []);

  if (branding == null) return null;

  const handlePress = () => {
    void Linking.openURL(branding.url);
  };

  return (
    <Pressable onPress={handlePress} accessibilityRole="link">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 8,
        }}
      >
        {branding.logoUrl != null ? (
          <Image
            source={{ uri: branding.logoUrl }}
            style={{ width: 14, height: 14, marginRight: 6 }}
          />
        ) : null}
        <Text style={{ fontSize: 12, color: '#888' }}>{branding.text}</Text>
      </View>
    </Pressable>
  );
}
