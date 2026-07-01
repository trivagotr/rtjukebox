# Codex Prompt 2: Windows Broadcast App / Local Agent

Use this prompt in the Codex session that will work on the local broadcast agent code in `rtjukebox`.

## Objective

Turn `tools/local-voting-agent` into the Windows/broadcast-computer app that reads a plain music folder, handles jingles, talks to the backend, and prepares the FFmpeg playback plan.

Do not implement backend schema/routes here unless Prompt 1 has already been completed. Do not implement mobile UI here.

## Current Tool Location

`tools/local-voting-agent`

Current MVP:

- React/Vite local operator panel.
- Local Express API.
- Mock voting round engine.
- JSON sample catalog for dev mode.
- FFmpeg/ffprobe command helpers.
- Dry-run playback command preview.

## Product Rules

- The broadcast computer "database" is a plain folder tree of audio files.
- Normal songs come from `MUSIC_LIBRARY_DIR`.
- Jingles come from `JINGLE_LIBRARY_DIR`.
- Jingles are not voting candidates.
- First production behavior: optional jingle before the winning song.
- Default candidate count is 3, configurable to 2.
- Playback must stay dry-run by default.
- Live playback must require explicit config.
- Mobile/backend responses must not expose local Windows filesystem paths.

## Folder Database Requirements

Add folder scanning support:

- Recursively scan `MUSIC_LIBRARY_DIR`.
- Supported audio extensions: `.mp3`, `.wav`, `.flac`, `.m4a`, `.aac`, `.ogg`.
- Ignore non-audio files.
- Use ffprobe metadata for title/artist/duration when available.
- If metadata is missing:
  - parse `Artist - Title.ext`
  - otherwise use filename as title and `Unknown Artist`
- Mark normal music as `assetRole: "song"`.
- Validate paths stay inside configured music roots.

Add jingle scanning support:

- Recursively scan `JINGLE_LIBRARY_DIR`.
- Mark jingles as `assetRole: "jingle"`.
- Never include jingles in voting candidates.
- Allow no jingle folder; app should still work.

## Playback Plan Requirements

Add a playback plan abstraction:

- If `JINGLE_BEFORE_WINNER=true` and at least one jingle exists:
  - plan is `[jingle, winner]`
- Otherwise:
  - plan is `[winner]`
- Each plan item should include:
  - `role`: `jingle` or `song`
  - `title`
  - `artist`
  - safe display id
  - local file path only for internal agent use
  - FFmpeg args preview

The operator panel should show the planned order before playback starts.

## Backend Connection Requirements

After Prompt 1 backend contracts exist, add a backend client:

- `RADIOTEDU_BACKEND_URL`
- `RADIOTEDU_AGENT_ID`
- `RADIOTEDU_AGENT_SECRET`
- `RADIOTEDU_DEVICE_ID`

Suggested files:

- `src/agent/folderCatalog.ts`
- `src/agent/playbackPlan.ts`
- `src/agent/backendClient.ts`
- `src/agent/agentRuntime.ts`

The agent should:

- register or authenticate with backend
- send heartbeat
- send current playback progress
- submit voting candidates
- poll or subscribe for winner commands
- ack commands after playback handoff
- show disconnected/connected/error states in panel

## Windows Operation Notes

The app should run on the broadcast computer. It can be launched as:

```powershell
cd tools/local-voting-agent
npm install
$env:MUSIC_LIBRARY_DIR="D:\RadioTEDU\Music"
$env:JINGLE_LIBRARY_DIR="D:\RadioTEDU\Jingles"
$env:JINGLE_BEFORE_WINNER="true"
npm run dev
```

Later production packaging can use a Windows service runner or a packaged Node app, but do not add packaging until the runtime is stable.

## Tests To Add First

Use TDD.

- Folder scanner recursively loads supported audio.
- Folder scanner ignores non-audio files.
- Folder scanner marks songs as `assetRole: "song"`.
- Jingle scanner marks jingles as `assetRole: "jingle"`.
- Candidate selection filters out jingles.
- Playback plan inserts jingle before winner when enabled.
- Playback plan omits jingle when disabled or unavailable.
- Panel/API state shows playback plan preview.
- Backend client does not leak local file paths in payloads.

## Verification

```powershell
cd tools/local-voting-agent
npm test
npm run build
```

Manual smoke test with real folders:

```powershell
cd tools/local-voting-agent
$env:MUSIC_LIBRARY_DIR="D:\RadioTEDU\Music"
$env:JINGLE_LIBRARY_DIR="D:\RadioTEDU\Jingles"
$env:JINGLE_BEFORE_WINNER="true"
npm run dev
```

## Deliverables

- Folder database support.
- Jingle asset support.
- Playback plan support.
- Backend client or backend-client implementation plan, depending on whether Prompt 1 is done.
- Operator panel updates.
- Notes for Windows deployment.

## Safety

- Keep dry-run default.
- Do not auto-play live audio until explicitly enabled.
- Do not expose local file paths publicly.
- Do not commit `.env` files or secrets.
