# Mobile Tab Simplification And Spark/Rock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile bottom navigation less crowded, move secondary destinations to Home, and make Spark/Rock playable radio channels.

**Architecture:** Keep the existing React Navigation stack/tab structure. The bottom tab navigator keeps only the five primary destinations, while Home exposes secondary destinations as quick actions. Radio channel availability remains centralized in `mobile/src/data/radioChannels.ts`.

**Tech Stack:** React Native, React Navigation bottom tabs/native stack, Jest source-contract tests, React Native Track Player channel queue helpers.

## Global Constraints

- Do not introduce a separate automotive APK.
- Keep edits scoped to mobile navigation, Home quick actions, radio channel availability, and tests.
- Spark uses `/spark`; Rock uses `/rock` and may fail at stream runtime until the backend mount is live.
- Social and Next Song remain account-gated through their existing screens/guards.

---

### Task 1: Navigation Contract

**Files:**
- Modify: `mobile/__tests__/nextSongVoteNavigation.test.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: existing stack route names `NextSongVote`, `Social`, `Leaderboard`
- Produces: bottom tabs `Home`, `Radio`, `Podcasts`, `Jukebox`, `Study`

- [ ] **Step 1: Write the failing test**

Assert that secondary routes are no longer declared as `Tab.Screen` and remain reachable as `Stack.Screen`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand nextSongVoteNavigation.test.ts`

- [ ] **Step 3: Write minimal implementation**

Remove `NextSongVote`, `Social`, and `Leaderboard` from `MainTabs`; add them to the root stack.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand nextSongVoteNavigation.test.ts`

### Task 2: Home Quick Actions

**Files:**
- Modify: `mobile/src/screens/HomeScreen.tsx`
- Test: `mobile/__tests__/nextSongVoteNavigation.test.ts`

**Interfaces:**
- Consumes: `navigation.navigate('NextSongVote' | 'Social' | 'Leaderboard')`
- Produces: Home cards for Oylama, Social, and Rankings

- [ ] **Step 1: Write the failing test**

Assert Home navigates to the three secondary routes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand nextSongVoteNavigation.test.ts`

- [ ] **Step 3: Write minimal implementation**

Add quick action cards to the Home screen using existing card styles and navigation object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand nextSongVoteNavigation.test.ts`

### Task 3: Spark/Rock Playability

**Files:**
- Modify: `mobile/src/data/radioChannels.ts`
- Modify: `mobile/__tests__/radioChannels.test.ts`

**Interfaces:**
- Consumes: `isChannelPlayable`, `buildRadioQueue`, Spark/Rock channel definitions
- Produces: Spark and Rock as playable queue entries

- [ ] **Step 1: Write the failing test**

Assert Spark and Rock are playable and included in the radio queue.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand radioChannels.test.ts`

- [ ] **Step 3: Write minimal implementation**

Change Spark and Rock availability to `live`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand radioChannels.test.ts`

### Task 4: Verification And APK

**Files:**
- Build artifact: `mobile/android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- --runInBand nextSongVoteNavigation.test.ts radioChannels.test.ts`

- [ ] **Step 2: Run Android audit**

Run: `npm run audit:android`

- [ ] **Step 3: Build release APK**

Run: `.\gradlew.bat :app:assembleRelease`

- [ ] **Step 4: Install and launch on emulator when available**

Run: `adb install -r app-release.apk` and launch `com.radiotedumobile`.
