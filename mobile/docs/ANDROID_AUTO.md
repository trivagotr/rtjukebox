# Android Auto (and CarPlay) — RadioTEDU Mobile

How in-car browsing & playback work in this app, what assets are required, and
how to test it.

## Architecture

Two native pieces cooperate:

1. **`RadioTeduCarService`** (Kotlin, `android/app/.../car/RadioTeduCarService.kt`)
   is the app's single `MediaBrowserService` — the component Android Auto /
   Android Automotive actually connect to and browse. It builds the categorized
   browse tree (Canlı Radyo / Podcast'ler / Sıralamalar / Jukebox) and owns its
   own `MediaSessionCompat` that the car uses for transport and now-playing.
2. **`react-native-track-player` v4** (Apache-2.0) plays the actual audio and
   owns the **playback notification / lock-screen MediaSession**. RNTP v4 ships
   **no** `MediaBrowserService`, which is why browsing is handled by
   `RadioTeduCarService` instead.

A small in-process **JS bridge** connects the two:

- `RadioTeduCarBridge` native module (`carBridge.ts` in JS) →
  `CarBridge` singleton → `RadioTeduCarService`.
- **Catalog:** JS calls `setCatalog(json)`; the bridge stores it in
  `SharedPreferences` and the service reads it in `onLoadChildren`.
- **Now playing:** JS calls `updateNowPlaying(title, artist, artwork, isPlaying)`;
  the service sets its MediaSession metadata + PlaybackState to that **actual**
  state. This is the **single authority** for the car's playback state — the
  service never sets state optimistically.
- **Transport:** when the car taps Play/Pause/Next/etc. or a browse item, the
  service relays it to JS via the `RadioTeduCarCommand` DeviceEventEmitter event;
  JS drives `playbackQueue` (RNTP) and reports the resulting state back through
  `updateNowPlaying`.

Key rule: **there must be exactly one `MediaBrowserService`.** A previous
hand-written `AutoBrowserService.kt` was a second browser with no media session,
so cars showed items that could not play. It was removed; `RadioTeduCarService`
is the only `MediaBrowserService` declared in `AndroidManifest.xml`. RNTP's
`MusicService` is declared too, but only for `MEDIA_BUTTON` /
`MEDIA_PLAY_FROM_SEARCH` and the playback notification — it has **no**
`android.media.browse.MediaBrowserService` intent-filter and is **not** a browser.

```
Android Auto / AAOS
        │ browse + transport
        ▼
RadioTeduCarService  (MediaBrowserServiceCompat + own MediaSessionCompat)
   ▲  catalog (SharedPreferences) / updateNowPlaying      │ RadioTeduCarCommand event
   │                                                      ▼
carBridge.ts (JS)  ───────────────────────────────►  playbackQueue.ts / RNTP
   ▲                                                      │ plays audio,
   │  setCatalog / updateNowPlaying                       │ owns playback notification
   └──────────────────────────────────────────────────  RNTP MusicService

playbackQueue.ts  ← single source of truth for the queue
  buildChannelTrack / buildPodcastTrack / ensureBrowsableQueue /
  playChannelById / playTrackById / replaceChannelTrack / findChannelByQuery
```

The in-app UI (`RadioScreen`, `MiniPlayer`) plays through the **same**
`playbackQueue` helpers, so switching channels in the app never desyncs the
catalog or now-playing state the car is showing.

## Track id convention

| Item    | Track id                | Example              |
| ------- | ----------------------- | -------------------- |
| Channel | the channel id          | `radiotedu-jazz`     |
| Podcast | `podcast:` + episode id | `podcast:1234`       |

When the car selects a playable item, `RadioTeduCarService` relays a `playId`
command (with the mediaId) to JS via the `RadioTeduCarCommand` event; JS looks
the id up in the queue and plays it.

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

### Manual checklist

- [ ] App appears in the car media app list with correct name/icon
- [ ] Root shows the category grid; opening a category lists its items with
      square artwork
- [ ] Tapping a channel/episode starts playback (`playId` → JS)
- [ ] Play / Pause / Next / Previous work from the car (relayed to JS)
- [ ] Voice "Play RadioTEDU" / "play jazz" works (`search` → JS)
- [ ] Metadata + play/pause state on the car now-playing screen match the app
      (driven by `updateNowPlaying`)
- [ ] No "stuck on loading": the mediaPlayback foreground service starts only
      once playback is active and stops when paused/stopped

## CarPlay (next phase)

The same `react-native-track-player` session drives CarPlay, but iOS requires:

1. The **CarPlay audio app entitlement** from Apple (request via the developer
   portal — approval gate, not code).
2. `com.apple.developer.carplay-audio` added to the iOS entitlements once granted.
3. Native CarPlay scene wiring in `ios/`.

Planned as a follow-up once the entitlement is granted.
