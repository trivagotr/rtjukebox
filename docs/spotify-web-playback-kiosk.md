# Spotify Web Playback kiosk architecture

Date: 2026-07-01

## Decision

Spotify CLI is not the primary playback solution. The kiosk browser is the playback host, using Spotify Web Playback SDK for Spotify tracks and browser audio for local fallback.

## Machine split

Webserver:

- Runs backend, database, queue, device auth, and socket coordination.
- Serves `kiosk-web`.
- Does not run Spotify CLI.
- Does not play audio.
- Does not expose Spotify client secret to the kiosk frontend.

Kiosk machine:

- Opens `kiosk-web`.
- Authenticates the kiosk Spotify account through the existing device-scoped Spotify auth flow.
- Loads Spotify Web Playback SDK.
- Creates the browser Spotify Connect device.
- Starts Spotify tracks with a short-lived kiosk access token.
- Reports queue-item playback state back to the backend.

## New backend playback contract

`POST /api/v1/jukebox/kiosk/playback/claim-next`

Claims the next pending queue item for a device and returns a queue-item playback payload.

`POST /api/v1/jukebox/kiosk/playback/state`

Reports exact queue-item playback state:

- `playing`
- `paused`
- `played`
- `failed`
- `skipped`

`failed` is stored as `skipped` because the current `queue_items.status` model does not include `failed`.

## Kiosk changes

- Added `kiosk-web/playback-adapters.js` with the explicit kiosk playback state list and adapter selection helpers.
- Added deployment overrides through `window.RT_JUKEBOX_CONFIG` in `kiosk-web/config.js`.
- Spotify queue-item playback now starts through Spotify Web API from the kiosk using a short-lived access token and the Web Playback SDK device id.
- Spotify queue-item playback reports `playing` and `played` through `/kiosk/playback/state` when a queue item id is available.
- The old `/kiosk/now-playing` path remains as fallback for legacy song-id flows and local/browser audio paths.

## Manual kiosk POC checklist

1. Open kiosk URL with device code/password.
2. Confirm backend registration succeeds.
3. Connect kiosk Spotify account and confirm Premium account.
4. Confirm Spotify SDK ready event registers a browser device.
5. Queue one Spotify track.
6. Confirm the kiosk starts the track without Spotify CLI.
7. Confirm backend receives `playing` for the queue item.
8. Let the track end and confirm backend receives `played`.
9. Disconnect socket temporarily and confirm queue polling still recovers.
10. Confirm device password is not printed in console logs.

## Deployment override example

Add this before `config.js` if the kiosk is served from a different origin than the backend:

```html
<script>
  window.RT_JUKEBOX_CONFIG = {
    API_URL: 'https://api.example.com',
    WS_URL: 'https://api.example.com',
    SOCKET_PATH: '/socket.io'
  };
</script>
```
