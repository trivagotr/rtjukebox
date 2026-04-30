# Mobile Gamification Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first usable gamification platform for the RadioTEDU mobile app: home discovery, events, games, market, profile customization, points ledger, and category leaderboards.

**Architecture:** Keep gamification state in the RadioTEDU backend as the source of truth. Mobile reads consolidated gamification APIs and sends only user actions, while external `cleanroom-radio` and `radiotedu.com/bilet` integrations remain contract placeholders for later server-side work.

**Tech Stack:** Express/TypeScript backend with PostgreSQL schema migrations, React Native 0.76 mobile app, axios API services, Jest/Vitest tests.

---

### Task 1: Backend gamification foundation

**Files:**
- Modify: `backend/src/db/schema.sql`
- Create: `backend/src/services/gamification.ts`
- Test: `backend/src/services/gamification.test.ts`

Add the points ledger, user point balances, market catalog, event catalog, game catalog, listening sessions, QR claims, badges, and profile customization tables. Add pure helpers for category normalization, point award SQL payloads, game score limits, and market balance checks.

Run: `npm test -- --run src/services/gamification.test.ts src/db/migrate.test.ts`

### Task 2: Backend APIs

**Files:**
- Create: `backend/src/routes/gamification.ts`
- Create: `backend/src/routes/profile.ts`
- Modify: `backend/src/routes/users.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/routes/gamification.test.ts`
- Test: `backend/src/routes/profile.test.ts`
- Test: `backend/src/routes/usersLeaderboard.test.ts`

Add authenticated APIs for gamification home, points, events, games, market redemption, listening heartbeat, QR claims, and profile favorites. Extend leaderboard with category filters. Add email domain allowlist for non-guest registration.

Run: `npm test -- --run src/routes/gamification.test.ts src/routes/profile.test.ts src/routes/usersLeaderboard.test.ts`

### Task 3: Mobile services and navigation

**Files:**
- Create: `mobile/src/services/gamificationService.ts`
- Create: `mobile/src/services/profileService.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Test: `mobile/__tests__/gamificationService.test.ts`
- Test: `mobile/__tests__/profileService.test.ts`

Add API clients and navigation entries for Home, Events, Games, Market, and Profile detail flows. Keep the bottom tab compact: Home, Radio, Podcasts, Jukebox, Leaderboard.

Run: `npm test -- --runInBand __tests__/gamificationService.test.ts __tests__/profileService.test.ts`

### Task 4: Mobile screens

**Files:**
- Create: `mobile/src/screens/HomeScreen.tsx`
- Create: `mobile/src/screens/EventsScreen.tsx`
- Create: `mobile/src/screens/GamesScreen.tsx`
- Create: `mobile/src/screens/MarketScreen.tsx`
- Modify: `mobile/src/screens/ProfileScreen.tsx`
- Modify: `mobile/src/screens/LeaderboardScreen.tsx`
- Test: `mobile/__tests__/App.test.tsx`

Build production-ready first-pass screens. Surface market sections inside events, games, and leaderboard. Add profile favorite song, artist, podcast, and badge showcase fields.

Run: `npm test -- --runInBand`

### Task 5: Verification and release

Run backend tests/build, mobile tests/typecheck, then build a release APK. Commit and push to `feature/jukebox-subdirectory-publish`.

Run:
- `npm test -- --run` in `backend`
- `npm run build` in `backend`
- `npm test -- --runInBand` in `mobile`
- `npx tsc --noEmit` in `mobile`
- `./gradlew.bat assembleRelease` in `mobile/android`
