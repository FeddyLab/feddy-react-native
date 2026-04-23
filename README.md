# Feddy React Native SDK

Feedback infrastructure for React Native apps. Part of [Feddy](https://feddy.app).

- **Language:** TypeScript
- **Bridging:** Native modules for iOS + Android (re-exposes `feddy-ios` / `feddy-android`)
- **Minimum RN:** 0.73 / React 18
- **Distribution:** npm (`@feddy/react-native`)
- **License:** MIT

## Status

🚧 Writing from scratch. Native components, not WebView-wrapped.

## Roadmap

- [ ] `Feddy.configure({ apiKey })`
- [ ] `Feddy.identify(userId, traits)`
- [ ] `<FeedbackView />`
- [ ] `<WishListView />`
- [ ] `<SurveyView />`
- [ ] `Feddy.requestReviewIfAppropriate()`
- [ ] Offline queue
- [ ] RevenueCat bridge
