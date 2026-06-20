# RadioTEDU Mobile

The official **RadioTEDU** mobile app — for everyone to listen to RadioTEDU easily.

A React Native app (Android + iOS) for live radio, podcasts, the cafeteria **Jukebox** controller, games, and the listener leaderboard. Built for in-car listening with **Android Auto** (and CarPlay planned).

> Extracted from the `rtjukebox` monorepo into a standalone repository. The backend, kiosk display, and web controller live in their own repositories.

## Features

- **Live Radio** — multiple RadioTEDU channels with background playback and lock-screen controls.
- **Podcasts** — browse and listen to school podcasts.
- **Jukebox controller** — scan a cafeteria QR code to join a session and vote on the queue.
- **Android Auto** — browse channels (and podcasts) and control playback from the car. *(CarPlay planned — requires Apple's CarPlay audio entitlement.)*
- **Games & Leaderboard** — gamified listening.

## Tech stack

- React Native `0.76.9`, React `18.3.1`, TypeScript
- `react-native-track-player` v4 (audio + Android Auto / CarPlay)
- `@react-navigation` (bottom tabs + native stack)
- `zustand` (player state), `axios` (API), `socket.io-client` (live jukebox)

## Getting started

```bash
npm install
# iOS only:
cd ios && pod install && cd ..
```

### Run

```bash
npm start          # Metro bundler
npm run android    # build & run on Android device/emulator
npm run ios        # build & run on iOS simulator (macOS only)
```

### Quality checks

```bash
npm run lint            # ESLint
npx tsc --noEmit        # TypeScript typecheck
npm test                # Jest
```

## Project structure

```text
src/
  components/     Shared UI (MiniPlayer, GlobalHeader, AuthGuard, …)
  context/        Auth, Channel, Metadata providers
  data/           radioChannels.ts (channel catalog + artwork)
  navigation/     RootNavigator (tabs + stacks)
  screens/        Radio, Podcasts, Jukebox, Games, Profile, …
  services/       api, playbackService, playbackQueue, podcastService, …
  store/          zustand stores
  theme/          colors & styling
android/          native Android project (incl. Android Auto config)
ios/              native iOS project
```

## Android Auto

Channels (and podcasts) are exposed to the car via `react-native-track-player`'s media session.
See [`docs/ANDROID_AUTO.md`](docs/ANDROID_AUTO.md) for architecture, the required square artwork
assets, and the Desktop Head Unit (DHU) test checklist.

## License

See the upstream RadioTEDU project. Deployments must include a visible "RadioTEDU" reference.
