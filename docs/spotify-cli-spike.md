# Spotify CLI / Windows Agent Playback Split

This repository runs the webserver/backend and serves the kiosk/controller web apps. The webserver must not execute Spotify CLI commands and must not store kiosk Spotify refresh tokens.

## Architecture

- Webserver/backend:
  - Stores Jukebox queue state.
  - Serves kiosk/controller web apps.
  - Accepts a remote Windows agent socket connection from the kiosk machine.
  - Emits playback commands to the registered agent.
  - Receives playback events from the agent and updates queue state.

- Kiosk machine:
  - Runs the Windows agent locally.
  - Owns Spotify CLI/Desktop playback and any local playback credentials.
  - Executes PLAY_TRACK, PAUSE, RESUME, and SKIP locally.
  - Reports PLAY_STARTED, PLAYBACK_STATE, TRACK_ENDED, and PLAY_FAILED back to backend.

- Kiosk web UI:
  - Remains the display surface.
  - Does not need to play audio when Windows agent playback is enabled.
  - Can read `queue_updated.playback` or `windows_agent_status` for debug state.

## Backend Setup

Backend env only:

```env
ENABLE_WINDOWS_AGENT_PLAYBACK=false
WINDOWS_AGENT_REQUIRED_FOR_SPOTIFY=false
```

Set `ENABLE_WINDOWS_AGENT_PLAYBACK=true` only after the kiosk machine has a running Windows agent.

Do not put these values in backend `.env`:

```env
CLI_PLAY_COMMAND=
SPOTIFY_REFRESH_TOKEN=
SPOTIFY_CLIENT_SECRET=
```

Those belong on the kiosk machine, in the Windows agent environment.

## Backend Migration

Run only after taking a PostgreSQL backup:

```powershell
cd "C:\Users\tuna.ozsari\Desktop\rtjukebox\rtjukebox\backend"
npm run build
node dist/db/migrate.js
```

Migration adds playback/debug columns to `devices`:

- `playback_provider`
- `playback_agent_socket_id`
- `playback_agent_connected_at`
- `playback_agent_last_seen_at`
- `playback_state`
- `playback_state_source`
- `playback_last_event`
- `playback_last_event_at`
- `playback_last_error`
- `playback_debug`

## Socket Contract

### Agent Register

Event sent by kiosk Windows agent:

```ts
socket.emit('windows_agent_register', {
  device_id: '<device uuid>',
  password: '<existing kiosk device password>',
  provider: 'spotify_cli'
}, ack => console.log(ack));
```

Backend joins the socket to:

- `device:<device_id>`
- `windows-agent:<device_id>`

Backend emits status to device room:

```ts
windows_agent_status
```

### Backend Command To Agent

Backend emits this event to `windows-agent:<device_id>`:

```ts
windows_agent_command
```

Payload shape:

```json
{
  "command_id": "uuid",
  "command": "PLAY_TRACK",
  "device_id": "device uuid",
  "queue_item_id": "queue item uuid",
  "song_id": "song uuid",
  "issued_at": "ISO date",
  "song": {
    "id": "song uuid",
    "title": "Song Title",
    "artist": "Artist",
    "cover_url": "/api/uploads/...",
    "duration_seconds": 180,
    "file_url": "/api/uploads/..."
  }
}
```

Supported commands:

- `PLAY_TRACK`
- `PAUSE`
- `RESUME`
- `SKIP`

### Agent Events To Backend

Event sent by kiosk Windows agent:

```ts
socket.emit('windows_agent_event', {
  device_id: '<device uuid>',
  event: 'PLAY_STARTED',
  queue_item_id: '<queue item uuid>',
  song_id: '<song uuid>',
  stateSource: 'spotify_cli'
}, ack => console.log(ack));
```

Supported events:

- `PLAY_STARTED`
- `PLAYBACK_STATE`
- `TRACK_ENDED`
- `PLAY_FAILED`

Rules:

- Backend does not mark a queue item as `played` when command is sent.
- `PLAY_STARTED` can mark the queue item as `playing`.
- `TRACK_ENDED` marks the queue item as `played` and awards requester points.
- If the agent cannot detect a real end event, it may send `TRACK_ENDED` with `stateSource: "duration_timer"` after the known duration elapses.
- `PLAY_FAILED` does not mark the queue item as `played`; it only updates debug/error state.

## Backend API Contract

### Agent status

```http
GET /api/v1/jukebox/kiosk/agent/status/:deviceId
```

Response includes:

```json
{
  "enabled": true,
  "status": {
    "provider": "spotify_cli",
    "stateSource": "windows_agent",
    "lastEvent": "PLAY_STARTED",
    "errorReason": null
  }
}
```

### Send command to agent

```http
POST /api/v1/jukebox/kiosk/agent/command
Content-Type: application/json
```

Body:

```json
{
  "device_id": "device uuid",
  "password": "existing kiosk device password",
  "command": "PLAY_TRACK",
  "queue_item_id": "optional queue item uuid"
}
```

If `queue_item_id` is omitted for `PLAY_TRACK`, backend sends the highest-priority pending item.

## Kiosk Machine Setup

The kiosk machine needs a Windows agent project that connects to the backend socket and executes playback locally.

Example PowerShell command for the kiosk machine:

```powershell
cd "C:\Users\tuna.ozsari\Desktop\rtjukebox\windows-agent"
$env:BACKEND_URL="https://<backend-host>"
$env:DEVICE_ID="<device uuid>"
$env:DEVICE_PASSWORD="<existing kiosk device password>"
$env:PLAYBACK_PROVIDER="spotify_cli"
$env:CLI_PLAY_COMMAND="<local spotify cli play command>"
npm install
npm run start
```

If the agent is packaged as an exe, use the same env values and run the exe instead of `npm run start`.

## Smoke Test

1. Start backend with `ENABLE_WINDOWS_AGENT_PLAYBACK=true`.
2. Run DB migration.
3. Start kiosk Windows agent.
4. Confirm agent status:

```powershell
Invoke-RestMethod "https://<backend-host>/api/v1/jukebox/kiosk/agent/status/<device uuid>"
```

5. Send `PLAY_TRACK` command:

```powershell
Invoke-RestMethod "https://<backend-host>/api/v1/jukebox/kiosk/agent/command" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"device_id":"<device uuid>","password":"<device password>","command":"PLAY_TRACK"}'
```

6. Confirm queue item stays pending until the agent reports `PLAY_STARTED`.
7. Confirm item becomes `played` only after `TRACK_ENDED`.
8. Confirm `PLAY_FAILED` updates `playback.errorReason` but does not mark item played.
