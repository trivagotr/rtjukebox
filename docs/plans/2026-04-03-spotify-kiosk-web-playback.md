# Spotify Kiosk Web Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Spotify tracks actually play inside the kiosk browser by wiring Spotify Web Playback SDK into `kiosk-web` and registering each kiosk browser as a Spotify Connect playback device.

**Architecture:** Keep the existing hybrid queue and local `<audio>` path, but add a parallel Spotify playback path. The backend will expose a kiosk-safe playback token endpoint and persist the current kiosk browser's Spotify device registration on the `devices` row; when the queue head is a Spotify item, the backend will transfer playback to that browser device and start the requested track. The kiosk will report SDK state changes back to the backend so track end and skip stay in sync with the existing queue system.

**Tech Stack:** Node.js, Express, PostgreSQL, Spotify Web API, Spotify Web Playback SDK, plain browser JavaScript in `kiosk-web`, Vitest, TypeScript.

---

### Task 1: Add Backend Contract for Kiosk Spotify Device Registration

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/routes/jukebox.ts`
- Test: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`

**Step 1: Write the failing test**

Create `backend/src/routes/jukeboxSpotifyKiosk.test.ts` with a focused helper-level test that expects:
- a kiosk Spotify registration payload with `device_id`, `spotify_device_id`, and `player_name`
- a response helper payload that marks the device online and stores the Spotify browser device id
- a read helper that prefers the registered Spotify playback device id over `null`

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts`

Expected: FAIL because no registration helpers or device columns exist yet.

**Step 3: Write minimal implementation**

Update `backend/src/db/schema.sql` to add these additive `devices` columns:
- `spotify_playback_device_id`
- `spotify_player_name`
- `spotify_player_connected_at`
- `spotify_player_is_active`

In `backend/src/routes/jukebox.ts`:
- add small exported helpers for normalizing kiosk Spotify registration payloads
- add small exported helpers for building the stored device playback target

Do not add the HTTP route yet in this task; keep the change minimal and testable.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/routes/jukebox.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts
git commit -m "feat: add kiosk spotify device registration contract"
```

### Task 2: Expose Kiosk Spotify Token and Registration Endpoints

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/spotify.ts`
- Test: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`
- Test: `backend/src/services/spotify.test.ts`

**Step 1: Write the failing test**

Extend the tests to prove:
- the kiosk token endpoint returns a short-lived playback token only when Spotify auth exists
- the kiosk registration endpoint stores `spotify_playback_device_id` and player metadata
- the registration endpoint rejects missing `spotify_device_id`
- the Spotify service can return the active playback token without mutating refresh state unnecessarily

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts src/services/spotify.test.ts`

Expected: FAIL because the new routes/service helpers do not exist yet.

**Step 3: Write minimal implementation**

In `backend/src/services/spotify.ts`:
- add a minimal method for kiosk playback token retrieval that reuses the stored user access token
- add a minimal method that returns the current auth row scopes/status needed by kiosk playback

In `backend/src/routes/jukebox.ts` add:
- `GET /api/v1/jukebox/kiosk/spotify-token?device_id=...`
- `POST /api/v1/jukebox/kiosk/spotify-device`

Behavior:
- token endpoint validates kiosk device id exists and returns `{ access_token, expires_at, scopes }`
- registration endpoint validates the kiosk device id, stores the browser `spotify_playback_device_id`, updates connected timestamps/flags, and returns the effective playback target

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts src/services/spotify.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/spotify.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts backend/src/services/spotify.test.ts
git commit -m "feat: add kiosk spotify playback auth endpoints"
```

### Task 3: Dispatch Spotify Queue Items to the Registered Browser Device

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/spotify.ts`
- Test: `backend/src/routes/jukeboxPlaybackDispatch.test.ts`
- Test: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- when a queue item is `source_type='spotify'`, backend dispatch picks `spotify_playback_device_id`
- dispatch first transfers playback to that device and then starts the requested track URI
- dispatch fails cleanly when no kiosk Spotify device is registered
- dispatch does not run for local items

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/jukeboxPlaybackDispatch.test.ts src/routes/jukeboxSpotifyKiosk.test.ts`

Expected: FAIL because the backend still has no Spotify dispatch orchestration for kiosk playback.

**Step 3: Write minimal implementation**

In `backend/src/services/spotify.ts`:
- add `transferPlayback(deviceId, play?)`
- add a small orchestration helper if needed to `transferPlayback(..., true)` before `playTrack(...)`

In `backend/src/routes/jukebox.ts`:
- add exported helper(s) that resolve the active playback target from device + song metadata
- wire Spotify dispatch into the kiosk play handoff so Spotify items do not fall through the local `<audio>` path
- keep local items unchanged

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/jukeboxPlaybackDispatch.test.ts src/routes/jukeboxSpotifyKiosk.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/spotify.ts backend/src/routes/jukeboxPlaybackDispatch.test.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts
git commit -m "feat: dispatch spotify queue items to kiosk browser player"
```

### Task 4: Add Kiosk Spotify Player Lifecycle Helpers

**Files:**
- Create: `kiosk-web/spotify-player.js`
- Modify: `kiosk-web/index.html`
- Test: `kiosk-web/spotify-player.test.js`

**Step 1: Write the failing test**

Create `kiosk-web/spotify-player.test.js` with plain helper-level tests that prove:
- SDK loader resolves only once
- player config requests tokens from backend with the kiosk `device_id`
- `ready` registration payload includes `spotify_device_id` and player name
- `player_state_changed` maps ended/paused/playing state into a small normalized kiosk event payload

**Step 2: Run test to verify it fails**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\spotify-player.test.js`

Expected: FAIL because no Spotify kiosk helper exists yet.

**Step 3: Write minimal implementation**

Create `kiosk-web/spotify-player.js` that exposes `window.KioskSpotifyPlayer` with focused helpers:
- `loadSpotifySdk`
- `createSpotifyPlayer`
- `buildSpotifyRegistrationPayload`
- `mapSpotifyPlayerState`

Update `kiosk-web/index.html` to load the new helper before `app.js`.

Do not wire it into `app.js` yet in this task.

**Step 4: Run test to verify it passes**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\spotify-player.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add kiosk-web/index.html kiosk-web/spotify-player.js kiosk-web/spotify-player.test.js
git commit -m "feat: add kiosk spotify sdk helper"
```

### Task 5: Integrate Spotify Web Playback SDK into the Kiosk Runtime

**Files:**
- Modify: `kiosk-web/app.js`
- Modify: `kiosk-web/playback.js`
- Test: `kiosk-web/playback.test.js`
- Test: `kiosk-web/spotify-player.test.js`
- Test: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`

**Step 1: Write the failing test**

Extend kiosk tests so they prove:
- startup interaction activates the Spotify player element before playback transfer
- a Spotify queue item no longer goes through `skipUnsupportedSong`
- Spotify state end maps back to the existing `now-playing` completion flow
- local items still use the old `<audio>` path

**Step 2: Run test to verify it fails**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\playback.test.js E:\\rtmusicbox\\kiosk-web\\spotify-player.test.js`

Expected: FAIL because `app.js` still treats Spotify items as unsupported.

**Step 3: Write minimal implementation**

Update `kiosk-web/app.js` to:
- initialize the Spotify SDK after device registration
- fetch kiosk playback tokens from backend on demand
- register `ready`, `not_ready`, `player_state_changed`, `autoplay_failed`, and error listeners
- call `player.activateElement()` from the startup click path
- on Spotify queue items, notify backend to dispatch browser playback instead of assigning `audioPlayer.src`
- on SDK end-of-track, call the existing `/api/v1/jukebox/kiosk/now-playing` completion path
- keep local playback behavior unchanged

Update `kiosk-web/playback.js` only as needed so the playback plan clearly distinguishes `spotify` vs `local` runtime branches.

**Step 4: Run test to verify it passes**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\playback.test.js E:\\rtmusicbox\\kiosk-web\\spotify-player.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add kiosk-web/app.js kiosk-web/playback.js kiosk-web/playback.test.js kiosk-web/spotify-player.test.js backend/src/routes/jukeboxSpotifyKiosk.test.ts
git commit -m "feat: enable spotify playback in kiosk browser"
```

### Task 6: Verify End-to-End Hybrid Playback

**Files:**
- Modify: `backend/src/routes/jukebox.ts` if final cleanup is needed
- Modify: `kiosk-web/app.js` if final cleanup is needed

**Step 1: Run focused backend verification**

Run:
- `cd backend && npx vitest run src/routes/jukeboxPlaybackDispatch.test.ts src/routes/jukeboxSpotifyKiosk.test.ts src/services/spotify.test.ts`
- `cd backend && npm run build`

Expected: PASS

**Step 2: Run focused kiosk verification**

Run:
- `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\playback.test.js E:\\rtmusicbox\\kiosk-web\\spotify-player.test.js`
- `node --check E:\\rtmusicbox\\kiosk-web\\app.js`
- `node --check E:\\rtmusicbox\\kiosk-web\\spotify-player.js`

Expected: PASS

**Step 3: Run live smoke**

Run:
- start backend and kiosk
- register kiosk device
- authorize Spotify if needed
- enqueue one local song and one Spotify song
- confirm:
  - local song still plays through `<audio>`
  - Spotify song causes the browser device to appear in Spotify Connect
  - backend dispatch transfers playback and the song plays in-browser
  - track end advances queue without manual refresh

**Step 4: Commit final cleanup if needed**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/spotify.ts kiosk-web/app.js kiosk-web/spotify-player.js
git commit -m "chore: finalize spotify kiosk playback verification"
```
