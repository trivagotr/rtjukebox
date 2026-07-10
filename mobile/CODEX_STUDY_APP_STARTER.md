/goal Integrate and verify the new RadioTEDU Study game inside the existing authenticated mobile app. Maintain a live checkbox to-do list. Do not build or present an APK until the website game has been visually approved, and do not report success without desktop, mobile-viewport, WebView, and Android screenshot evidence.

# Codex Starter: RadioTEDU Study Mobile App

Start from this implementation branch:

https://github.com/trivagotr/rtjukebox/tree/codex/study-game-oss

The only canonical room images are:

- `study-game/public/assets/rooms/library.png`
- `study-game/public/assets/rooms/chim-alan.png`

Their hashes and provenance are in `docs/study-game/ASSET-PROVENANCE.md`. Do not substitute the old React Native Study map, `library-habbo.png`, a prototype room, a generated mockup, OpenHabbo/Nitro production art, or any third room design.

Read before editing:

- `docs/superpowers/plans/2026-07-10-study-game-final-open-source-plan.md`
- `study-game/`
- `mobile/src/navigation/RootNavigator.tsx`
- `mobile/src/screens/study/StudyHomeScreen.tsx`
- `mobile/src/screens/study/LibraryStudyWebView.tsx`
- `mobile/src/context/AuthContext.tsx`
- `mobile/src/services/studyService.ts`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/docs/ANDROID_AUTO.md`

## Product Rules

1. The Phaser website game is the Study room experience. Do not rebuild it as React Native blocks or keep the old StudyRoomScreen as the room UI.
2. Package the complete `study-game/dist/` directory into `mobile/android/app/src/main/assets/study-game/` through a deterministic build script.
3. Load `file:///android_asset/study-game/index.html?embedded=mobile` in the Study WebView. Library and Chim Alan remain two rooms inside that one game client.
4. Study is reachable only after the app's normal RadioTEDU authentication. Guests see the existing locked Study entry and are routed to the normal login.
5. Do not create a second login and do not expose the access or refresh token to page JavaScript, localStorage, query strings, logs, or screenshots.
6. Inject only public account presentation needed for immediate rendering: stable public user ID, display name, public avatar appearance, and display-only point balance. Sensitive API calls must go through a narrow native message bridge or the later authenticated server adapter.
7. The website remains functional with `LocalStudyAdapter` for development, but local points are visibly non-authoritative and can never be submitted as rewards.

## WebView Hardening

- Allow only the packaged `file:///android_asset/study-game/` origin and its local subresources.
- Block external navigation, popups, `window.open`, downloads, arbitrary intents, mixed content, third-party cookies, and universal file URL access.
- Reject any navigation that escapes the packaged Study root.
- Keep `allowFileAccessFromFileURLs` and `allowUniversalAccessFromFileURLs` disabled.
- Use a strict message schema and allowlist message types. Validate every field natively before calling an API.
- Never accept a client-provided point amount, price, elapsed duration, owned flag, seat authority, or reward result.
- Handle auth expiry by closing/locking Study and routing to the existing app login; do not render another login inside the WebView.

## Required App Flow

- The existing Study tab remains the entry point.
- Both Library and Chim Alan cards open the same packaged game, with the requested initial room selected.
- The account chip uses the already signed-in RadioTEDU display name.
- Wardrobe equipment persists across room switches and app reloads.
- Room route, transient movement, seat lease, and active study-session state do not survive a stale app restart.
- Back navigation exits the Study game cleanly without opening an external browser.
- Spark appears with the AI-style mark and exact small label `rtAI - AI Host`; Rock remains a world actor.

## Android Auto Boundary

- The Study game, avatar wardrobe, chat, rooms, and point controls must never appear on Android Auto or Automotive surfaces.
- Android Auto remains media-only using the existing radio/podcast browse and playback service.
- Spark/Rock audio may be discoverable only as safe audio content if it already satisfies the media catalog rules; no game UI or interactive chat is projected to the car.
- Preserve the existing automotive manifest/service metadata and tests.

## Verification Order

1. Build and run `study-game` in the browser.
2. Capture desktop and 390x844 evidence for Library idle/walk/sit/wardrobe and Chim idle/stair/sit/Spark.
3. Visually inspect every screenshot; test exit codes alone are insufficient.
4. Obtain explicit website approval before APK work.
5. Run mobile unit tests and lint.
6. Build Study and copy the full dist manifest into Android assets. Compare hashes/file counts.
7. Build and install the debug APK only after approval.
8. Open Study with an already authenticated test account. Confirm there is no second login.
9. Capture ADB screenshots for both rooms, walking, seated, wardrobe, and the signed-in account/points HUD.
10. Restart the app and verify appearance persistence plus stale movement/seat/session cleanup.
11. Run the Android Auto publish/capability audit and prove Study is excluded from car surfaces.

Do not mark the goal complete while any screenshot contains the old Study screen, stretched canvas pixels, hidden character, incorrect sitting depth, missing room art, overlapping HUD, second-login UI, or an external/public Study URL.
