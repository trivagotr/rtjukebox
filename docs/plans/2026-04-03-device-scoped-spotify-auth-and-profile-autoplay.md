# Device-Scoped Spotify Auth and Profile Autoplay Balancing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add device-level Spotify authorization, admin-managed Spotify app settings, kiosk-driven device connect flow, and profile-scoped least-played autoplay selection with random tie-breaking.

**Architecture:** Keep Spotify app credentials as one global backend config, but move playback authorization to a `device -> Spotify account` model. Kiosk playback token and Web Playback SDK registration stay device-specific, while autoplay fairness is implemented separately as a profile-scoped stats table used only for Spotify playlist autoplay selection.

**Tech Stack:** Node.js, Express, PostgreSQL, TypeScript, React, plain browser JavaScript, Spotify Web API, Spotify Web Playback SDK, Vitest.

---

### Task 1: Add failing tests for profile least-played autoplay selection

**Files:**
- Modify: `backend/src/services/radioProfiles.test.ts`
- Modify: `backend/src/routes/jukeboxAutomation.test.ts`
- Modify: `backend/src/services/radioProfiles.ts`

**Step 1: Write the failing test**

Add tests that prove:
- autoplay prefers the candidate with the lowest profile `play_count`
- missing stats rows behave like `play_count = 0`
- when multiple candidates share the same minimum `play_count`, selection uses random only within that tied minimum set

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/radioProfiles.test.ts src/routes/jukeboxAutomation.test.ts`

Expected: FAIL because autoplay selection currently calls random across all filtered tracks.

**Step 3: Write minimal implementation**

Update `backend/src/services/radioProfiles.ts`:
- add a typed autoplay stats shape with `spotify_uri`, `play_count`, and `last_played_at`
- replace `buildAutoplaySelection(...)` random-only logic with least-played selection
- keep random as the tie-breaker only among tracks at the minimum count

Update any affected helpers in `backend/src/routes/jukebox.ts` only if the service signature changes.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/radioProfiles.test.ts src/routes/jukeboxAutomation.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/radioProfiles.ts backend/src/services/radioProfiles.test.ts backend/src/routes/jukeboxAutomation.test.ts
git commit -m "feat: balance autoplay by least-played profile tracks"
```

### Task 2: Add schema and helpers for profile autoplay stats

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/migrate.js`
- Modify: `backend/src/routes/jukeboxAutomation.test.ts`
- Modify: `backend/src/routes/jukebox.ts`

**Step 1: Write the failing test**

Add tests that prove:
- autoplay stats rows are read by profile id and `spotify_uri`
- playback start for an autoplay Spotify item increments `play_count`
- non-autoplay items do not mutate profile autoplay stats

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/jukeboxAutomation.test.ts`

Expected: FAIL because there is no profile autoplay stats table or playback-start update path.

**Step 3: Write minimal implementation**

Update `backend/src/db/schema.sql` and `backend/src/db/migrate.js` to add:
- `radio_profile_playlist_stats`
- unique key on `(radio_profile_id, spotify_uri)`

Update `backend/src/routes/jukebox.ts` to:
- load profile autoplay stats for playlist candidates
- increment `play_count` and `last_played_at` only when an autoplay Spotify item actually starts

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/jukeboxAutomation.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.js backend/src/routes/jukebox.ts backend/src/routes/jukeboxAutomation.test.ts
git commit -m "feat: persist profile autoplay playlist stats"
```

### Task 3: Add failing tests for global Spotify app config

**Files:**
- Create: `backend/src/routes/spotifyAppConfig.test.ts`
- Modify: `backend/src/services/spotify.ts`
- Modify: `backend/src/routes/spotify.ts`
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/migrate.js`

**Step 1: Write the failing test**

Create tests that prove:
- backend resolves Spotify app credentials from DB config before env fallback
- admin config response masks the secret
- updating config can replace `client_id` and `client_secret`
- redirect URI is returned as effective readonly metadata

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/spotifyAppConfig.test.ts src/services/spotify.test.ts`

Expected: FAIL because Spotify config is env-only and no app-config route exists.

**Step 3: Write minimal implementation**

Add a single-row config table in `backend/src/db/schema.sql`, for example `spotify_app_config`.

Update `backend/src/services/spotify.ts` so credential resolution:
- checks DB config first
- falls back to env values if DB config is missing

Add backend route helpers in `backend/src/routes/spotify.ts` for:
- `GET /api/v1/spotify/app-config`
- `PUT /api/v1/spotify/app-config`

Ensure the secret is never returned raw after save.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/spotifyAppConfig.test.ts src/services/spotify.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.js backend/src/services/spotify.ts backend/src/routes/spotify.ts backend/src/routes/spotifyAppConfig.test.ts
git commit -m "feat: add admin-managed spotify app config"
```

### Task 4: Add failing tests for device-scoped Spotify auth storage and OAuth flow

**Files:**
- Create: `backend/src/routes/deviceSpotifyAuth.test.ts`
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/migrate.js`
- Modify: `backend/src/routes/spotify.ts`
- Modify: `backend/src/services/spotify.ts`

**Step 1: Write the failing test**

Add tests that prove:
- device-specific auth start endpoint requires a valid device
- OAuth callback binds the returned Spotify account to the correct `device_id`
- status endpoint returns connected account metadata
- delete endpoint disconnects the device auth
- kiosk token resolution uses the device auth row, not a single global auth row

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/deviceSpotifyAuth.test.ts src/routes/jukeboxSpotifyKiosk.test.ts src/services/spotify.test.ts`

Expected: FAIL because no device auth table or device-specific OAuth route exists.

**Step 3: Write minimal implementation**

Add a new device auth table in schema and migration.

Extend `backend/src/routes/spotify.ts` with device OAuth endpoints:
- `GET /api/v1/spotify/device-auth/start`
- `GET /api/v1/spotify/device-auth/callback`
- `GET /api/v1/spotify/device-auth/status`
- `DELETE /api/v1/spotify/device-auth/:deviceId`

Use OAuth `state` to carry validated `device_id` context.

Update `backend/src/services/spotify.ts` with helpers to:
- save device-scoped tokens
- refresh device-scoped tokens
- return device-scoped playback tokens

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/deviceSpotifyAuth.test.ts src/routes/jukeboxSpotifyKiosk.test.ts src/services/spotify.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.js backend/src/routes/spotify.ts backend/src/services/spotify.ts backend/src/routes/deviceSpotifyAuth.test.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts
git commit -m "feat: add device-scoped spotify authorization"
```

### Task 5: Switch kiosk playback token flow to device-scoped Spotify auth

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`
- Modify: `kiosk-web/app.js`
- Modify: `kiosk-web/playback.test.js`

**Step 1: Write the failing test**

Add tests that prove:
- kiosk token endpoint fails cleanly when the current device has no Spotify auth
- kiosk token endpoint returns the current device-scoped token when connected
- kiosk startup can recognize a device-auth-required state without breaking local playback

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts E:\\rtmusicbox\\kiosk-web\\playback.test.js`

Expected: FAIL because the kiosk token flow still assumes a global Spotify auth row.

**Step 3: Write minimal implementation**

Update `backend/src/routes/jukebox.ts` so the kiosk Spotify token endpoint resolves auth by `device_id`.

Update `kiosk-web/app.js` so kiosk startup:
- detects missing device Spotify auth
- stores a recoverable setup state
- does not crash local-only playback paths

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts E:\\rtmusicbox\\kiosk-web\\playback.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts kiosk-web/app.js kiosk-web/playback.test.js
git commit -m "feat: use device spotify auth for kiosk playback tokens"
```

### Task 6: Add admin UI for Spotify app settings and per-device Spotify controls

**Files:**
- Modify: `jukebox-web-controller/src/AdminDashboard.tsx`
- Modify: `jukebox-web-controller/src/App.tsx`
- Create: `jukebox-web-controller/src/adminSpotifyConfig.ts`
- Create: `jukebox-web-controller/src/adminSpotifyConfig.test.ts`

**Step 1: Write the failing test**

Add UI/helper tests that prove:
- Spotify app config payloads mask secrets in read mode
- device rows can surface connected/disconnected Spotify status
- connect/reconnect/disconnect actions build the correct API requests

**Step 2: Run test to verify it fails**

Run: `cd jukebox-web-controller && npm test -- adminSpotifyConfig`

Expected: FAIL because there is no dedicated admin Spotify config helper/UI yet.

**Step 3: Write minimal implementation**

Update `AdminDashboard.tsx` to add:
- a Spotify app config card for global app credentials
- per-device Spotify connection status/actions
- connect/reconnect flows that open the backend device-auth URL for the target device

Keep the secret masked after save.

**Step 4: Run test to verify it passes**

Run: `cd jukebox-web-controller && npm test -- adminSpotifyConfig`

Expected: PASS

**Step 5: Commit**

```bash
git add jukebox-web-controller/src/AdminDashboard.tsx jukebox-web-controller/src/App.tsx jukebox-web-controller/src/adminSpotifyConfig.ts jukebox-web-controller/src/adminSpotifyConfig.test.ts
git commit -m "feat: add admin spotify app and device controls"
```

### Task 7: Add kiosk-first Spotify connect UX

**Files:**
- Modify: `kiosk-web/index.html`
- Modify: `kiosk-web/style.css`
- Modify: `kiosk-web/app.js`
- Create: `kiosk-web/device-spotify-auth.js`
- Create: `kiosk-web/device-spotify-auth.test.js`

**Step 1: Write the failing test**

Add tests that prove:
- kiosk shows a Spotify connect setup state when current device auth is missing
- kiosk can open the device-specific Spotify authorize URL
- kiosk exits the setup state after successful reconnect/status refresh

**Step 2: Run test to verify it fails**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\device-spotify-auth.test.js E:\\rtmusicbox\\kiosk-web\\playback.test.js`

Expected: FAIL because kiosk has no dedicated device Spotify connect UX.

**Step 3: Write minimal implementation**

Add a small kiosk helper and wire it into startup:
- query device Spotify auth status
- if missing, show a blocking connect prompt
- open device-specific authorize URL
- resume initialization after auth is completed

Keep existing local playback setup intact when Spotify is not required.

**Step 4: Run test to verify it passes**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\device-spotify-auth.test.js E:\\rtmusicbox\\kiosk-web\\playback.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add kiosk-web/index.html kiosk-web/style.css kiosk-web/app.js kiosk-web/device-spotify-auth.js kiosk-web/device-spotify-auth.test.js
git commit -m "feat: add kiosk spotify device connect flow"
```

### Task 8: Run end-to-end verification

**Files:**
- Modify only if verification exposes defects

**Step 1: Run backend verification**

Run: `cd backend && npx vitest run`

Expected: PASS

**Step 2: Run kiosk verification**

Run: `E:\\rtmusicbox\\backend\\node_modules\\.bin\\vitest.cmd run E:\\rtmusicbox\\kiosk-web\\branding.test.js E:\\rtmusicbox\\kiosk-web\\device-spotify-auth.test.js E:\\rtmusicbox\\kiosk-web\\playback.test.js E:\\rtmusicbox\\kiosk-web\\spotify-player.test.js`

Expected: PASS

**Step 3: Run frontend verification**

Run: `cd jukebox-web-controller && npm run build`

Expected: PASS

**Step 4: Run backend build and migrate verification**

Run: `cd backend && npm run build && npm run db:migrate`

Expected: PASS

**Step 5: Manual smoke**

Verify:
- admin can save Spotify app config
- device detail shows Spotify connect status
- kiosk can authorize a Spotify account for its own device
- two different devices authorized with different Spotify accounts can both play independently
- autoplay in the same `radio_profile` prefers least-played tracks and randomizes only ties

**Step 6: Commit final fixes if needed**

```bash
git add .
git commit -m "feat: add device spotify auth and balanced profile autoplay"
```
