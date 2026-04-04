# Device-Scoped Spotify Auth and Profile-Balanced Autoplay Design

**Date:** 2026-04-03

## Goal

Extend the hybrid jukebox so that:

- each kiosk device can play Spotify independently with its own Spotify account
- Spotify app credentials can be managed from the admin panel without exposing the secret to the browser
- kiosk setup can initiate Spotify authorization for the current device when required
- autoplay playlist selection is no longer fully random and instead prefers the least-played tracks per `radio_profile`, using random only as a tie-breaker

## Why This Design

The current system uses one Spotify account and one browser playback device chain. That works for a single kiosk, but it breaks as soon as multiple kiosks need to play independently. Spotify playback is account-scoped, so each independent kiosk needs its own Spotify authorization and token set. App credentials and user/device authorizations must therefore be separated.

At the same time, autoplay from a profile playlist is currently random. That causes track repetition and weak distribution. Since autoplay is profile-driven, fairness should also be measured at the profile level rather than globally.

## Core Decisions

### 1. Spotify App Credentials Stay Global

`Client ID` and `Client Secret` represent the Spotify developer app, not the playback identity. They will remain a single global backend-managed configuration. The admin panel may edit them, but:

- the secret is stored only server-side
- API responses return a masked representation, not the raw secret
- kiosk and normal frontend code never receive the secret

### 2. Spotify Authorization Becomes Device-Scoped

Each kiosk device gets its own Spotify authorization record. That record identifies which Spotify account the device uses for playback. This makes independent playback possible across devices.

This means:

- one device = one Spotify authorization state
- one device = one browser playback device registration
- multiple devices can use different Spotify accounts and play independently

### 3. Kiosk Setup Owns the Final Authorization Step

Admin creates the device and can start the flow, but the kiosk should be able to complete its own Spotify setup. If a device has no Spotify authorization and its queue/profile needs Spotify playback, kiosk setup should present a connect overlay and start the device-specific authorize flow.

This keeps ownership aligned with the physical device and avoids binding the wrong account to the wrong kiosk.

### 4. Autoplay Fairness Is Profile-Scoped

Autoplay playlist selection will use a profile-level stats table keyed by:

- `radio_profile_id`
- `spotify_uri`

Selection rule:

1. load the effective profile playlist
2. load the filtered candidate tracks
3. join candidates with profile stats
4. choose the minimum `play_count`
5. if more than one track shares that minimum count, choose randomly among that tied set

Stats are incremented only when an autoplay item actually starts playback.

## Data Model

### Global Spotify App Config

Add a dedicated backend-managed config table, for example:

- `spotify_app_config`
  - `id`
  - `client_id`
  - `client_secret`
  - `redirect_uri`
  - `updated_at`

This is a single-row config store for the Spotify developer app.

### Device Spotify Auth

Add a device-scoped auth table, for example:

- `device_spotify_auth`
  - `device_id`
  - `spotify_account_id`
  - `spotify_account_name`
  - `access_token`
  - `refresh_token`
  - `expires_at`
  - `scope`
  - `created_at`
  - `updated_at`
  - `last_authorized_at`

This is separate from browser playback device registration already stored on `devices`.

### Profile Autoplay Stats

Add a profile-scoped stats table, for example:

- `radio_profile_playlist_stats`
  - `radio_profile_id`
  - `spotify_uri`
  - `play_count`
  - `last_played_at`
  - `created_at`
  - `updated_at`

Unique key:

- `(radio_profile_id, spotify_uri)`

This table tracks only autoplay balancing for profile playlists.

## Backend Flow

### Global Spotify Config

Add backend helpers and admin routes to:

- read masked Spotify app config
- update `client_id`
- update `client_secret`
- compute effective redirect URI
- make Spotify service resolve credentials from DB first, env fallback second

The API must never return the raw secret after save.

### Device Authorization Flow

Add device-scoped authorization endpoints:

- `GET /api/v1/spotify/device-auth/start?device_id=...`
- `GET /api/v1/spotify/device-auth/callback`
- `GET /api/v1/spotify/device-auth/status?device_id=...`
- `DELETE /api/v1/spotify/device-auth/:deviceId`

OAuth `state` should carry a signed or validated device context so the callback can safely bind the returned Spotify account to the correct kiosk device.

### Device Playback Token Resolution

Kiosk playback token endpoint must stop using a single global Spotify auth row. Instead it should load the device-specific token row, refresh if needed, and return the short-lived access token for that specific kiosk.

### Autoplay Selection

Replace random profile autoplay selection with a least-played selection helper:

- input: effective profile playlist URI, filtered Spotify candidates, profile stats
- output: one autoplay candidate

Algorithm:

1. discard invalid candidates
2. map candidates by `spotify_uri`
3. assign default stats `{ play_count: 0, last_played_at: null }` if missing
4. compute the minimum `play_count`
5. keep only candidates at that minimum
6. random-pick one candidate from the tied minimum group

### Autoplay Stats Update

When an autoplay queue item becomes actual playback:

- resolve current device profile
- if queue reason is `autoplay` and source is `spotify`
- increment `radio_profile_playlist_stats.play_count`
- set `last_played_at = NOW()`

Do not increment on enqueue alone. Increment on playback start.

## Admin UX

### Spotify App Settings

Add an admin settings card with:

- `Client ID`
- masked `Client Secret`
- optional replace-secret input
- resolved redirect URI display
- save action
- validation / last updated feedback

### Device-Level Spotify Controls

Add device detail controls with:

- Spotify connection status
- connected Spotify account name
- token expiry/health if available
- `Spotify bağla`
- `Yeniden bağla`
- `Bağlantıyı kaldır`

The connect action should open the device-specific authorization URL.

## Kiosk UX

After device registration:

- if the device has no Spotify authorization and Spotify playback is needed
- show a blocking setup card
- offer a `Spotify ile bağlan` action for the current kiosk
- once callback completes, reload or resume setup

The kiosk should not ask for app credentials. It only completes authorization for its own device.

## Error Handling

- missing global Spotify app config: admin routes and kiosk connect flow show a clear config error
- missing device auth: kiosk shows setup-required UI, backend returns a recoverable status
- expired device token: backend refreshes automatically
- revoked Spotify account: mark device auth invalid and show reconnect requirement
- playlist candidates empty: skip autoplay cleanly or fall back to existing local fallback path
- profile stats row missing: treat as zero plays

## Testing Strategy

### Backend

- config helper tests for masked secret behavior and DB/env precedence
- device auth route tests for start/callback/status/delete
- token resolution tests to ensure kiosk token uses device auth, not global auth
- autoplay selection tests for:
  - least-played win
  - zero-count default
  - random tie-break within same minimum group
- playback dispatch tests that increment profile stats only when autoplay actually starts

### Frontend / Kiosk

- admin device settings tests for rendering device Spotify status/actions
- kiosk setup tests for device-level Spotify connect prompt
- kiosk playback regression tests to ensure existing Web Playback SDK flow keeps working

## Success Criteria

- two different kiosks can each bind to different Spotify accounts and play independently
- admin can update Spotify app credentials from the web panel without exposing the secret
- a newly created kiosk can complete Spotify setup from the kiosk flow
- autoplay no longer behaves as full random; per profile it prefers least-played tracks and only randomizes ties
