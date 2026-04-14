# Cross-Platform Radio + Podcast Expansion Design

## Goal

Expand the existing React Native mobile app so RadioTEDU works cleanly across:

- Android phone
- iPhone
- Android Auto
- CarPlay
- companion wearables

The first phase is intentionally narrow:

- `radio` and `podcast` playback are supported on phone and vehicle surfaces
- wearable support is companion control only
- `jukebox`, queue voting, ranking, and search do not appear on vehicle or wearable surfaces

## Current Project Context

The current `mobile/` app already has several useful building blocks:

- iOS project exists under [mobile/ios](E:/rtmusicbox/mobile/ios)
- Android playback already uses `react-native-track-player` in [App.tsx](E:/rtmusicbox/mobile/App.tsx)
- Android Auto support has started through [AndroidManifest.xml](E:/rtmusicbox/mobile/android/app/src/main/AndroidManifest.xml) and [AutoBrowserService.kt](E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/AutoBrowserService.kt)
- radio playback logic is concentrated in [RadioScreen.tsx](E:/rtmusicbox/mobile/src/screens/RadioScreen.tsx)
- podcasts already exist as a phone feature via [PodcastScreen.tsx](E:/rtmusicbox/mobile/src/screens/PodcastScreen.tsx) and [podcastService.ts](E:/rtmusicbox/mobile/src/services/podcastService.ts)

The current problem is architectural: playback behavior is spread across screens and UI components instead of being owned by a platform-neutral playback domain.

## Recommended Architecture

Use `react-native-track-player` as the single playback engine and move radio/podcast playback into a shared playback domain that all surfaces consume.

That shared domain becomes responsible for:

- the active media kind: `radio_stream` or `podcast_episode`
- current track metadata
- transport actions: `play`, `pause`, `resume`, `next`, `previous`, `stop`
- remote-control compatibility
- exposing a catalog for vehicle surfaces
- exposing reduced companion controls for watches

This keeps the implementation DRY and avoids splitting the product into separate Android, iOS, CarPlay, Auto, and wearable playback stacks.

## Scope

### In Scope for Phase 1

- iOS app build parity with Android for radio and podcast playback
- lock screen and remote command support on iOS and Android
- background audio on both phone platforms
- Android Auto media browsing for `Radyolar` and `Podcastler`
- CarPlay media browsing for `Radyolar` and `Podcastler`
- wearable companion control contract for the currently active item

### Out of Scope for Phase 1

- Jukebox in CarPlay
- Jukebox in Android Auto
- Jukebox in watches
- watch-side catalog browsing
- watch-side queue management
- independent watch audio playback
- full vehicle-native redesign beyond media browsing and playback

## Functional Model

### Phone

Phone remains the full surface:

- radio browsing and playback
- podcast browsing and playback
- jukebox remains available in the phone app only

### Vehicle Surfaces

Vehicle surfaces expose only:

- `Radyolar`
- `Son Bölümler`

Behavior:

- selecting a radio starts live stream playback on the phone
- selecting a podcast episode starts podcast playback on the phone immediately
- transport controls stay synced with the phone app
- no jukebox tab, vote UI, ranking UI, or queue controls appear
- if there are no directly playable podcast episodes, podcast is hidden from the vehicle surface entirely

### Wearable Companion

Wearables remain controller-only in phase 1:

- show the currently active item
- play
- pause
- resume
- return to live radio
- advance to next podcast episode when applicable

The wearable does not build its own playback queue and does not fetch catalogs directly in phase 1.

## Playback Domain Design

Create a shared playback layer in `mobile/src/services` or `mobile/src/domain` with these responsibilities:

- normalize radio channel playback into one typed command path
- normalize podcast episode playback into one typed command path
- own TrackPlayer queue hydration and metadata updates
- store current media context in app state
- expose a single contract for UI, lock screen, vehicle surface, and watch companion

Proposed media types:

- `radio_stream`
- `podcast_episode`

Proposed responsibilities split:

- `playback controller`
  - central transport API
- `media catalog provider`
  - radio channels + podcast items for auto/car surfaces
- `playback bridge`
  - platform-specific lock screen, CarPlay, Android Auto, watch integration hooks

## iOS / CarPlay Strategy

### iOS Phone

The phone app should first reach parity:

- app launches and builds cleanly on iOS
- radio playback works
- podcast playback works
- lock screen and Control Center show correct metadata
- remote commands map to the shared playback controller

### CarPlay

CarPlay should be implemented as a media-only surface, not a general app shell.

Phase 1 CarPlay content tree:

- `Radyolar`
- `Son Bölümler` only when directly playable podcast episodes are available

Important constraint:

CarPlay availability depends on Apple capability/provisioning outside the repo. Code can be prepared in-repo, but real device visibility still requires CarPlay entitlement and signing configuration in Apple Developer tooling.

That means the plan must clearly separate:

- code-complete
- capability/provisioning-complete

## Android / Android Auto Strategy

Android already has the start of a media browsing bridge. That should be replaced with real catalog-backed content rather than hardcoded channels.

Phase 1 Android Auto:

- root menu exposes `Radyolar` and `Son Bölümler`
- playable media items resolve back into the shared playback controller
- current playing metadata and state stay in sync with TrackPlayer

Important existing cleanup:

- [AutoBrowserService.kt](E:/rtmusicbox/mobile/android/app/src/main/java/com/com.radiotedumobile/AutoBrowserService.kt) currently uses hardcoded items and includes encoding issues in static strings
- Android manifest service wiring exists but needs to be verified against the final playback contract

## Podcast Strategy

Podcast playback must stop opening external links as the primary path and instead support in-app playback through TrackPlayer whenever an episode audio URL is available.

For phase 1:

- RSS-backed podcast episodes should play directly in-app when `audioUrl` exists
- web-scraped podcast entries should resolve to a playable URL or remain phone-only fallback if no direct media URL exists
- vehicle surfaces should only expose episodes that can actually be played through the shared playback domain
- vehicle surfaces should use a flat `Son Bölümler` list, not show/category drilldown
- if no playable episodes remain after filtering, the podcast section should disappear from vehicle surfaces completely

This keeps CarPlay and Android Auto behavior predictable and avoids dead-end podcast entries in the car.

## Vehicle Playback Expectations

Vehicle surfaces should behave like mainstream audio apps:

- tapping a radio item starts playback immediately
- tapping a playable podcast episode starts playback immediately
- playback still happens on the phone through the shared `TrackPlayer` session
- `play/pause/next/previous` from the vehicle surface must execute directly against the shared playback controller, not just deep-link back into the app

This means the remaining implementation work is not just catalog rendering. The selection-to-playback chain must be fully wired for both Android Auto and CarPlay.

## Wearable Companion Strategy

First-phase wearable support should be state-forwarding and command-forwarding, not a separate product.

The wearable contract needs:

- currently playing title/artwork/type
- is playing / paused
- media kind
- can pause
- can resume
- can go to next podcast episode
- can switch back to radio

The actual platform-specific watch app can be minimal. The important design decision is the shared companion state contract in the phone app.

## Error Handling

The playback domain should distinguish:

- `not_playable`
- `network_error`
- `missing_audio_url`
- `vehicle_surface_unsupported_item`
- `capability_missing`

This matters because “podcast exists in phone UI” is not the same as “podcast is safe to expose in CarPlay or Android Auto”.

## Testing Strategy

### Unit / Integration

- playback controller tests for radio and podcast state transitions
- metadata propagation tests
- vehicle catalog shaping tests
- companion state snapshot tests
- podcast playability filtering tests

### Platform Verification

- Android phone: foreground/background playback
- Android Auto emulator or compatible device: browse and play radio/podcast
- iOS simulator/device: lock screen and remote controls
- CarPlay simulator: browse and play radio/podcast
- wearable companion smoke tests:
  - state sync
  - play/pause
  - resume

### Regression Focus

- mobile jukebox must remain untouched on phone
- existing radio screen behavior must not regress
- podcast feed parsing must not regress
- prod config under `radiotedu.com/jukebox` must remain valid

## Risks and External Dependencies

- CarPlay requires Apple capability/provisioning outside source control
- watchOS and WearOS require extra native project setup and real-device verification
- some podcast entries may not expose direct media URLs, which limits vehicle playback eligibility
- Android Auto service wiring must be kept compatible with the shared playback controller rather than screen-local logic

## Recommended Delivery Slices

1. Shared playback domain extraction for radio + podcast
2. Android Auto + iOS lock screen/background parity
3. CarPlay media browsing
4. Vehicle playback dispatch and playable-podcast filtering
5. Wearable companion state + transport controls

This ordering gives a usable result early and keeps the riskiest platform integrations isolated behind a stable shared playback core.
