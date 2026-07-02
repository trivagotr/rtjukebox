# Android Auto (and CarPlay) — RadioTEDU Mobile

How in-car browsing & playback work in this app, what assets are required, and
how to test it.

## Architecture

Two native pieces cooperate:

1. **`RadioTeduCarService`** (Kotlin, `android/app/.../car/RadioTeduCarService.kt`)
   is the app's single `MediaBrowserService` — the component Android Auto /
   Android Automotive actually connect to and browse. It builds the categorized
   browse tree (Canlı Radyo / Podcast'ler / Sıralamalar / Jukebox), owns its own
   `MediaSessionCompat`, **and plays the radio stream itself, natively and
   headlessly, with media3 ExoPlayer.** The car's transport (Play/Pause/Next/
   tap-to-play/voice) drives this ExoPlayer directly — there is **no dependency
   on the React Native JS runtime** to start or control playback.
2. **`react-native-track-player` v4** (Apache-2.0) plays the **in-app** audio and
   owns the **phone playback notification / lock-screen MediaSession**. RNTP v4
   ships **no** `MediaBrowserService`, which is why browsing is handled by
   `RadioTeduCarService` instead.

### Why native playback (the cold-start fix)

Previously the car relayed every transport intent to JS over the
`RadioTeduCarCommand` `DeviceEventEmitter` event, and JS drove RNTP. But that JS
listener is only registered by `initCarBridge()` (called from `App.tsx`'s
`useEffect`) — i.e. only once the **app UI has been opened**. On a **cold start
from the car** (app not running) the play command went to nobody, so the car
showed a **loading spinner forever and never played**. The fix: the car service
plays the stream itself with ExoPlayer, so no JS runtime is required.

A small in-process **JS bridge** now does **one** thing — supply the catalog:

- `RadioTeduCarBridge` native module (`carBridge.ts` in JS) →
  `CarBridge` singleton → `RadioTeduCarService`.
- **Catalog:** JS calls `setCatalog(json)`; the bridge stores it in
  `SharedPreferences` and the service reads it in `onLoadChildren`. **Every
  PLAYABLE catalog item now embeds a stream `url`** (radio → channel stream URL,
  podcast → `audioUrl`, ranking → main channel URL, jukebox → `JUKEBOX_STREAM_URL`
  or main channel URL, recent → its own/looked-up URL). Non-playable items have
  `url: ''`. This is what lets native playback work with zero JS.
- **First-ever cold start (app never opened):** the catalog in
  `SharedPreferences` is empty until `pushCarCatalog()` has run once. To avoid a
  blank car / dead-ended voice search before first launch, the service falls
  back to a **static built-in `radiotedu-main` station** (mirrors
  `src/data/radioChannels.ts`): `onLoadChildren` synthesizes a single Live Radio
  category + station, and `radioItems()`/`findItem` resolve it, so browse, tap,
  and "Play RadioTEDU" all work even on a never-launched install.
- **Playback state:** the **native ExoPlayer is the single source of truth**. A
  `Player.Listener` maps ExoPlayer state → the car MediaSession `PlaybackState`
  (BUFFERING / PLAYING / PAUSED / STOPPED) and sets **STATE_ERROR** with a
  message on `onPlayerError`, so a failed stream shows a real **error** instead
  of an infinite spinner. `updateNowPlaying` from JS is now a **harmless no-op**
  (kept so older JS can't clobber the native state).
- **Buffering always resolves (no infinite spinner).** Two guards ensure the
  car's "loading" state always becomes PLAYING or ERROR:
  1. the HTTP data source has finite **connect/read timeouts** (15 s), so a
     stream that opens the socket but never delivers data raises
     `onPlayerError` → STATE_ERROR; and
  2. a **buffering watchdog** (20 s) flips the session to STATE_ERROR if the
     player is still buffering, as a backstop for half-open streams the data
     source timeout doesn't catch. The watchdog is cancelled the moment
     playback reaches READY/PLAYING (or errors/stops).
- **Transport:** when the car taps Play/Pause/Next/Stop or a browse item, the
  service controls ExoPlayer directly (no relay to JS). `onPlayFromMediaId` reads
  the item's embedded `url` from the catalog and plays it; "skip next/previous"
  on live radio = cycle to the next/previous **radio station** in the catalog;
  `onPlayFromSearch` matches a radio title (else the first station). Search
  text is normalized for Turkish Gemini / Assistant phrases too, so commands
  such as "Hey Gemini, RadioTEDU çal", "RadioTEDU Rock oynat", "rtedu çal",
  and "Spark çal" score the intended station instead of falling through to the
  generic main-channel match.

Key rule: **there must be exactly one `MediaBrowserService`.** A previous
hand-written `AutoBrowserService.kt` was a second browser with no media session,
so cars showed items that could not play. It was removed; `RadioTeduCarService`
is the only `MediaBrowserService` declared in `AndroidManifest.xml`. RNTP's
`MusicService` is declared too, but only for `MEDIA_BUTTON` /
`MEDIA_PLAY_FROM_SEARCH` and the playback notification — it has **no**
`android.media.browse.MediaBrowserService` intent-filter and is **not** a browser.

```
Android Auto / AAOS
        │ browse + transport (Play/Pause/Next/playFromMediaId/search)
        ▼
RadioTeduCarService  (MediaBrowserServiceCompat + own MediaSessionCompat)
        │  plays the embedded stream url itself:
        ▼
   media3 ExoPlayer  ──► Player.Listener ──► car PlaybackState
   (headless, NO JS)      (buffering / playing / paused / stopped / ERROR)

   ▲  catalog (SharedPreferences), browse-tree refresh only
   │  setCatalog(json)  — each playable item embeds its stream `url`
carBridge.ts (JS) ── catalog only; NO transport/now-playing relay anymore

(separate) playbackQueue.ts / RNTP MusicService  ← the IN-APP player + the
phone playback notification / lock screen. Not used for car playback.
```

The car player and the in-app RNTP player are now **independent**: the car plays
its own ExoPlayer instance from the embedded catalog URLs, while the app UI
(`RadioScreen`, `MiniPlayer`) plays through `playbackQueue`/RNTP. ExoPlayer is
set up with `handleAudioFocus = true`, so the two cooperate over audio focus
(one ducks/pauses the other) instead of fighting.

## Track id convention

| Item    | Track id                | Example              |
| ------- | ----------------------- | -------------------- |
| Channel | the channel id          | `radiotedu-jazz`     |
| Podcast | `podcast:` + episode id | `podcast:1234`       |

When the car selects a playable item, `RadioTeduCarService` looks the mediaId up
in the catalog JSON (categories + recent), reads the item's embedded `url`, sets
the MediaSession metadata + `STATE_BUFFERING`, then plays it on ExoPlayer
(`setMediaItem` → `prepare` → `play`). If the id is missing or has no url, it
sets `STATE_ERROR`. No JS is involved.

## Categorized browse tree (custom native browser)

Because `RadioTeduCarService` is a real `MediaBrowserService` (not the RNTP
queue), the car gets a proper **nested tree** — a root grid of categories
(Canlı Radyo / Podcast'ler / Sıralamalar / Jukebox), each expanding to its
playable leaves. The tree is supplied entirely from JS via `setCatalog(json)`
(stored in `SharedPreferences`), so the API client + auth stay in JS and native
only reads + renders the catalog. Content-style hints request a grid for the
top categories and a list for leaves.

## Artwork assets (action items)

Each channel in `src/data/radioChannels.ts` has an `artwork` field. It currently
points at the real RadioTEDU brand images:

| Channel    | Source image           | Dimensions  | Square? |
| ---------- | ---------------------- | ----------- | ------- |
| RadioTEDU  | `logo-02-scaled.png`   | 2560×1811   | no      |
| Classic    | `logo-02-scaled.png` * | 2560×1811   | no      |
| Jazz       | `tedu_jazz-scaled.png` | 2560×1551   | no      |
| Lo-Fi      | `tedu_lofi-scaled.png` | 2560×1551   | no      |

(hosted under `https://radiotedu.com/wp-content/uploads/2025/07/`)

➡️ **Two follow-ups for a polished car look:**
1. **Square exports** — cars center-crop artwork to a square, which chops these
   landscape logos. Export square versions (≥512×512, ideally 1024×1024) and
   update the `artwork` URLs. The in-app `logo` (banner) can stay landscape.
2. **Classic** (*) has no dedicated image yet — it falls back to the main logo.
   Provide a Classic-specific asset.

Podcasts use their own `imageUrl` from the feed.

## Testing on the Desktop Head Unit (DHU)

### Local Gradle verification

Before DHU or emulator testing, verify the single APK compiles and bundles the
React Native app:

```powershell
cd mobile\android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug
```

RadioTEDU intentionally does not build a separate Automotive APK. The same APK
installed on phones/tablets exposes optional Android Auto / Automotive media
surfaces via `RadioTeduCarService`, matching standard media-app distribution.

If Gradle cannot find the Android SDK, create the ignored local file
`mobile/android/local.properties`:

```properties
sdk.dir=C\:\\Users\\akgul\\AppData\\Local\\Android\\Sdk
```

Metro must watch the repo-level `shared` folder because Study semantic room
modules import shared seat-slot contracts; otherwise the Android bundle fails
while resolving `shared/social/seatSlots`.

Android Auto projection needs a **phone** (not a tablet) with the Android Auto
app. To preview the car UI on your computer:

1. Build & install on a phone: `npm run android`.
2. SDK Manager → SDK Tools → install **Android Auto Desktop Head Unit Emulator**
   (installs to `%ANDROID_HOME%\extras\google\auto\`).
3. On the phone: open Android Auto → tap the version ~10× → Developer settings →
   enable **Add new cars** and **Start head unit server**.
4. On the computer:
   ```bash
   adb forward tcp:5277 tcp:5277
   "%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe"
   ```
5. In the DHU media app picker choose **RadioTEDU**.

No phone? Use the **Android Automotive OS** emulator (SDK Manager →
"Automotive with Play Store" system image) — the same code targets it.

### Google Maps media controls

Google Maps does not need a RadioTEDU-specific Maps SDK integration for audio.
It surfaces compatible media apps through the same Android media stack used by
Assistant and Android Auto: `MediaBrowserServiceCompat`, `MediaSessionCompat`,
media notification controls, and `MEDIA_PLAY_FROM_SEARCH`. Validate this on a
real device by starting navigation in Google Maps, opening the Maps media
controls picker, selecting RadioTEDU, then confirming play/pause and voice
queries such as "Play Radio TEDU", "Radio TEDU çal", "Play latest podcast",
"son podcasti cal", "Spark cal", and "Rock cal".

### Manual checklist

- [ ] App appears in the car media app list with correct name/icon
- [ ] Root shows the category grid; opening a category lists its items with
      square artwork
- [ ] **Cold start (app NOT running): tapping a channel plays it** — the bug fix.
      The car shows brief buffering, then playback; no infinite spinner.
- [ ] Tapping a channel/episode starts playback natively (ExoPlayer)
- [ ] Play / Pause / Stop work from the car (drive ExoPlayer directly)
- [ ] Next / Previous cycle to the next/previous radio station
- [ ] Voice "Play RadioTEDU" / "play jazz" plays the matching station
- [ ] Voice "Hey Gemini, RadioTEDU çal" starts the main station
- [ ] Voice "Hey Gemini, play Spark on RadioTEDU" and "Spark çal" select Spark
- [ ] Voice "Hey Gemini, play RadioTEDU Rock" and "RadioTEDU Rock oynat" select Rock
- [ ] A bad/unreachable stream shows an **error** state (not a dead spinner)
- [ ] A stream that connects but never delivers data resolves to **error**
      within ~15–20 s (data-source timeout + buffering watchdog), not a forever
      spinner
- [ ] Buffering state is shown while the stream connects
- [ ] **First-ever cold start (fresh install, app never opened):** the car shows
      a Live Radio station and "Play RadioTEDU" works (static fallback)
- [ ] After Stop, pressing Play again re-prepares and resumes (not a silent
      no-op)
- [ ] No "stuck on loading": the mediaPlayback foreground service starts only
      once playback is active and stops when paused/stopped

## CarPlay (next phase)

The same `react-native-track-player` session drives CarPlay, but iOS requires:

1. The **CarPlay audio app entitlement** from Apple (request via the developer
   portal — approval gate, not code).
2. `com.apple.developer.carplay-audio` added to the iOS entitlements once granted.
3. Native CarPlay scene wiring in `ios/`.

Planned as a follow-up once the entitlement is granted.
