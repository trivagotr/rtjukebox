# RadioTEDU — Android Auto / Automotive Design Spec

Status: **design / spec** (goal capture). Implementation tracked separately.

The goal: a professional, **safety-first** in-car experience covering four
features — **Canlı Radyo** (live radios), **Podcast'ler**, **Sıralamalar**
(rankings), and **TEDU Ne Çalıyor: Jukebox** — at the quality bar of apps like
BBC Sounds, fully compliant with Google's *Android for Cars App Quality* media
guidelines.

---

## 1. Principles (safety first)

The car is not a phone. Every decision is filtered through driver safety:

1. **Eyes on the road, hands on the wheel.** Everything reachable in ≤2 taps or
   by voice. No reading-heavy screens, no typing, no scrolling marathons.
2. **The platform draws the UI, not us.** We only supply a *content tree* +
   metadata; Android Auto / AAOS renders it with standardized, certified-safe
   templates. We never draw custom car UI.
3. **Restriction-aware.** When the car is **moving**, the system enforces
   `CarUxRestrictions` (limited list lengths, no rich text). We design for the
   restricted state first, and *progressively reveal* more only when parked.
4. **No interaction that doesn't belong in a car.** Voting, registration,
   leaderboards-as-walls-of-text, games — **hidden while driving**.
5. **Voice-first.** "Play RadioTEDU", "play jazz" must always work.

---

## 2. Platform rules we comply with

From *Android for Cars App Quality (Media)*:

- Root browse level: **≤ 4 tabs** (we have exactly 4 — perfect fit).
- Use **content style hints** so the car renders the right layout:
  - `CONTENT_STYLE_BROWSABLE_HINT = GRID` for the 4 top categories (big icons).
  - `CONTENT_STYLE_PLAYABLE_HINT = LIST` for tracks/episodes.
- Browsable vs playable is explicit per node (`FLAG_BROWSABLE` / `FLAG_PLAYABLE`).
- Respect **content limits**: never assume the car shows your whole list — it
  caps visible items while driving (~6). Put the most relevant items first.
- Every item needs a **title** and **square artwork**; subtitle optional.
- Provide a valid **MediaSession** with standard transport actions.
- Support **`onPlayFromSearch`** (voice) and **`onPlayFromMediaId`** (tap).
- No ads, no login walls in the browse tree, no distracting animations.

---

## 3. Information architecture (browse tree)

```
ROOT  (grid of 4 — the only things visible at a glance)
│
├── 📻  Canlı Radyo            (browsable → list, playable leaves)
│     ├── RadioTEDU            ▶ live
│     ├── Classic              ▶ live
│     ├── Jazz                 ▶ live
│     └── Lo-Fi                ▶ live
│
├── 🎙️  Podcast'ler            (browsable → list, playable leaves)
│     ├── <recent episode 1>   ▶
│     ├── <recent episode 2>   ▶
│     └── … (capped; "newest first")
│
├── 🏆  Sıralamalar            (browsable → SHORT, NON-interactive)
│     └── Top 3 only, view-only labels (see §4.3)
│
└── 🎵  TEDU Ne Çalıyor        (browsable → single "now playing" card)
      └── Jukebox: current restaurant track (see §4.4)
```

Depth is **2 levels max**. No node forces scrolling past the car's safe limit.

---

## 4. Per-feature design + safety treatment

### 4.1 Canlı Radyo (Live radios) — *full support, always*
- Grid icon → list of 4 channels, each a single-tap **play**.
- Square per-channel artwork; title = channel, subtitle = description.
- Safe while driving (pure playback). This is the primary car use case.
- Voice: "play <channel>" resolves here.

### 4.2 Podcast'ler — *full support, capped*
- List of **recent episodes, newest first**, each single-tap **play**.
- Cap to a safe number (e.g. 8 parked / system-limited while driving).
- Resumable position is a nice-to-have (parked only).
- No categories/sub-feeds in the car (keeps depth at 2).

### 4.3 Sıralamalar (Rankings) — *reduced & restriction-gated*
Rankings are inherently text-heavy → a driver-distraction risk. So:
- **While driving:** category is **hidden** (or shows a single disabled
  "Park edildiğinde görünür" / "Available when parked" notice — no data).
- **While parked:** show **Top 3 only**, as short non-playable labels
  ("1 · Ayşe · 1240", …). No scrolling list, no profiles, no interaction.
- Never playable; purely informational, minimal.

### 4.4 TEDU Ne Çalıyor: Jukebox — *view-only in car*
The Jukebox is the restaurant's communal, vote-driven queue. **Voting, QR
scanning, and the queue UI are interactive → unsafe while driving → excluded
from the car entirely.** In the car it becomes a *glance*:
- A single node showing **what's playing in the restaurant right now**
  (title + artist + artwork), refreshed periodically.
- If a live audio feed of the restaurant exists, this item is **playable**
  ("listen in"). If not, it is a non-playable now-playing card.
- Optionally one more line: "Sıradaki: <next>" (next up) — parked only.
- No voting, no list of the full queue, no buttons beyond play/stop.

---

## 5. Driving vs parked behavior matrix

| Feature        | Moving (restricted)              | Parked (relaxed)               |
| -------------- | -------------------------------- | ------------------------------ |
| Canlı Radyo    | Full (4 channels, play)          | Full                           |
| Podcast'ler    | System-capped list, play         | Up to ~8 episodes              |
| Sıralamalar    | **Hidden / "parked only" notice**| Top 3, view-only               |
| Jukebox glance | Now-playing only (play if live)  | Now-playing + "next up"        |

Driven by `CarUxRestrictions` / `CarUxRestrictionsManager` listeners.

---

## 6. Visual & content style

- **Square artwork** everywhere (≥512px; 1024 ideal). Channels use brand art;
  podcasts use feed image; Jukebox uses album art of the current song.
- Titles short and scannable; Turkish labels (the app's language).
- Root = **grid** (4 large, instantly distinguishable icons).
- Leaf lists = **list** with artwork thumbnails.
- Consistent RadioTEDU red accent via artwork, not custom chrome.

---

## 7. Voice

- `onPlayFromSearch` is handled **natively** in `RadioTeduCarService`: it matches
  a radio item whose title contains the query (case-insensitive), else the first
  radio station, and plays its embedded `url` on ExoPlayer. (Future: also match
  podcast titles and "TEDU"/"jukebox" → the Jukebox glance.)
- Empty query → play the first / main radio station.

---

## 8. Technical architecture (as shipped)

RNTP v4 ships **no `MediaBrowserService`**, so to deliver the categorized tree
above we add a **custom native `MediaBrowserService`** (`RadioTeduCarService`).

**Chosen design — the car service plays audio NATIVELY and HEADLESSLY with
media3 ExoPlayer.** `RadioTeduCarService` owns a dedicated `MediaSessionCompat`
**and** a media3 `ExoPlayer` instance. The car's transport drives that ExoPlayer
directly; **the React Native JS runtime is not involved in playback at all.**

**Why the relay design was replaced (the cold-start bug).** The previous design
forwarded the car's transport intents to JS (`CarBridge.command(...)` →
`RadioTeduCarCommand` `DeviceEventEmitter` event → `handleCommand` in
`carBridge.ts`), and JS drove RNTP. That JS listener is only registered by
`initCarBridge()`, which runs from `App.tsx`'s `useEffect` — i.e. only **after
the app UI has been opened**. On a **cold start from the car** (app process not
running, UI never shown) the play command was delivered to **no listener**, so
playback never started and the car **showed a loading spinner forever**. Playing
natively removes the JS dependency entirely, so a cold start works.

To make native playback possible with **no JS at play time**, each **playable**
catalog item now **embeds its stream `url`** (set in `carBridge.ts`): radio →
channel stream URL, podcast → `audioUrl`, ranking → main channel URL, jukebox →
`JUKEBOX_STREAM_URL` or main channel URL, recent → its own/looked-up URL.
Non-playable items carry `url: ''`. The service reads this URL straight from the
catalog JSON in `SharedPreferences`.

```
Android Auto / AAOS
        │  browses + transport (Play/Pause/Next/playFromMediaId/search)
        ▼
RadioTeduCarService  (Kotlin, MediaBrowserServiceCompat + own MediaSessionCompat)
        │  onLoadChildren(): builds tree from the catalog (SharedPreferences)
        │  transport → controls media3 ExoPlayer directly (NO JS)
        ▼
   media3 ExoPlayer (headless)
        │  Player.Listener maps state → car PlaybackState:
        │  STATE_BUFFERING / STATE_PLAYING / STATE_PAUSED / STATE_STOPPED,
        │  onPlayerError → STATE_ERROR (+ message)  ← replaces infinite spinner
        ▼
   plays the embedded stream `url` of the tapped item

   catalog JSON  ◄── setCatalog(json) from JS (channels, recent podcasts,
   (SharedPreferences)  rankings top-3, jukebox now-playing) — each playable
                        item embeds its stream `url`. CATALOG ONLY; no transport
                        or now-playing relay to/from JS anymore.
```

Why this design:
- **No JS dependency for playback.** ExoPlayer plays the embedded `url` directly,
  so playback works on a **cold start from the car** even when the RN JS runtime
  never started. This is the core bug fix.
- **Single source of truth for state = the native player.** A `Player.Listener`
  maps ExoPlayer state to the car `PlaybackState`. `onPlayFromMediaId` sets
  metadata + `STATE_BUFFERING` immediately so the car shows **buffering** while
  the stream connects, and `onPlayerError` sets **STATE_ERROR** with a message —
  so a bad stream shows an **error**, never an infinite spinner. JS
  `updateNowPlaying` is now a harmless no-op.
- **Buffering always terminates.** The HTTP data source uses finite connect/read
  timeouts (15 s) and a 20 s **buffering watchdog** forces STATE_ERROR if the
  player is still buffering — so a half-open stream (socket connects, no data)
  can never leave the car on a permanent spinner. Both guards are cancelled once
  playback reaches READY/PLAYING. After `STATE_IDLE` (post-stop/error) `onPlay`
  re-`prepare()`s the loaded item so "Play" resumes instead of silently
  no-opping.
- **Static cold-start fallback.** The JS catalog (in `SharedPreferences`) is
  empty until `pushCarCatalog()` runs once. So a fresh install opened first
  *from the car* would otherwise browse-blank and dead-end voice search. The
  service ships a built-in `radiotedu-main` station (mirroring
  `src/data/radioChannels.ts`): `onLoadChildren` synthesizes a Live Radio
  category + station and `radioItems()`/`findItem` resolve it, so browse, tap,
  and "Play RadioTEDU" all work before the app's first launch.
- **Dynamic data stays in JS** (where the API client + auth live): JS pushes a
  catalog via `setCatalog`; native only reads + renders it (and now reads the
  embedded `url`). No native networking/auth.
- **Audio focus:** ExoPlayer is configured with `AudioAttributes`
  (`USAGE_MEDIA` + `CONTENT_TYPE_MUSIC`) and `setAudioAttributes(attrs,
  handleAudioFocus = true)`, so it ducks/pauses other audio (including the in-app
  RNTP) instead of double-playing.
- **Foreground-service safety (Android 14 / targetSdk 34):** the `mediaPlayback`
  foreground service is started **only when playback is actually active**
  (driven by the `Player.Listener`) and stopped on pause/stop. It is **not**
  started in `onCreate`, which on Android 14 would throw
  `ForegroundServiceStartNotAllowedException`.
- **Restrictions** handled natively via `CarUxRestrictionsManager` deciding
  which categories/items to include per `onLoadChildren` (planned).

Trade-off accepted: two players exist in the app (RNTP, which owns the phone
notification/lock screen for the in-app experience, and the car service's
ExoPlayer, which the car controls). They are **independent** rather than mirrored
— previously kept in sync via the JS relay — and cooperate via Android **audio
focus** (`handleAudioFocus = true`) so only one plays at a time. The car player
is the single source of truth for the **car** session's state.

MediaIds:
| Node             | mediaId                  |
| ---------------- | ------------------------ |
| Category roots   | `cat:radio` etc. (browsable) |
| Channel          | `radiotedu-jazz`         |
| Podcast episode  | `podcast:<id>`           |
| Jukebox glance   | `jukebox:now`            |

Manifest: `RadioTeduCarService` declares the
`android.media.browse.MediaBrowserService` intent-filter (the single browser);
RNTP's `MusicService` keeps only `MEDIA_BUTTON` + `MEDIA_PLAY_FROM_SEARCH` and
its playback session — it is **not** a second browser.

---

## 9. Implementation milestones

1. **Catalog bridge (JS):** write `browse_catalog.json` (channels always;
   podcasts, rankings top-3, jukebox now-playing best-effort) on startup + on
   refresh. Small native module or RNFS-style file write.
2. **Custom browser (native):** `RadioTeduCarService` — root grid, 4
   categories, leaves from the catalog; content-style hints; owns its own
   `MediaSessionCompat`.
3. **Native playback:** the service plays the tapped leaf's embedded stream `url`
   on media3 ExoPlayer, headlessly (no JS). `playFromMediaId`/`search`/skip and
   the buffering/playing/error `PlaybackState` are all native. Buffering always
   resolves (data-source timeouts + watchdog → STATE_ERROR), and a static
   built-in station covers the pre-first-launch empty-catalog case.
4. **Restrictions:** gate Sıralamalar + Jukebox extras on `CarUxRestrictions`.
5. **Voice:** extend `onPlayFromSearch` matching.
6. **Verify on the Automotive OS emulator** (grid, lists, play, restriction
   states, artwork) + DHU on a phone.

## 10. Open questions

- **Jukebox "listen in":** is there a live audio stream of the restaurant feed,
  or is the glance informational only?
- **Rankings while driving:** hide entirely, or show the single "parked only"
  notice? (Spec defaults to the notice.)
- **Podcast resume position** in car: needed, or always start-from-top?
- **Square artwork** for channels (and a Classic asset) — still outstanding.
