# Broadcast PC Codex Prompt: Local Voting Agent

Paste this into Codex on the Windows broadcast computer checkout of `rtjukebox`.

```text
You are working on the Windows broadcast computer setup for RadioTEDU next-song voting.

Goal: make `tools/local-voting-agent` run locally as the broadcast-side voting agent. It must scan a plain music folder database, scan a separate jingle folder, use FFmpeg, stay dry-run by default, and connect to the web server backend only through the `next-song-voting` namespace.

Important product boundary:
- This is separate from the existing Jukebox queue feature.
- Do not embed UI or API behavior into Jukebox screens/routes.
- The local agent can have a browser panel for the broadcast operator, but mobile users enter through the separate `Oylama` / next-song voting surface.

Use/configure these environment variables:
- `MUSIC_LIBRARY_DIR`: semicolon-separated music folder roots, e.g. `D:\RadioTEDU\Music`
- `JINGLE_LIBRARY_DIR`: semicolon-separated jingle folder roots, e.g. `D:\RadioTEDU\Jingles`
- `JINGLE_BEFORE_WINNER=true`
- `VOTING_AGENT_PLAYBACK_MODE=dry-run` first; switch to `live` only after dry-run verification
- `FFMPEG_PATH`: path to `ffmpeg.exe` or `ffmpeg` on PATH
- `FFPROBE_PATH`: path to `ffprobe.exe` or `ffprobe` on PATH
- `BACKEND_API_BASE_URL`: production backend base URL
- `BACKEND_AGENT_TOKEN`: device-scoped token from the web server
- `BACKEND_DEVICE_ID`: stable id/name for the broadcast PC
- `PORT=4317` unless occupied

Tasks:
1. Open `tools/local-voting-agent`.
2. Install dependencies with `npm install` if needed.
3. Verify folder scanning sees real songs and never includes jingles as voting candidates.
4. Verify album art is discovered from same-folder image files (`cover`, `folder`, `front`, `album`, or song-name image).
5. Start in dry-run mode and confirm resolve produces an FFmpeg playback plan with optional jingle then winner.
6. Confirm backend publish URL is `/api/v1/next-song-voting/agent/rounds`, not the existing Jukebox queue namespace.
7. Add a small Windows run script if missing, preferably `tools/local-voting-agent/scripts/run-local-voting-agent.ps1`, that sets env vars and runs `npm run dev` or the production start command.
8. Do not expose local Windows file paths in any backend/mobile payload.

Verification:
- `cd tools/local-voting-agent`
- `npm test`
- `npm run build`
- Dry-run a round with a small test folder and confirm jingle + winner plan.
- Report exact paths, commands, and whether playback stayed dry-run or was switched to live.
```
