# Hybrid Spotify + Local Jukebox Design

## Context

The existing Spotify work in the repo was started from a full-cutover assumption: replace the local MP3 catalog with Spotify-backed songs, remove upload/scan flows, and move playback fully to Spotify. That no longer matches the product direction.

The target product is now hybrid:

- Spotify remains the primary music source for normal catalog search and autoplay.
- Local files remain supported for public songs and for hidden system assets such as jingles and ad spots.
- Playback stays on a single execution queue.
- Jingle and ad items are inserted by system policy but hidden from the normal user-visible queue.
- Radio behavior is managed by reusable web-controlled radio profiles, with optional per-device overrides.

This design intentionally preserves the current local playback path instead of deleting it.

## Current State Assessment

The repo already contains partial Spotify work:

- `backend/src/services/spotify.ts` implements search, OAuth token handling, playback-control helpers, and Spotify-song upsert logic.
- `backend/src/services/contentFilter.ts` implements explicit-content and blacklist filters.
- `backend/src/routes/spotify.ts` exists and is wired in `backend/src/server.ts`.
- `backend/src/db/schema.sql` has already been partially migrated toward a Spotify-backed `songs` table and Spotify auth/blocklist tables.
- `backend/src/routes/jukebox.ts` has partial Spotify search integration and partial schema usage.

But the implementation is incomplete and internally inconsistent:

- queue and playback flows still fundamentally depend on the local-file-era `song_id` and local playback assumptions
- upload/scan/metadata flows still exist and still matter for local assets
- the current schema changes are moving toward full replacement of local support, which conflicts with the new hybrid requirement

The next implementation phase should continue from the current code, but redirect it to the hybrid model instead of continuing the full-cutover path.

## Product Goals

- Keep Spotify and local content in one operational system.
- Preserve a single queue and one set of queue rules.
- Allow public local songs to behave like normal catalog items.
- Allow hidden local assets to be used only by admin/system automation.
- Support per-radio-profile autoplay playlist, jingle cadence, and ad break policy.
- Allow per-device override of profile defaults.
- Keep everything remotely manageable from the web-admin side.

## Non-Goals

- Removing local playback support.
- Building AI lyric filtering in this phase.
- Building a separate second queue for jingles/ads.
- Reworking the whole mobile/web UI in one step before the backend contract is stable.

## Core Model

### Unified Songs Catalog

Keep a single `songs` table, but make it explicitly hybrid.

Shared fields:

- `id`
- `source_type`: `spotify | local`
- `visibility`: `public | hidden`
- `asset_role`: `music | jingle | ad`
- `title`
- `artist`
- `album`
- `cover_url`
- `duration_ms`
- `play_count`
- `score`
- `created_at`

Spotify-only fields:

- `spotify_uri`
- `spotify_id`
- `artist_id`
- `is_explicit`
- `is_blocked`

Local-only fields:

- `file_url`

Rules:

- `public local` songs appear in normal catalog search.
- `hidden local` songs never appear in normal user search.
- `hidden local` songs can still be attached to radio-profile pools or manually queued by admin.
- `asset_role=jingle|ad` must be local in the first implementation.

### Radio Profiles

Add a `radio_profiles` table to represent reusable station behavior:

- `id`
- `name`
- `autoplay_spotify_playlist_uri`
- `jingle_every_n_songs`
- `ad_break_interval_minutes`
- `is_active`
- timestamps

Profiles are the default behavior source for devices.

### Profile Asset Pools

Add a `radio_profile_assets` table:

- `id`
- `radio_profile_id`
- `song_id`
- `slot_type`: `jingle | ad`
- `sort_order` optional for future use
- timestamps

Behavior:

- jingle pool: choose one random hidden local jingle when the cadence rule triggers
- ad pool: when an ad break triggers, enqueue every ad assigned to that profile as one block

### Device Assignment and Override

Extend `devices` with:

- `radio_profile_id`
- `override_enabled`
- `override_autoplay_spotify_playlist_uri`
- `override_jingle_every_n_songs`
- `override_ad_break_interval_minutes`

Resolution rule:

- if `override_enabled=false`, the device inherits all profile behavior
- if `override_enabled=true`, device override values win where present

## Queue and Playback Model

### Single Execution Queue

Keep one real playback queue in `queue_items`.

Add:

- `queue_reason`: `user | admin | autoplay | jingle | ad`

Visibility rule:

- `user`, `admin`, and `autoplay` items are returned in the normal visible queue payload
- `jingle` and `ad` items stay in the real queue for playback ordering but are filtered out from user-visible queue lists

This keeps one source of truth for playback order while preserving the desired UI behavior.

### Playback Dispatch

At play time:

- if the current item references a `spotify` song, backend uses Spotify playback control
- if the current item references a `local` song, backend uses the existing local-file playback path

This decision happens at the queue/playback layer, not at the UI layer.

### Autoplay

When no user-visible queue items remain:

- resolve the device’s effective autoplay playlist URI
- request a track from that Spotify playlist
- upsert the track into `songs`
- enqueue it as `queue_reason=autoplay`

Autoplay should still be materialized as a real queue item, because:

- debugging is easier
- skip logic stays consistent
- playback history remains complete

## Scheduling Rules

### Jingle Rule

Track only normal music progression for the cadence counter.

Recommended rule:

- count completed `queue_reason in (user, admin, autoplay)` items where `asset_role=music`
- when the count reaches `jingle_every_n_songs`, insert one random `jingle` from the effective profile pool
- reset the jingle counter

### Ad Break Rule

Maintain per-device ad-break state:

- `last_ad_break_at`

When the effective interval elapses and playback reaches a safe insertion point:

- fetch the effective profile’s `ad` pool
- enqueue all assigned ads in one contiguous block
- mark `last_ad_break_at=NOW()`

If the pool is empty, skip the break and update nothing or log a skip reason.

## Search Behavior

### User Search

`GET /api/v1/jukebox/songs?search=...` should return a merged result set:

- Spotify search results, filtered through content filters
- local `public` songs matching the query

Do not return:

- hidden local songs
- blocked Spotify songs/artists

A merged response shape should carry enough metadata to let the client distinguish source type.

### Admin Search

Admin endpoints can expose all songs, including hidden local assets, with explicit visibility and role metadata.

## Admin Control Surface

The web-admin flow needs these capabilities:

- manage Spotify auth status
- manage blacklist and blocked artists
- manage local songs and hidden assets
- assign `visibility` and `asset_role`
- create/edit radio profiles
- attach jingle/ad pools to profiles
- assign devices to profiles
- enable/disable device override and edit override values
- manually enqueue hidden jingle/ad items when needed

This can be phased behind the backend model changes; the backend contract is the priority.

## Migration Strategy

Do not continue the current “drop local support” direction.

Instead:

1. Reconcile the `songs` schema into the hybrid shape.
2. Preserve existing local rows by backfilling:
   - `source_type=local`
   - `visibility=public`
   - `asset_role=music`
3. Keep `file_url` for local rows.
4. Allow Spotify rows to be lazily created by queue/autoplay flow.
5. Introduce profiles and profile assets with additive migrations.

The implementation must be backward-conscious enough that existing local playback keeps working throughout the migration.

## Error Handling

- Spotify search failure: still return matching local public songs if available.
- Spotify autoplay playlist unavailable: skip autoplay gracefully and log device/profile context.
- Empty jingle pool: skip that insertion cycle.
- Empty ad pool: skip ad break creation.
- Spotify auth missing/revoked: playback of Spotify items fails fast and surfaces admin action required.
- Local file missing: mark queue item failed/skipped, log clearly, continue queue.

## Verification Targets

- public local songs show up in user search alongside Spotify results
- hidden local songs do not show up in user search
- hidden jingle/ad assets can be attached to a profile and auto-enqueued
- jingle items stay out of visible queue responses
- ad blocks enqueue all assigned ads in order as one break
- device with override uses override settings instead of profile defaults
- empty queue triggers Spotify playlist autoplay for the device’s effective profile
- playback dispatch chooses Spotify vs local path correctly

## Recommended Implementation Order

1. Stabilize hybrid schema and song model.
2. Finish merged search + queue contract.
3. Add profile and override resolution.
4. Add jingle/ad scheduling and autoplay policy.
5. Wire playback dispatch and admin endpoints.
6. Then update UI/admin surfaces to use the new model.
