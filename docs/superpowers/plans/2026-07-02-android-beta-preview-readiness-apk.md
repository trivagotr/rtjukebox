# Android Beta Preview Readiness APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the RadioTEDU mobile Android app beta/preview-ready across applicable Android 16, Android 16 QPR, Android 17, Android Auto, Automotive OS, Google Maps media controls, Live Updates fallback, adaptive layout, backend connectivity, and APK verification surfaces.

**Architecture:** Extend the existing `androidSystemCapabilities`, `androidReadinessService`, `notificationService`, `carBridge`, native `RadioTeduCarService`, and `android-publish-audit.js` surfaces rather than adding a parallel readiness system. Use runtime-gated capability resolvers for preview APIs and document store/review-only validations separately from implemented local checks.

**Tech Stack:** React Native 0.76, Jest, Android Gradle, Kotlin `MediaBrowserServiceCompat` / `MediaSessionCompat`, React Native Track Player, PowerShell/Node audit scripts.

## Global Constraints

- Repo root: `C:\Users\akgul\Downloads\rtjukebox`.
- Mobile app is the priority; only mirror into `mobile-gamification` if an equivalent file already exists and needs the same standard.
- Android beta/preview APIs must be runtime-gated and must not crash older devices.
- Play/Google review and real head-unit validation must be marked `ready, requires Google review / real device validation`, not `implemented`.
- Every code change must have a test or audit proof.
- Backend connections must be verified by mobile tests that assert endpoint paths and payloads.
- Build APK only after fresh tests/audit/build command exit codes are inspected.

---

### Task 1: Readiness Resolver Coverage

**Files:**
- Modify: `mobile/src/services/androidSystemCapabilities.ts`
- Modify: `mobile/src/services/androidReadinessService.ts`
- Modify: `mobile/__tests__/androidReadiness.test.ts`

**Interfaces:**
- Produces: `buildAndroid16QprReadiness`, `buildAndroid17Readiness`, `buildAdaptiveLayoutReadiness`, `buildGoogleMapsMediaReadiness`.
- Consumes: existing `buildAndroidReadiness` matrix.

- [ ] Write failing Jest tests for Android 16 QPR custom icon/SMS OTP/developer verification, Android 17 large-screen restrictions, adaptive layout, and Google Maps media controls.
- [ ] Run `npm test -- __tests__/androidReadiness.test.ts --runInBand` and confirm the new tests fail because functions/fields are missing.
- [ ] Implement the resolvers and include status fields in `buildAndroidReadiness`.
- [ ] Re-run the focused Jest test and confirm pass.
- [ ] Commit only resolver/test files.

### Task 2: Backend Connectivity Proof

**Files:**
- Modify: `mobile/__tests__/notificationService.test.ts`
- Modify: `mobile/__tests__/studyService.test.ts`
- Modify: `mobile/__tests__/nextSongVote.test.ts`
- Modify: `mobile/__tests__/jukeboxContract.test.ts` if a missing backend contract is found.

**Interfaces:**
- Consumes: existing mobile service functions.
- Produces: endpoint-level tests proving backend connections for notifications, Study/Pomodoro, next-song voting, jukebox, and car leaderboard/jukebox data.

- [ ] Add failing tests for backend endpoint paths and payloads not already covered.
- [ ] Run the focused Jest files and confirm red where missing.
- [ ] Implement only missing service contract helpers if needed.
- [ ] Re-run focused tests and confirm pass.
- [ ] Commit only backend-contract test/service files.

### Task 3: Car, Voice, Google Maps, and Safety

**Files:**
- Modify: `mobile/src/services/androidSystemCapabilities.ts`
- Modify: `mobile/src/services/carBridge.ts`
- Modify: `mobile/__tests__/androidReadiness.test.ts`
- Create or modify: `mobile/__tests__/carBridgeSource.test.ts`
- Modify: `mobile/android/app/src/main/java/com/radiotedumobile/car/RadioTeduCarService.kt`

**Interfaces:**
- Produces: richer voice aliases including Turkish commands and Google/Gemini/Maps-compatible media-session readiness checks.
- Consumes: existing `buildVoiceActionMap`, `findChannelByQuery`, and native `onPlayFromSearch`.

- [ ] Add tests ensuring voice map includes `Play Radio TEDU`, `Radio TEDU çal`, `Play latest podcast`, `son podcasti cal`, Spark, and Rock.
- [ ] Add source/audit tests ensuring Study/Çim/avatar/gamification never appear in car browse tree text, and that Google Maps media support is represented through MediaSession/MediaBrowser, not a map-specific SDK claim.
- [ ] Run focused tests and confirm red for missing aliases/checks.
- [ ] Implement minimal map/voice/readiness changes.
- [ ] Re-run focused tests and confirm pass.
- [ ] Commit only car/media files.

### Task 4: Release Audit and Documentation

**Files:**
- Modify: `mobile/scripts/android-publish-audit.js`
- Modify: `mobile/docs/ANDROID_MODERN_PUBLISH_READINESS.md`
- Modify: `mobile/docs/RELEASE_CHECKLIST.md`
- Modify: `mobile/docs/ANDROID_AUTO.md`
- Modify tests for audit source if present, or add `mobile/__tests__/androidPublishAuditSource.test.ts`.

**Interfaces:**
- Produces: audit checks for SDK/API declarations, permissions, foreground service media playback, Auto/Automotive declarations, voice actions, adaptive resize support, Android 16/17 docs, Live Updates fallback docs, ProGuard/R8 media keep rules, and release checklist coverage.

- [ ] Add failing audit-source tests for missing audit coverage.
- [ ] Run focused tests and `npm run audit:android`; confirm expected failures.
- [ ] Update audit script and docs with implemented vs ready/requires-review status.
- [ ] Re-run focused tests and audit.
- [ ] Commit only audit/docs files.

### Task 5: APK Verification

**Files:**
- No source edits unless build reveals a tested defect.

**Interfaces:**
- Produces: local APK artifact path and build status.

- [ ] Run `npm test -- --runInBand` in `mobile`.
- [ ] Run `npm run audit:android` in `mobile`.
- [ ] Run Android Gradle assemble for the appropriate preview APK. Prefer `.\gradlew.bat :app:assembleMobileDebug`; use release only if keystore is present.
- [ ] Inspect exit codes and artifact paths under `mobile/android/app/build/outputs/apk/`.
- [ ] Commit any final verification doc update if needed.
