# Stack Research: RT Jukebox

## Backend

- Node/TypeScript Express API.
- Postgres schema and migration script in `backend/src/db`.
- Redis and Socket.IO for runtime coordination.
- Firebase Admin for push messaging.
- Spotify-backed jukebox catalog and kiosk playback flows.

## Frontend Surfaces

- `jukebox-web-controller`: React/Vite controller app.
- `kiosk-web`: kiosk browser surface and playback helper tests.
- `mobile`: React Native mobile app with Android mobile and automotive build variants.

## Verification Commands

- Backend: `npm audit --json`, `npm test`, `npm run build`.
- Web controller: `npm audit --json`, `npm run lint`, `npm test`, `npm run build`.
- Kiosk: `npm audit --json`, `npm test`.
- Mobile: `npm audit --json`, `npm run lint`, `npm test -- --runInBand`, `npx react-native config`.
- Android: `.\gradlew.bat :app:assembleMobileDebug :app:assembleAutomotiveDebug --no-daemon`.
