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

- `onPlayFromSearch` already wired in JS (`findChannelByQuery`). Extend to also
  match podcast titles and "TEDU"/"jukebox" → the Jukebox glance.
- Empty query → resume / play main channel.

---

## 8. Technical architecture (as shipped)

RNTP v4 ships **no `MediaBrowserService`**, so to deliver the categorized tree
above we add a **custom native `MediaBrowserService`** (`RadioTeduCarService`).

**Chosen design — the car service keeps its OWN `MediaSession`.** Rather than
forwarding RNTP's session token, `RadioTeduCarService` owns a dedicated
`MediaSessionCompat` and acts as a *relay*: it forwards the car's transport
intents to JS (which drives RNTP), and JS reports the resulting **actual**
playback state back into this session. This was chosen over token-forwarding
because the JS bridge (`carBridge.ts`) is already the integration point for the
catalog and now-playing data, so a single in-process bridge cleanly handles both
browsing and transport, and the service does not need a handle to RNTP's
internal session.

```
Android Auto / AAOS
        │  browses + transport (Play/Pause/Next/playFromMediaId/search)
        ▼
RadioTeduCarService  (Kotlin, MediaBrowserServiceCompat + own MediaSessionCompat)
        │  onLoadChildren(): builds tree from the catalog (SharedPreferences)
        │
        │  transport → CarBridge.command(...) ─► RadioTeduCarCommand event ─► JS
        │                                                          │
        ▲  updateNowPlaying(title,artist,artwork,isPlaying)        ▼
        │  ◄──────────────────────────────────────────  playbackQueue / RNTP
        │     (sets THIS session's metadata + PlaybackState         (plays audio,
        │      to the actual JS state — single authority)            owns playback
        │                                                            notification)
   catalog JSON  ◄── setCatalog(json) from JS (channels, recent podcasts,
   (SharedPreferences) rankings top-3, jukebox now-playing)
```

Why this design:
- **Single source of truth for state.** `updateNowPlaying` is the *only* place
  the car session's `PlaybackState`/metadata is set. The `SessionCallback` never
  sets `STATE_PLAYING`/`STATE_PAUSED` optimistically — it only relays the intent
  to JS — so the car never desyncs from RNTP if a command is overridden/fails.
- **Tap-to-play reuses the existing JS path:** a playable leaf → `playId`
  command → JS `playbackQueue` plays it. No duplicate player.
- **Dynamic data stays in JS** (where the API client + auth live): JS pushes a
  catalog via `setCatalog`; native only reads + renders it. No native
  networking/auth.
- **Foreground-service safety (Android 14 / targetSdk 34):** the `mediaPlayback`
  foreground service is started **only when playback is actually active**
  (`updateNowPlaying` reports `isPlaying = true`) and stopped on pause/stop. It
  is **not** started in `onCreate`, which on Android 14 would throw
  `ForegroundServiceStartNotAllowedException` (the "car stuck on loading" bug).
- **Restrictions** handled natively via `CarUxRestrictionsManager` deciding
  which categories/items to include per `onLoadChildren` (planned).

Trade-off accepted: two `MediaSession`s exist in the app (RNTP's, which owns the
phone notification/lock screen, and the car service's, which the car controls).
They are kept consistent because JS is the single driver of both — every car
command goes through JS to RNTP, and RNTP's state is mirrored back into the car
session via `updateNowPlaying`.

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
2. **Custom browser (native):** `RadioTeduCarBrowserService` — root grid, 4
   categories, leaves from the catalog; content-style hints; forwards RNTP
   session token.
3. **Playback bridge:** ensure selecting any leaf reaches `RemotePlayId`
   (extend `playbackQueue` for `jukebox:now`).
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
