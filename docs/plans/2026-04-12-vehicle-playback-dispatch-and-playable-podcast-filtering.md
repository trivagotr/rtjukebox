# Vehicle Playback Dispatch And Playable Podcast Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Android Auto and CarPlay selections start playback immediately through the shared playback controller, and show podcast content in vehicles only when episodes are directly playable in-app.

**Architecture:** Extend the shared playback domain with a vehicle-facing dispatch layer. Keep the vehicle catalog flat and minimal: `Radyolar` plus `Son Bölümler` when playable podcast episodes exist. Vehicle surfaces never expose jukebox and never render podcast entries that cannot be played directly.

**Tech Stack:** React Native 0.76, TypeScript, react-native-track-player, Android Auto media browser service, CarPlay scaffolding, existing podcast resolver and shared playback controller.

---

### Task 1: Tighten the Vehicle Catalog Contract

**Files:**
- Modify: `E:/rtmusicbox/mobile/src/services/vehicleCatalog.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/vehicleSurfaceScope.test.ts`

**Step 1: Write the failing test**

Add tests that require:

- vehicle root contains `Radyolar`
- vehicle root contains `Son Bölümler` only if playable podcast episodes exist
- vehicle root does not contain a podcast section when no playable episodes exist
- vehicle catalog never exposes jukebox

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleCatalog.test.ts __tests__/vehicleSurfaceScope.test.ts --runInBand
```

Expected: FAIL because the current vehicle catalog still needs explicit playable-podcast filtering behavior.

**Step 3: Write minimal implementation**

Update `vehicleCatalog.ts` so the vehicle-facing catalog is flat, podcast entries are filtered to directly playable episodes only, and the podcast section disappears entirely if empty.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleCatalog.test.ts __tests__/vehicleSurfaceScope.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/services/vehicleCatalog.ts E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts E:/rtmusicbox/mobile/__tests__/vehicleSurfaceScope.test.ts
git commit -m "feat: filter vehicle podcasts to directly playable episodes"
```

### Task 2: Add Shared Vehicle Playback Dispatch

**Files:**
- Create: `E:/rtmusicbox/mobile/src/services/vehiclePlaybackDispatch.ts`
- Modify: `E:/rtmusicbox/mobile/src/services/playbackController.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/vehiclePlaybackDispatch.test.ts`

**Step 1: Write the failing test**

Add tests for a vehicle dispatch layer that:

- starts a radio stream immediately when given a vehicle radio item
- starts a podcast episode immediately when given a playable vehicle podcast item
- rejects non-playable or unsupported vehicle items

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehiclePlaybackDispatch.test.ts --runInBand
```

Expected: FAIL because the vehicle dispatch service does not exist.

**Step 3: Write minimal implementation**

Create `vehiclePlaybackDispatch.ts` as the single translation layer from vehicle selection to shared playback controller calls. Keep it thin and typed.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehiclePlaybackDispatch.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/src/services/vehiclePlaybackDispatch.ts E:/rtmusicbox/mobile/src/services/playbackController.ts E:/rtmusicbox/mobile/__tests__/vehiclePlaybackDispatch.test.ts
git commit -m "feat: add shared vehicle playback dispatch"
```

### Task 3: Wire Android Auto Selection To Real Playback

**Files:**
- Modify: `E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/AutoBrowserService.kt`
- Modify: `E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `E:/rtmusicbox/mobile/android/app/src/main/assets/vehicle_catalog.json`
- Test: `E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts`

**Step 1: Write the failing test**

Add or extend tests so Android Auto catalog items carry enough stable IDs to resolve into the shared vehicle dispatch layer.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleCatalog.test.ts --runInBand
```

Expected: FAIL because the current Android Auto wiring does not fully prove selection-to-playback dispatch.

**Step 3: Write minimal implementation**

Update `AutoBrowserService.kt` and the native asset to use the same vehicle catalog identity model as the JS dispatch layer, so choosing an item can start playback immediately rather than just browse content.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehicleCatalog.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/AutoBrowserService.kt E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml E:/rtmusicbox/mobile/android/app/src/main/assets/vehicle_catalog.json E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts
git commit -m "feat: connect android auto selection to shared dispatch ids"
```

### Task 4: Wire CarPlay Selection To Real Playback

**Files:**
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlayManager.swift`
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlaySceneDelegate.swift`
- Modify: `E:/rtmusicbox/mobile/ios/RadioTEDUMobile/AppDelegate.mm`
- Test: `E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts`

**Step 1: Write the failing test**

Extend the CarPlay contract test so items require stable IDs and dispatchable selection behavior for `Radyolar` and `Son Bölümler`.

**Step 2: Run test to verify it fails**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/carPlayCatalogContract.test.ts --runInBand
```

Expected: FAIL because the current CarPlay scaffold does not fully model playback dispatch.

**Step 3: Write minimal implementation**

Bind CarPlay list item selection to the shared vehicle dispatch identity model so supported items start playback immediately through the phone playback engine.

**Step 4: Run test to verify it passes**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/carPlayCatalogContract.test.ts --runInBand
```

Expected: PASS

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlayManager.swift E:/rtmusicbox/mobile/ios/RadioTEDUMobile/CarPlaySceneDelegate.swift E:/rtmusicbox/mobile/ios/RadioTEDUMobile/AppDelegate.mm E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts
git commit -m "feat: connect carplay selection to shared dispatch ids"
```

### Task 5: Verify End-To-End Vehicle Playback Scope

**Files:**
- Modify: `E:/rtmusicbox/mobile/README.md`
- Modify: `E:/rtmusicbox/docs/plans/2026-04-10-cross-platform-radio-podcast-design.md`
- Test: `E:/rtmusicbox/mobile/__tests__/vehiclePlaybackDispatch.test.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts`
- Test: `E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts`

**Step 1: Run the focused automated suite**

Run:

```bash
cd E:/rtmusicbox/mobile
npx jest __tests__/vehiclePlaybackDispatch.test.ts __tests__/vehicleCatalog.test.ts __tests__/vehicleSurfaceScope.test.ts __tests__/carPlayCatalogContract.test.ts __tests__/companionPlaybackState.test.ts --runInBand
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

**Step 4: Update docs**

Document the final vehicle rules:

- vehicle podcast section is `Son Bölümler`
- only directly playable podcast episodes are shown
- if none exist, podcast is hidden
- vehicle selection should start playback immediately through the phone

**Step 5: Commit**

```bash
git add E:/rtmusicbox/mobile/README.md E:/rtmusicbox/docs/plans/2026-04-10-cross-platform-radio-podcast-design.md E:/rtmusicbox/mobile/__tests__/vehiclePlaybackDispatch.test.ts E:/rtmusicbox/mobile/__tests__/vehicleCatalog.test.ts E:/rtmusicbox/mobile/__tests__/vehicleSurfaceScope.test.ts E:/rtmusicbox/mobile/__tests__/carPlayCatalogContract.test.ts
git commit -m "docs: verify vehicle playback dispatch and podcast filtering"
```
