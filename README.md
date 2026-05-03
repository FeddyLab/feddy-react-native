# Feddy React Native SDK

Feedback infrastructure for React Native apps. Part of [Feddy](https://feddy.app).

- **Language:** TypeScript
- **Architecture:** Pure JS / TS — no native module linking required (HTTP-based)
- **Minimum RN:** 0.73 / React 18
- **Distribution:** npm (`@feddy/react-native`)
- **License:** MIT

## Status

🚧 **v1.0 in active development — shipping with the Feddy v1.0 launch (target 2026-05-15).**

v1.0 ships a focused, minimal SDK with zero native linking — drop the package in and call one method to let users submit feedback. Higher-touch features (request lists, roadmap, comments, attachments, Smart Review Prompt) require native bridges and are planned for v1.x.

## v1.0 surface (HTTP route, zero native linking)

```typescript
import { Feddy } from '@feddy/react-native';

await Feddy.configure({ apiKey: 'fed_abc123def456' });
await Feddy.identify('user_42');
Feddy.openFeedback({ boardKey: 'features' });   // built-in compose modal
```

That's the full integration — Feddy ships a built-in `FeedbackComposeView` modal, you don't paint any UI.

### Included in v1.0

- `Feddy.configure({ apiKey })`
- `Feddy.identify(userId, traits)`
- `Feddy.submitRequest({ title, description, boardKey })`
- `Feddy.openFeedback({ boardKey? })` — built-in modal (zero UI code on host side)
- Powered by Feddy badge (server-driven)
- Expo Go compatible (no native modules)

### Coming in v1.x (requires native bridge)

- Request list / roadmap / detail views
- Comments + voting
- Attachment upload
- Subscription state capture (StoreKit 2 / Play Billing)
- Smart Review Prompt (SKStoreReviewController / Play In-App Review)
- Offline queue persistence

## Why HTTP route in v1.0

Native bridge requires `feddy-android` to ship first, which is on a longer timeline. Going HTTP-first lets React Native users integrate Feddy today with zero linking, zero Pod install, zero Gradle config — and Expo Go just works.

The trade-off is that features requiring platform APIs (Smart Review's `SKStoreReviewController` / `Play In-App Review`, StoreKit 2 subscription detection) wait for v1.x's native bridge phase.
