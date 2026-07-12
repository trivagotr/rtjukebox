# RadioTEDU Broadcast PC - Final Next-Song Voting Wire Prompt

Paste the following into Codex on the Windows broadcast computer. Use the RadioTEDU repository branch:
`https://github.com/trivagotr/rtjukebox/tree/codex/study-amphitheatre-handoff`

```text
You are configuring the Windows broadcast computer for RadioTEDU next-song voting.

Repository and scope
- Clone or update https://github.com/trivagotr/rtjukebox/tree/codex/study-amphitheatre-handoff
- Work only in tools/local-voting-agent for local playback setup, unless a small documentation/run-script change is needed.
- Do not replace, weaken, or reuse the existing Jukebox queue. Next-song voting is a separate backend namespace: /api/v1/next-song-voting.
- Do not expose Windows paths, music file names with path fragments, credentials, FFmpeg commands, or local HTTP services to mobile clients or the public internet.

Architecture to preserve
1. The mobile app reads GET /api/v1/next-song-voting/rounds/active and sends an authenticated vote to POST /api/v1/next-song-voting/rounds/:roundId/votes.
2. The backend is the source of truth for rounds and ballots. It accepts only one current ballot per registered user per round. Never trust a client-provided vote total.
3. This Windows machine owns only local catalog discovery, candidate selection, optional jingle selection, and playback. It publishes sanitized candidate metadata to POST /api/v1/next-song-voting/agent/rounds.
4. The agent endpoint accepts only a matching bearer token and the configured X-RT-Device-Id. Do not use a user JWT or put this token in a browser/mobile app.

Prerequisites
- Node.js 20 or newer
- FFmpeg and ffprobe installed and callable from PowerShell
- A local music folder and a separate jingle folder
- A server administrator must configure the same two values on radiotedu.com before the agent is started:
  NEXT_SONG_VOTING_AGENT_TOKEN=<long random device secret>
  NEXT_SONG_VOTING_AGENT_DEVICE_ID=broadcast-pc-1
- The broadcast PC receives the same secret only through a private operator channel. Do not commit it.

Create tools/local-voting-agent/.env locally. Do not add it to git:
  MUSIC_LIBRARY_DIR=D:\RadioTEDU\Music
  JINGLE_LIBRARY_DIR=D:\RadioTEDU\Jingles
  JINGLE_BEFORE_WINNER=true
  CANDIDATE_COUNT=3
  FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
  FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
  VOTING_AGENT_PLAYBACK_MODE=dry-run
  BACKEND_API_BASE_URL=https://radiotedu.com
  BACKEND_AGENT_TOKEN=<same private device secret>
  BACKEND_DEVICE_ID=broadcast-pc-1
  BACKEND_SYNC_ENABLED=true
  PORT=4317

Tasks
1. Inspect tools/local-voting-agent and keep its browser operator panel bound to 127.0.0.1 only. It must not listen on the LAN or public IP.
2. Run npm ci when the lock file permits it; otherwise explain the exact lock mismatch and repair it with npm install --package-lock-only before retrying npm ci.
3. Verify catalog scanning using a small non-production copy of music. Confirm only supported audio files below MUSIC_LIBRARY_DIR become candidates.
4. Verify JINGLE_LIBRARY_DIR is scanned separately and no jingle is published as a mobile voting candidate.
5. Verify album art discovery without publishing local paths. The backend payload may contain public-safe title, artist, song ID, and public album-art URL/null only.
6. Start with VOTING_AGENT_PLAYBACK_MODE=dry-run. Open the local operator panel, create a round, publish it to the backend, vote with two registered test users from the mobile/API side, and confirm the backend active-round response changes only from server ballots.
7. Confirm a second vote from the same test user replaces that user's ballot rather than increasing the total by two.
8. Confirm a guest or unauthenticated API request is rejected by the backend vote route.
9. Confirm an agent publication with a wrong bearer token or wrong X-RT-Device-Id receives HTTP 401.
10. Confirm the resolved dry-run plan lists the optional jingle before the winner and does not run FFmpeg playback yet.
11. Add or update a local PowerShell launcher outside git if needed. It must load .env/private variables, start the agent, write logs locally, and not print secrets.
12. Only after all dry-run checks pass, present the exact one-line change needed to set VOTING_AGENT_PLAYBACK_MODE=live. Do not switch it yourself unless the broadcast operator explicitly asks during the same session.

Verification commands
  cd tools/local-voting-agent
  npm test
  npm run build

Server API checks, using sanitized test values only
- GET https://radiotedu.com/api/v1/next-song-voting/rounds/active returns an envelope with data.round.
- POST /api/v1/next-song-voting/agent/rounds with the correct device bearer token and X-RT-Device-Id returns HTTP 200.
- POST /api/v1/next-song-voting/rounds/:roundId/votes requires a registered RadioTEDU bearer JWT and returns the selected candidate ID.

Final report
- State whether every check passed.
- State whether the machine remains in dry-run or has explicit approval for live mode.
- List only relative config keys and sanitized paths; never print secrets or a real local path in the report.
```
