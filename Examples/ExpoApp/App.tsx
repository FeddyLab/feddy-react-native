import {
  Feddy,
  FeddyProvider,
  RequestListView,
  RoadmapView,
} from '@feddyapp/react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

const FEDDY_API_KEY = process.env.EXPO_PUBLIC_FEDDY_API_KEY;

// Hardcoded demo user — in a real app this comes from your auth layer.
// Feddy never authenticates end users; it just records whatever identity
// the host app already has.
//
// Each platform demo uses a distinct user identity so a tester running
// the iOS / Flutter / RN sample apps side-by-side can verify the
// comment-bubble visual distinction (self / other / admin). iOS uses
// Alice Chen, Flutter uses Bob Park, RN uses Charlie Tan.
const DEMO_USER = {
  id: 'demo_user_charlie',
  email: 'charlie@example.com',
  displayName: 'Charlie Tan',
};

if (FEDDY_API_KEY) {
  Feddy.configure({ apiKey: FEDDY_API_KEY });
  Feddy.identify({
    userId: DEMO_USER.id,
    email: DEMO_USER.email,
    displayName: DEMO_USER.displayName,
  });
}

export default function App() {
  return (
    <SafeAreaProvider>
      {FEDDY_API_KEY ? (
        <FeddyProvider>
          <ProfileScreen />
        </FeddyProvider>
      ) : (
        <MissingKeyState />
      )}
    </SafeAreaProvider>
  );
}

function MissingKeyState() {
  return (
    <SafeAreaView style={styles.emptyRoot}>
      <StatusBar style="auto" />
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>
          Set EXPO_PUBLIC_FEDDY_API_KEY to run the demo
        </Text>
        <Text style={styles.emptyHint}>
          Copy .env.example to .env and fill in your Project ID from{'\n'}
          dashboard.feddy.app → Settings → General.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ProfileScreen() {
  const [listVisible, setListVisible] = useState(false);
  const [roadmapVisible, setRoadmapVisible] = useState(false);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>

        <Section title="Account">
          <Row label="Name" value={DEMO_USER.displayName} />
          <Row label="Email" value={DEMO_USER.email} />
          <Row label="ID" value={DEMO_USER.id} />
        </Section>

        <Section title="Share Feedback">
          <ActionRow
            label="Send feedback"
            onPress={() => Feddy.openFeedback()}
          />
        </Section>

        <Section title="Browse">
          <ActionRow
            label="All feedback"
            onPress={() => setListVisible(true)}
          />
          <ActionRow
            label="Roadmap"
            onPress={() => setRoadmapVisible(true)}
          />
        </Section>

        <Section title="Smart Review (debug)">
          <ActionRow
            label="Trigger review prompt"
            onPress={() =>
              Feddy.requestReviewIfAppropriate({
                trigger: 'demo_button',
                bypassGates: true,
              })
            }
          />
          <ActionRow
            label="Reset review state"
            onPress={() => Feddy.resetSmartReviewState()}
          />
        </Section>
      </ScrollView>

      <RequestListView
        visible={listVisible}
        onDismiss={() => setListVisible(false)}
      />
      <RoadmapView
        visible={roadmapVisible}
        onDismiss={() => setRoadmapVisible(false)}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function ActionRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
    marginTop: 8,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowLabel: {
    fontSize: 16,
    color: '#111',
  },
  rowValue: {
    fontSize: 16,
    color: '#666',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  pressed: {
    backgroundColor: '#f0f0f2',
  },
  actionLabel: {
    fontSize: 16,
    color: '#0070f3',
  },
  actionChevron: {
    fontSize: 22,
    color: '#bbb',
  },
  emptyRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
