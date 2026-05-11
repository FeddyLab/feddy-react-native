# Feddy React Native SDK

> **Beta Notice**: This SDK is currently in beta (v0.2.1). The API may change before the 1.0 release.

A React Native SDK for integrating [Feddy](https://feddy.app) feedback, roadmap, and Smart Review into your iOS and Android apps. Pure JavaScript with optional Expo modules — no custom native bridges, Expo Go compatible.

## Installation

```sh
npm install @feddyapp/react-native @react-native-async-storage/async-storage react-native-safe-area-context
```

For richer features, also install the optional Expo modules — each adds a specific capability and is gracefully no-op'd when missing:

```sh
npx expo install \
  expo-application expo-device expo-localization \
  expo-image-picker expo-image-manipulator expo-store-review \
  expo-iap
```

| Optional module | Powers |
|---|---|
| `expo-application` / `expo-device` | App ID / version / device telemetry headers |
| `expo-localization` | Auto-detect device locale (en / es / ja / de / fr) |
| `expo-image-picker` / `expo-image-manipulator` | Image attachments on feedback submissions |
| `expo-store-review` | Native App Store / Play Store review prompt after the user confirms |
| `expo-iap` | Auto-detect the user's active subscription via StoreKit 2 / Play Billing |

## Quick Start

### 1. Setup

Configure the SDK once at app launch with your **Project ID** (`fed_xxxxxxxxxxxx`, copied from your Feddy dashboard), and mount `<FeddyProvider />` at the root of your app:

```tsx
import { Feddy, FeddyProvider } from '@feddyapp/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

Feddy.configure({ apiKey: 'fed_xxxxxxxxxxxx' });

export default function App() {
  return (
    <SafeAreaProvider>
      <FeddyProvider>
        <YourApp />
      </FeddyProvider>
    </SafeAreaProvider>
  );
}
```

`FeddyProvider` mounts the built-in compose modal and Smart Review sheet so the imperative APIs (`Feddy.openFeedback()`, `Feddy.requestReviewIfAppropriate()`) work from anywhere in your tree.

### 2. Identify Users

Call `Feddy.identify()` from your auth handler with whatever fields you already have:

```ts
// Minimal identification (only userId)
Feddy.identify({ userId: 'user_42' });

// With email
Feddy.identify({
  userId: 'user_42',
  email: 'user@example.com',
});

// With display name
Feddy.identify({
  userId: 'user_42',
  email: 'user@example.com',
  displayName: 'Alice Chen',
});

// With avatar URL
Feddy.identify({
  userId: 'user_42',
  email: 'user@example.com',
  displayName: 'Alice Chen',
  avatarUrl: 'https://example.com/avatar.jpg',
});
```

Every parameter is optional. Calls before `identify` fall back to a per-install anonymous token.

### 3. Open the Feedback Modal

```tsx
import { Pressable, Text } from 'react-native';
import { Feddy } from '@feddyapp/react-native';

<Pressable onPress={() => Feddy.openFeedback({ boardKey: 'features' })}>
  <Text>Suggest a feature</Text>
</Pressable>;
```

### 4. Browse Feedback + Roadmap

```tsx
import { useState } from 'react';
import {
  RequestListView,
  RoadmapView,
} from '@feddyapp/react-native';

function FeedbackTab() {
  const [listVisible, setListVisible] = useState(false);
  const [roadmapVisible, setRoadmapVisible] = useState(false);
  return (
    <>
      <Button title="All feedback" onPress={() => setListVisible(true)} />
      <Button title="Roadmap" onPress={() => setRoadmapVisible(true)} />
      <RequestListView
        visible={listVisible}
        onDismiss={() => setListVisible(false)}
      />
      <RoadmapView
        visible={roadmapVisible}
        onDismiss={() => setRoadmapVisible(false)}
      />
    </>
  );
}
```

Both views are full-screen modals with built-in pagination, pull-to-refresh, voting, and tap-to-detail navigation. Detail screens have inline comments and an upvote button.

### 5. Smart Review

Call `Feddy.requestReviewIfAppropriate()` from any "user just had a good moment" hook. The SDK applies install-age / session-count / cooldown / yearly-cap gates server-side and locally. If they pass, a two-step sheet appears: step one asks whether the user is enjoying the app, step two confirms before invoking the system review prompt. A negative answer in step one routes straight to the compose modal so the feedback is captured privately instead of as a public 1-star App Store review.

```ts
Feddy.requestReviewIfAppropriate({
  trigger: 'task_completed', // surfaces in your dashboard funnel
});
```

### 6. App Lifecycle (Expo Router)

If your app uses `expo-router`, place setup in `app/_layout.tsx`:

```tsx
import { Feddy, FeddyProvider } from '@feddyapp/react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

Feddy.configure({ apiKey: 'fed_xxxxxxxxxxxx' });

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FeddyProvider>
        <Stack />
      </FeddyProvider>
    </SafeAreaProvider>
  );
}
```

## Advanced Usage

### Anonymous Tracking

Calls before `Feddy.identify()` are fully supported. The SDK generates a stable per-install token (kept in `AsyncStorage`) and attaches it as `anonymous_token` on every request. Once the user identifies, subsequent writes carry the `userId` instead.

### Logout

```ts
Feddy.reset();
```

Clears the last identified user, manual subscription override, and cached server capabilities. The anonymous token is intentionally preserved so any feedback the user submitted before login still links correctly.

### Subscription State

By default the SDK reads the host app's currently-active subscription from `expo-iap` (StoreKit 2 on iOS, Play Billing on Android) once at `configure(...)` and again on each `identify(...)`, so feedback rows in your dashboard carry up-to-date plan info with zero extra wiring.

```ts
import { Feddy } from '@feddyapp/react-native';

Feddy.configure({ apiKey: 'fed_xxxxxxxxxxxx' });
// Auto-detection runs in the background.
```

Auto-detection requires the `expo-iap` peer dep to be installed and initialised by the host app. When it's absent the SDK silently skips detection.

After a purchase, restore, or subscription state change, ask the SDK to re-read the entitlement so the next identify carries the freshest snapshot:

```ts
Feddy.refreshSubscription();
```

If your source-of-truth for paid state is RevenueCat, Adapty, or your own server, disable auto-detection and push the state explicitly:

```ts
Feddy.configure({
  apiKey: 'fed_xxxxxxxxxxxx',
  autoDetectSubscription: false,
});

Feddy.setSubscription({
  isPaid: true,
  status: 'active',
  productId: 'com.foo.pro_monthly',
  expiresAt: '2026-12-31T00:00:00Z',
});

// Pass null to clear and let auto-detection take over again.
Feddy.setSubscription(null);
```

Manual override always wins over the auto-detected snapshot. Both persist across launches; the next `Feddy.identify(...)` call attaches whichever takes precedence automatically.

### Custom Boards & i18n

The two SDK-shipped system boards (`features` / `bugs`) come pre-translated in 5 locales (en / es / ja / de / fr) and are picked automatically based on the device locale. The bundled views fetch the workspace's full board set from `GET /v1/boards` (1 h cached) so any custom board you create in the dashboard appears without redeploying the app:

```tsx
<FeedbackComposeView visible={open} onDismiss={...} />   // boards fetched in the background
<RequestListView visible={open} onDismiss={...} />
<RoadmapView visible={open} onDismiss={...} />
```

For **custom boards**, supply per-locale display names via `boardTranslations` so each device locale renders the right label:

```ts
Feddy.configure({
  apiKey: 'fed_xxxxxxxxxxxx',
  boardTranslations: {
    'roadmap-2026': {
      en: 'Roadmap 2026',
      ja: 'ロードマップ 2026',
      es: 'Hoja de ruta 2026',
    },
    design: { ja: 'デザインフィードバック' },
  },
});
```

Resolution order for any custom board key:

1. `boardTranslations[key][deviceLocale]` if set
2. The server's `board.name` (whatever the admin typed in the dashboard)
3. Capitalized key as a last-ditch label

System keys (`features` / `bugs`) always use the SDK's bundled translations — they are intentionally not overridable so first-party UI stays consistent across SDK platforms.

If your app already has its own i18n system and you want to bypass `fetchBoards`, pass an explicit `boards` prop — the view will skip the network call entirely:

```tsx
import { useTranslation } from 'react-i18next';

function FeedbackEntry() {
  const { t } = useTranslation();
  return (
    <RequestListView
      visible={open}
      onDismiss={...}
      boards={[
        { key: 'features', name: t('feedback.boards.features') },
        { key: 'bugs', name: t('feedback.boards.bugs') },
        { key: 'design', name: t('feedback.boards.design') },
      ]}
    />
  );
}
```

```ts
const boards = await Feddy.fetchBoards();    // for custom UIs
```

### Programmatic Submit

Submit feedback without showing the modal — useful for custom UIs:

```ts
Feddy.submitRequest({
  title: 'Add dark mode',
  description: 'Hard to read at night.',
  boardKey: 'features',
  imageUris: ['file:///…/screenshot.jpg'], // optional
});
```

Fire-and-forget. Image attachments require `expo-image-picker` / `expo-image-manipulator` and a paid workspace plan.

### Fetch + Vote + Comment Programmatically

For custom UIs that want to render their own list / detail / kanban:

```ts
const page = await Feddy.fetchRequests({
  boardKey: 'features',
  status: 'planned',
  limit: 20,
});

const detail = await Feddy.fetchRequest('req_xyz');
const comments = await Feddy.fetchComments({ requestId: 'req_xyz' });
const newState = await Feddy.upvote({ requestId: 'req_xyz' });
const posted = await Feddy.addComment({
  requestId: 'req_xyz',
  body: 'Great idea!',
});
```

These return Promises and reject with `FeddyError` on failure — the host app needs the response to render UI.

### Direct Modal Rendering

Render `<FeedbackComposeView />` / `<RequestDetailView />` / `<SmartReviewSheet />` directly with your own visibility state if you want to manage the modal yourself instead of using `<FeddyProvider />`.

## Requirements

- React Native 0.73+ / React 18+
- iOS 15.0+ / Android API 24+
- TypeScript 5+ (optional, ships with full type declarations)

## Features

- **Simple Integration** — one-line `Feddy.configure()` + `Feddy.openFeedback()` for the common case.
- **Cross-Platform** — iOS and Android from one codebase. Expo Go compatible.
- **No Custom Native Bridges** — pure JavaScript with optional Expo modules. No Pod install, no Gradle config required.
- **Drop-in Views** — `<RequestListView />`, `<RoadmapView />`, `<RequestDetailView />` with pagination, voting, and comments built in.
- **Smart Review** — route happy users to the App Store and unhappy users to a private feedback form.
- **Image Attachments** — up to 3 photos per request, auto-compressed and uploaded directly to R2.
- **Anonymous Fallback** — writes attribute correctly even before the host app calls `identify()`.
- **Fire-and-Forget API** — no `try` / `await` boilerplate at the call site for state-mutating methods.
- **Localized** — built-in `en / es / ja / de / fr` (auto-detected from device locale).
- **Type-Safe** — full TypeScript declarations bundled, strict-mode safe.

## License

MIT License — see LICENSE file for details.

## Support

- Documentation: [https://feddy.app](https://feddy.app)
- Issues: [https://github.com/FeddyLab/feddy-react-native/issues](https://github.com/FeddyLab/feddy-react-native/issues)
