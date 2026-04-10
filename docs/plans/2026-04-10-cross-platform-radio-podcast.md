# Cross-Platform Radio + Podcast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a shared radio/podcast playback foundation so the mobile app can support iOS, Android Auto, CarPlay, and companion wearable controls without exposing jukebox on vehicle or wearable surfaces.

**Architecture:** Extract playback behavior out of individual screens and into a shared playback domain built on `react-native-track-player`. Vehicle surfaces and wearables consume the same domain, while phone-only jukebox remains untouched.

**Tech Stack:** React Native 0.76, TypeScript, react-native-track-player, Android Auto media browser service, iOS native project/CarPlay integration, RSS/web podcast ingestion.

---

### Task 1: Baseline the Existing Mobile Playback Surface

**Files:**
- Modify: `E:/rtmusicbox/mobile/App.tsx`
- Modify: `E:/rtmusicbox/mobile/src/services/playbackService.ts`
- Modify: `E:/rtmusicbox/mobile/src/screens/RadioScreen.tsx`
- Modify: `E:/rtmusicbox/mobile/src/screens/PodcastScreen.tsx`
- Test: `E:/rtmusicbox/mobile/__tests__/playbackBaseline.test.ts`

**Step 1: Write the failing test**

Add `playbackBaseline.test.ts` asserting the app currently depends on screen-local playback behavior and does not expose a shared media-kind-aware controller.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackBaseline.test.ts --runInBand
```

Expected: FAIL because the shared playback contract does not exist yet.

**Step 3: Add the minimal baseline exports**

Introduce a typed shared interface placeholder for active media kind and transport actions without changing runtime behavior yet.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackBaseline.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/App.tsx E:/rtmusicbox/mobile/src/services/playbackService.ts E:/rtmusicbox/mobile/src/screens/RadioScreen.tsx E:/rtmusicbox/mobile/src/screens/PodcastScreen.tsx E:/rtmusicbox/mobile/__tests__/playbackBaseline.test.ts
git commit -m "test: baseline mobile playback domain extraction"
```

### Task 2: Create the Shared Playback Domain

**Files:**
- Create: `E:/rtmusicbox/mobile/src/services/playbackController.ts`
- Create: `E:/rtmusicbox/mobile/src/services/playbackTypes.ts`
- Create: `E:/rtmusicbox/mobile/src/services/playbackStateStore.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/playbackController.test.ts`

**Step 1: Write the failing test**

Add tests for:

- playing a `radio_stream`
- playing a `podcast_episode`
- exposing current media kind
- normalizing `play/pause/resume/stop`

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackController.test.ts --runInBand
```

Expected: FAIL because the controller and store do not exist.

**Step 3: Write minimal implementation**

Create the shared playback controller and state store with just enough logic to satisfy the tests. Keep TrackPlayer wiring shallow and typed.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackController.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/services/playbackController.ts E:/rtmusicbox/mobile/src/services/playbackTypes.ts E:/rtmusicbox/mobile/src/services/playbackStateStore.ts E:/rtmusicbox/mobile/__tests__/playbackController.test.ts
git commit -m "feat: add shared playback controller"
```

### Task 3: Move Radio Playback onto the Shared Controller

**Files:**
- Modify: `E:/rtmusicbox/mobile/src/screens/RadioScreen.tsx`
- Modify: `E:/rtmusicbox/mobile/src/components/MiniPlayer.tsx`
- Modify: `E:/rtmusicbox/mobile/src/data/radioChannels.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/radioPlaybackController.test.ts`

**Step 1: Write the failing test**

Add a test asserting radio playback requests are routed through the shared controller instead of screen-local TrackPlayer calls.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/radioPlaybackController.test.ts --runInBand
```

Expected: FAIL because `RadioScreen` still owns playback orchestration.

**Step 3: Write minimal implementation**

Replace direct TrackPlayer control in `RadioScreen` with controller calls. Keep channel selection UI intact.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/radioPlaybackController.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/screens/RadioScreen.tsx E:/rtmusicbox/mobile/src/components/MiniPlayer.tsx E:/rtmusicbox/mobile/src/data/radioChannels.ts E:/rtmusicbox/mobile/__tests__/radioPlaybackController.test.ts
git commit -m "refactor: route radio playback through shared controller"
```

### Task 4: Make Podcasts Playable Through the Shared Controller

**Files:**
- Modify: `E:/rtmusicbox/mobile/src/screens/PodcastScreen.tsx`
- Modify: `E:/rtmusicbox/mobile/src/services/podcastService.ts`
- Create: `E:/rtmusicbox/mobile/src/services/podcastPlaybackResolver.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/podcastPlaybackResolver.test.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/podcastPlaybackController.test.ts`

**Step 1: Write the failing tests**

Add tests for:

- RSS episodes with `audioUrl` play in-app
- web podcast entries are filtered or resolved before playback
- vehicle-ineligible podcast entries are excluded from the shared playable catalog

**Step 2: Run tests to verify they fail**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/podcastPlaybackResolver.test.ts __tests__/podcastPlaybackController.test.ts --runInBand
```

Expected: FAIL because podcast playback is still URL-opening oriented.

**Step 3: Write minimal implementation**

Create a resolver that yields playable podcast items and switch `PodcastScreen` to shared-controller playback where possible.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/podcastPlaybackResolver.test.ts __tests__/podcastPlaybackController.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/screens/PodcastScreen.tsx E:/rtmusicbox/mobile/src/services/podcastService.ts E:/rtmusicbox/mobile/src/services/podcastPlaybackResolver.ts E:/rtmusicbox/mobile/__tests__/podcastPlaybackResolver.test.ts E:/rtmusicbox/mobile/__tests__/podcastPlaybackController.test.ts
git commit -m "feat: enable shared podcast playback"
```

### Task 5: Normalize Remote Controls and Metadata

**Files:**
- Modify: `E:/rtmusicbox/mobile/App.tsx`
- Modify: `E:/rtmusicbox/mobile/src/services/playbackService.ts`
- Modify: `E:/rtmusicbox/mobile/src/components/MiniPlayer.tsx`
- Test: `E:/rtmusicbox/mobile/__tests__/playbackRemoteControls.test.ts`

**Step 1: Write the failing test**

Add a test for remote play/pause/next/previous commands mapping through the shared controller with media-kind awareness.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackRemoteControls.test.ts --runInBand
```

Expected: FAIL because current remote handlers are transport-only and not media-context-aware.

**Step 3: Write minimal implementation**

Wire `TrackPlayer` event handlers to the shared playback controller and ensure metadata updates follow active radio/podcast state.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackRemoteControls.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/App.tsx E:/rtmusicbox/mobile/src/services/playbackService.ts E:/rtmusicbox/mobile/src/components/MiniPlayer.tsx E:/rtmusicbox/mobile/__tests__/playbackRemoteControls.test.ts
git commit -m "feat: normalize remote controls for shared playback"
```

### Task 6: Build an Android Auto Media Catalog

**Files:**
- Modify: `E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/AutoBrowserService.kt`
- Modify: `E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml`
- Create: `E:/rtmusicbox/mobile/src/services/vehicleCatalog.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts`

**Step 1: Write the failing test**

Add tests for a vehicle catalog that exposes:

- root: `Radyolar`, `Podcastler`
- playable radio items
- playable podcast items only

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleCatalog.test.ts --runInBand
```

Expected: FAIL because the vehicle catalog abstraction does not exist.

**Step 3: Write minimal implementation**

Create `vehicleCatalog.ts` and update `AutoBrowserService.kt` to use real catalog-backed entries instead of hardcoded channels.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleCatalog.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/AutoBrowserService.kt E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml E:/rtmusicbox/mobile/src/services/vehicleCatalog.ts E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts
git commit -m "feat: back android auto with shared media catalog"
```

### Task 7: Add iOS Playback Parity for Lock Screen and Background Audio

**Files:**
- Modify: `E:/rtmusicbox/mobile/ios/Podfile`
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/Info.plist`
- Modify: `E:/rtmusicbox/mobile/App.tsx`
- Modify: `E:/rtmusicbox/mobile/src/services/playbackService.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/iosPlaybackConfig.test.ts`

**Step 1: Write the failing test**

Add a config-level test that checks the iOS playback surface requires background audio and remote control-compatible setup.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/iosPlaybackConfig.test.ts --runInBand
```

Expected: FAIL because iOS-specific playback configuration is incomplete.

**Step 3: Write minimal implementation**

Add the minimum plist and setup changes required for background audio and proper remote playback behavior.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/iosPlaybackConfig.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/ios/Podfile E:/rtmusicbox/mobile/ios/RadioTEDUMobile/Info.plist E:/rtmusicbox/mobile/App.tsx E:/rtmusicbox/mobile/src/services/playbackService.ts E:/rtmusicbox/mobile/__tests__/iosPlaybackConfig.test.ts
git commit -m "feat: add ios playback parity"
```

### Task 8: Prepare CarPlay Media Browsing

**Files:**
- Create: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlayManager.swift`
- Create: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlaySceneDelegate.swift`
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/AppDelegate.swift`
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/Info.plist`
- Test: `E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts`

**Step 1: Write the failing test**

Add a contract test for the CarPlay content tree:

- root contains `Radyolar` and `Podcastler`
- jukebox is absent
- only playable podcast entries are included

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/carPlayCatalogContract.test.ts --runInBand
```

Expected: FAIL because CarPlay content shaping does not exist.

**Step 3: Write minimal implementation**

Add native CarPlay manager/scenedelegate files and bind them to the same shared vehicle catalog contract used by Android Auto.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/carPlayCatalogContract.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlayManager.swift E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlaySceneDelegate.swift E:/rtmusicbox/mobile/ios/RadioTEDUMobile/AppDelegate.swift E:/rtmusicbox/mobile/ios/RadioTEDUMobile/Info.plist E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts
git commit -m "feat: prepare carplay media browsing"
```

### Task 9: Add Companion Wearable State and Transport Contract

**Files:**
- Create: `E:/rtmusicbox/mobile/src/services/companionPlaybackState.ts`
- Create: `E:/rtmusicbox/mobile/src/services/companionCommands.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/companionPlaybackState.test.ts`

**Step 1: Write the failing test**

Add tests for a wearable-safe snapshot containing:

- current title
- current artwork
- media kind
- is playing
- can pause
- can resume
- can advance podcast
- can return to radio

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/companionPlaybackState.test.ts --runInBand
```

Expected: FAIL because the companion contract does not exist.

**Step 3: Write minimal implementation**

Implement the shared companion state and command layer on top of the playback controller.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/companionPlaybackState.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/services/companionPlaybackState.ts E:/rtmusicbox/mobile/src/services/companionCommands.ts E:/rtmusicbox/mobile/__tests__/companionPlaybackState.test.ts
git commit -m "feat: add wearable companion playback contract"
```

### Task 10: Add Platform-Specific Companion Hooks

**Files:**
- Create: `E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/WearCommandBridge.kt`
- Create: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/WatchPlaybackBridge.swift`
- Modify: `E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/Info.plist`
- Test: `E:/rtmusicbox/mobile/__tests__/companionBridgeConfig.test.ts`

**Step 1: Write the failing test**

Add a config-level test asserting both mobile platforms expose a bridge point for companion command/state flow.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/companionBridgeConfig.test.ts --runInBand
```

Expected: FAIL because no platform bridge files exist.

**Step 3: Write minimal implementation**

Create the bridge placeholders and wire minimal manifest/plist registration without attempting full watch app UX in this step.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/companionBridgeConfig.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/WearCommandBridge.kt E:/rtmusicbox/mobile/ios/RadioTEDUMobile/WatchPlaybackBridge.swift E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml E:/rtmusicbox/mobile/ios/RadioTEDUMobile/Info.plist E:/rtmusicbox/mobile/__tests__/companionBridgeConfig.test.ts
git commit -m "feat: add companion platform bridge hooks"
```

### Task 11: Keep Jukebox Phone-Only

**Files:**
- Modify: `E:/rtmusicbox/mobile/src/navigation/RootNavigator.tsx`
- Modify: `E:/rtmusicbox/mobile/src/services/vehicleCatalog.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/vehicleSurfaceScope.test.ts`

**Step 1: Write the failing test**

Add a test that explicitly proves vehicle and companion surfaces only expose radio and podcast content and never jukebox content.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleSurfaceScope.test.ts --runInBand
```

Expected: FAIL because the filtering contract is not yet explicit.

**Step 3: Write minimal implementation**

Make surface scoping explicit in the shared vehicle catalog and navigator-level surface flags.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleSurfaceScope.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/navigation/RootNavigator.tsx E:/rtmusicbox/mobile/src/services/vehicleCatalog.ts E:/rtmusicbox/mobile/__tests__/vehicleSurfaceScope.test.ts
git commit -m "test: lock vehicle and companion surfaces to radio and podcasts"
```

### Task 12: Full Verification and Capability Checklist

**Files:**
- Modify: `E:/rtmusicbox/mobile/README.md`
- Modify: `E:/rtmusicbox/docs/plans/2026-04-10-cross-platform-radio-podcast-design.md`
- Test: `E:/rtmusicbox/mobile/__tests__/config.test.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/jukeboxContract.test.ts`

**Step 1: Run the focused automated suite**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/playbackBaseline.test.ts __tests__/playbackController.test.ts __tests__/radioPlaybackController.test.ts __tests__/podcastPlaybackResolver.test.ts __tests__/podcastPlaybackController.test.ts __tests__/playbackRemoteControls.test.ts __tests__/vehicleCatalog.test.ts __tests__/iosPlaybackConfig.test.ts __tests__/carPlayCatalogContract.test.ts __tests__/companionPlaybackState.test.ts __tests__/companionBridgeConfig.test.ts __tests__/vehicleSurfaceScope.test.ts __tests__/config.test.ts __tests__/jukeboxContract.test.ts --runInBand
```

Expected: PASS

**Step 2: Run typecheck**

Run:

```bash
cd E:/rtmusicbox/mobile
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS

**Step 3: Run Android build smoke**

Run:

```bash
cd E:/rtmusicbox/mobile/android
./gradlew.bat assembleDebug
```

Expected: BUILD SUCCESSFUL

**Step 4: Run iOS dependency smoke**

Run on macOS:

```bash
cd E:/rtmusicbox/mobile/ios
bundle exec pod install
```

Expected: PASS

**Step 5: Document capability blockers**

Update docs with any remaining external blockers:

- CarPlay entitlement
- Apple signing/provisioning
- watchOS and WearOS real-device validation

**Step 6: Commit**

```bash
git add E:/rtmusicbox/mobile/README.md E:/rtmusicbox/docs/plans/2026-04-10-cross-platform-radio-podcast-design.md E:/rtmusicbox/mobile/__tests__/playbackBaseline.test.ts E:/rtmusicbox/mobile/__tests__/playbackController.test.ts E:/rtmusicbox/mobile/__tests__/radioPlaybackController.test.ts E:/rtmusicbox/mobile/__tests__/podcastPlaybackResolver.test.ts E:/rtmusicbox/mobile/__tests__/podcastPlaybackController.test.ts E:/rtmusicbox/mobile/__tests__/playbackRemoteControls.test.ts E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts E:/rtmusicbox/mobile/__tests__/iosPlaybackConfig.test.ts E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts E:/rtmusicbox/mobile/__tests__/companionPlaybackState.test.ts E:/rtmusicbox/mobile/__tests__/companionBridgeConfig.test.ts E:/rtmusicbox/mobile/__tests__/vehicleSurfaceScope.test.ts E:/rtmusicbox/mobile/__tests__/config.test.ts E:/rtmusicbox/mobile/__tests__/jukeboxContract.test.ts
git commit -m "docs: verify cross-platform radio and podcast rollout"
```
