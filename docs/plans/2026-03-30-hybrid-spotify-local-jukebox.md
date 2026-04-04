# Hybrid Spotify + Local Jukebox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the in-progress Spotify cutover work into a hybrid Spotify + local jukebox that supports public local songs, hidden local jingles/ads, radio profiles, per-device overrides, and Spotify playlist autoplay on a single queue.

**Architecture:** Keep one `songs` catalog and one `queue_items` execution queue, but make every song explicit about `source_type`, `visibility`, and `asset_role`. Add reusable `radio_profiles` plus per-device override resolution, then drive queue insertion and playback dispatch from that effective configuration.

**Tech Stack:** Node.js, Express, PostgreSQL, existing Spotify Web API integration, existing local file playback path, Vitest, TypeScript.

---

### Task 1: Reconcile the Songs Schema to the Hybrid Model

**Files:**
- Modify: `backend/src/db/schema.sql`
- Test: `backend/src/utils/textNormalization.test.ts` or a new focused schema/contract test file if needed later

**Step 1: Write the failing test**

Write a focused contract-style test that asserts the hybrid song model expects:
- `source_type`
- `visibility`
- `asset_role`
- both Spotify and local columns coexisting

If no schema test harness exists, write a narrow helper-level test against a new exported constant describing supported song source/visibility/role enums in backend code.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because the hybrid song classification contract does not exist yet.

**Step 3: Write minimal implementation**

Update `backend/src/db/schema.sql` to:
- keep local-support columns such as `file_url`
- keep Spotify columns such as `spotify_uri`, `spotify_id`, `artist_id`, `is_explicit`, `is_blocked`
- add:
  - `source_type`
  - `visibility`
  - `asset_role`
- preserve current queue FK compatibility
- avoid destructive drop/recreate patterns that assume full cutover

Add the minimum backend enum/source metadata definition needed for tests.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/utils/textNormalization.test.ts
git commit -m "feat: add hybrid song source schema"
```

### Task 2: Add Radio Profile and Device Override Schema

**Files:**
- Modify: `backend/src/db/schema.sql`
- Test: `backend/src/utils/textNormalization.test.ts` or a new focused helper test file

**Step 1: Write the failing test**

Add a small failing test for an exported config-resolution helper signature that expects:
- profile defaults
- device overrides
- effective autoplay playlist URI
- effective jingle/ad settings

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because no effective profile/override resolution exists yet.

**Step 3: Write minimal implementation**

Extend schema with:
- `radio_profiles`
- `radio_profile_assets`
- `devices.radio_profile_id`
- `devices.override_enabled`
- override columns for autoplay playlist, jingle cadence, ad interval
- device ad-break state column if needed (`last_ad_break_at`)

Create a small backend helper for effective device configuration resolution.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/utils/textNormalization.test.ts
git commit -m "feat: add radio profile and device override schema"
```

### Task 3: Finish Hybrid Search Behavior

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/spotify.ts`
- Modify: `backend/src/services/contentFilter.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add helper-level tests for merged search behavior:
- Spotify filtered results remain supported
- local `public` songs are eligible in user search
- `hidden local` songs are excluded
- merged result shape preserves source metadata

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because `/songs` currently only partially supports Spotify and does not yet merge local public results.

**Step 3: Write minimal implementation**

Update the search route and supporting helpers to:
- query Spotify when a search term exists
- filter Spotify results
- query local/public songs from DB
- merge and return both source types in one response
- ensure hidden local and blocked Spotify results stay filtered out

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/spotify.ts backend/src/services/contentFilter.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: add hybrid spotify and local search"
```

### Task 4: Convert Queue Insertions to Hybrid Source Contracts

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/spotify.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add tests for queue insertion helpers:
- user can enqueue a Spotify result by `spotify_uri`
- user can enqueue a public local song by `song_id`
- hidden local assets are rejected for normal user enqueue
- Spotify upsert creates/fetches a local `songs.id`

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because `/queue` currently still assumes the old `song_id` contract.

**Step 3: Write minimal implementation**

Refactor queue insertion to accept a hybrid request contract, for example:
- `spotify_uri` for Spotify items
- `song_id` for existing local/public rows

Internally:
- upsert Spotify track rows lazily
- preserve one queue table
- add `queue_reason`

Do not expose hidden local assets to normal users.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/spotify.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: add hybrid queue insertion flow"
```

### Task 5: Hide Jingle and Ad Items from Visible Queue Payloads

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add a test for queue serialization that proves:
- `user`, `admin`, `autoplay` items stay visible
- `jingle` and `ad` items stay in playback ordering but are omitted from the returned visible queue payload

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because queue payloads currently do not distinguish queue visibility by reason.

**Step 3: Write minimal implementation**

Update queue serialization helpers in `jukebox.ts` to:
- keep system items in the real queue
- filter `queue_reason in ('jingle', 'ad')` from visible queue responses
- preserve now-playing correctness

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: hide system assets from visible queue"
```

### Task 6: Implement Effective Radio Profile Resolution

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Create: `backend/src/services/radioProfiles.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add tests for effective configuration resolution:
- profile-only device uses profile defaults
- override-enabled device uses device values
- missing override field falls back to profile value

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because effective profile resolution service does not exist yet.

**Step 3: Write minimal implementation**

Create a focused service that resolves:
- effective autoplay playlist URI
- effective jingle cadence
- effective ad interval
- effective profile asset pool references

Use it from the places that need scheduling and autoplay decisions.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/radioProfiles.ts backend/src/routes/jukebox.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: resolve radio profile overrides"
```

### Task 7: Implement Jingle and Ad Scheduling

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/radioProfiles.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add tests for scheduling helpers:
- every `N` normal music items triggers one random jingle from the profile pool
- ad break interval triggers a full ad block using all ads assigned to the profile
- empty pools skip cleanly

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because no profile-driven jingle/ad scheduler exists yet.

**Step 3: Write minimal implementation**

Implement scheduling helpers that:
- count completed normal music items
- enqueue one random jingle when cadence is met
- enqueue all ads in the profile ad pool when interval is met
- mark queue items with `queue_reason=jingle|ad`

Keep them hidden from normal queue serialization.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/radioProfiles.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: add jingle and ad scheduling"
```

### Task 8: Implement Spotify Playlist Autoplay for Empty Queue

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/spotify.ts`
- Modify: `backend/src/services/radioProfiles.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add tests for autoplay helpers:
- empty queue resolves effective profile playlist
- Spotify playlist track is turned into an `autoplay` queue item
- if playlist is missing/unavailable, autoplay skips cleanly

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because current autoplay still assumes local random songs.

**Step 3: Write minimal implementation**

Update autoplay logic to:
- stop choosing random local songs as the primary empty-queue behavior
- ask Spotify for a track from the effective profile playlist
- upsert it into `songs`
- enqueue it as `queue_reason=autoplay`

Keep local fallback behavior only if explicitly desired and documented.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/spotify.ts backend/src/services/radioProfiles.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: add spotify playlist autoplay"
```

### Task 9: Dispatch Playback by Source Type

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/routes/spotify.ts`
- Modify: `backend/src/services/spotify.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add tests for playback dispatch:
- Spotify queue item triggers Spotify playback helper
- local queue item preserves existing file playback behavior
- track-end flow advances correctly regardless of source type

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because playback dispatch is still inconsistent between old local and new Spotify assumptions.

**Step 3: Write minimal implementation**

Refactor playback selection so the current queue item decides:
- `source_type=spotify` -> Spotify playback API / device path
- `source_type=local` -> current local path

Do not remove the local playback path.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/routes/spotify.ts backend/src/services/spotify.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: dispatch playback by source type"
```

### Task 10: Add Admin Endpoints for Profiles and Hidden Asset Management

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Create: `backend/src/routes/radioProfiles.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add focused contract tests for:
- create/update/delete radio profiles
- attach/detach jingle and ad assets to a profile
- assign a device to a profile
- set device override values

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: FAIL because profile-management routes do not exist yet.

**Step 3: Write minimal implementation**

Add admin-only backend endpoints for:
- profile CRUD
- profile asset pool management
- device/profile assignment
- device override configuration

Keep hidden asset queueing admin/system-only.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/radioProfiles.ts backend/src/routes/jukebox.ts backend/src/server.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: add radio profile admin endpoints"
```

### Task 11: Full Verification

**Files:**
- Verify: `backend/src/db/schema.sql`
- Verify: `backend/src/routes/jukebox.ts`
- Verify: `backend/src/routes/spotify.ts`
- Verify: `backend/src/services/spotify.ts`
- Verify: `backend/src/services/contentFilter.ts`
- Verify: `backend/src/services/radioProfiles.ts`

**Step 1: Run backend tests**

Run: `npx vitest run`
Expected: PASS

**Step 2: Run backend build**

Run: `npm run build`
Expected: PASS

**Step 3: Run smoke checks**

Verify with representative requests:
- user search returns Spotify + public local songs
- hidden local songs do not appear in user search
- queue add works for Spotify and public local
- jingle/ad items stay out of visible queue responses
- empty queue resolves autoplay from effective profile playlist

**Step 4: Commit**

```bash
git add .
git commit -m "chore: verify hybrid spotify and local jukebox"
```
