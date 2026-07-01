# Server Codex Prompt: Local Voting Agent Backend Integration

Use this prompt on the server-side Codex session for continuing the RadioTEDU next-song voting system.

## Context

You are working in the `rtjukebox` repository. A new standalone local voting agent MVP has been added under:

`tools/local-voting-agent`

This tool is intentionally separate from the mobile app. It is meant to run on the broadcast computer, not inside the React Native mobile app.

The current MVP is local/mock-backed. It does not yet connect to the real RadioTEDU backend or the live mobile app. The next job is to inspect the existing backend/mobile contracts and design the safest integration path.

Important operational update:

- The broadcast computer "database" is a plain folder tree of audio files, not SQL.
- Jingles must be supported as separate local audio assets.
- This local Codex session cannot connect to the production/server environment. Run the backend/server work from the server-side Codex session using this prompt.

## What Has Already Been Built

The MVP under `tools/local-voting-agent` includes:

- Node.js + TypeScript + Express + React/Vite app.
- Browser control panel at local dev port `5174`.
- Local API at `4317`.
- JSON local song catalog loading for MVP/dev mode.
- Safe local path validation so songs must live inside configured music roots.
- Random 2 or 3 candidate selection, default 3.
- FFmpeg/ffprobe helper functions for command construction and metadata parsing.
- Mock in-memory voting round engine.
- Anti-cheat basics:
  - one active vote per user per round
  - vote changes update the same row
  - reward key only for first accepted vote
  - locked rounds reject votes
  - votes for non-candidates are rejected
- No-vote fallback does not expose user-facing "randomly selected" copy.
- Winner attribution can show voter attribution when a real user vote decides the winner.
- Panel styling follows the RadioTEDU mobile theme:
  - background `#121212`
  - primary `#E31E24`
  - card `#181818`
  - surface `#1E1E1E`
  - text `#FFFFFF`
  - muted text `#A0A0A0`

Verification already passed locally before this was vendored into `rtjukebox`:

```powershell
cd tools/local-voting-agent
npm test
npm run build
```

Expected current test coverage in the tool: 27 tests.

## Product Rules

Keep these rules unless the project owner explicitly changes them:

- The local voting agent stays separate from the mobile app.
- Do not put the local agent under `mobile/`.
- Candidate songs come from the broadcast computer local song database/catalog.
- Treat that local database as a plain folder tree when implementing the production path.
- Candidate songs are randomly selected.
- 2 or 3 candidates are supported, default 3.
- Album art should be shown when available.
- Jingles are separate assets, not voting candidates.
- The first production jingle behavior should support an optional jingle before the resolved winner.
- If users vote, the UI may show who selected/voted for the winning song.
- If nobody votes and the winner is chosen by fallback, do not show "randomly selected" or equivalent user-facing copy.
- Backend/server timing is authoritative. Client countdowns are display only.
- Mobile clients must never read local filesystem paths from the broadcast computer.
- Agent authentication is required before any real backend command is accepted.

## Important Repo Notes

Before changing backend/mobile code, inspect:

- `backend/src/routes/jukebox.ts`
- `backend/src/services/jukeboxScoring.ts`
- `backend/src/services/gamification.ts`
- `backend/src/sockets/index.ts`
- `backend/src/db/schema.sql`
- `mobile/src/screens/jukebox/JukeboxScreen.tsx`
- `mobile/src/theme/theme.ts`
- `docs/04-jukebox-algorithm.md`
- `docs/06-mobile-screen-flows.md`
- `docs/08-full-project-technical-report.md`
- `tools/local-voting-agent/README.md`

Do not assume the current backend queue/vote model can simply be replaced. Add the next-song voting round path alongside the existing jukebox behavior first.

## Desired Backend Integration Shape

Add a backend-backed voting round system that can later be used by both mobile and the local agent.

Recommended route namespace:

`/api/v1/jukebox/voting`

Recommended concepts:

- `voting_rounds`
- `voting_round_candidates`
- `voting_round_votes`
- `local_agent_devices` or reuse existing jukebox device identity if appropriate
- audit rows for accepted/rejected votes and operator overrides

Recommended round lifecycle:

1. Local agent reports current playback progress.
2. Backend opens a round during the final 60 seconds of the current song.
3. Local agent submits 2 or 3 local candidates with opaque local song ids, title, artist, duration, and safe album art URL/token.
4. Mobile clients receive the active round over Socket.IO.
5. Users vote from mobile.
6. Backend accepts only one active vote per user per round.
7. Backend locks the round during final 10 seconds.
8. Backend resolves:
   - highest vote count wins
   - ties choose from tied candidates
   - no-vote fallback chooses a candidate without user-facing fallback copy
9. Backend sends winner command to the local agent.
10. Agent plays or queues the chosen local song through FFmpeg/broadcast pipeline.

Folder database model:

- The agent receives a `MUSIC_LIBRARY_DIR`, for example `D:\RadioTEDU\Music`.
- It recursively scans supported audio files such as `.mp3`, `.wav`, `.flac`, `.m4a`, `.aac`, and `.ogg`.
- It should derive title/artist from ffprobe metadata when available.
- If metadata is absent, parse filename as `Artist - Title.ext`; otherwise use the filename as title and `Unknown Artist`.
- It should ignore non-audio files.
- It should apply path safety checks so playback and album-art extraction stay inside configured roots.
- It must not return local filesystem paths to mobile clients or public backend responses.

Jingle model:

- The agent receives a `JINGLE_LIBRARY_DIR`, for example `D:\RadioTEDU\Jingles`.
- Jingles are scanned like songs but marked with `assetRole: "jingle"`.
- Jingles are never included in mobile voting candidates.
- First production behavior should support `JINGLE_BEFORE_WINNER=true`.
- The playback plan should be `jingle -> winning song` when a jingle is available and the option is enabled.
- If no jingle exists or the option is disabled, the playback plan should be just `winning song`.
- The operator panel should show the planned playback order before live playback starts.
- Keep live playback disabled by default; dry-run should preview FFmpeg commands.

## Suggested API Contracts

Agent auth:

- `POST /api/v1/jukebox/voting/agent/register`
- `POST /api/v1/jukebox/voting/agent/heartbeat`
- `POST /api/v1/jukebox/voting/agent/playback-progress`
- `POST /api/v1/jukebox/voting/agent/rounds`
- `GET /api/v1/jukebox/voting/agent/commands`
- `POST /api/v1/jukebox/voting/agent/commands/:id/ack`

Mobile/user:

- `GET /api/v1/jukebox/voting/rounds/active`
- `POST /api/v1/jukebox/voting/rounds/:roundId/votes`
- `GET /api/v1/jukebox/voting/rounds/:roundId`

Admin/operator:

- `POST /api/v1/jukebox/voting/rounds/:roundId/lock`
- `POST /api/v1/jukebox/voting/rounds/:roundId/resolve`
- `POST /api/v1/jukebox/voting/rounds/:roundId/cancel`
- `POST /api/v1/jukebox/voting/rounds/:roundId/override`

Socket events:

- `next_vote_round_started`
- `next_vote_round_updated`
- `next_vote_round_locked`
- `next_vote_round_resolved`
- `next_vote_round_cancelled`
- `local_agent_status`

Use existing Socket.IO room conventions where possible, likely device-scoped rooms.

## Anti-Cheat Requirements

Implement these server-side, not only in the local agent:

- Authenticated users only for normal mobile voting.
- One active vote per user per round.
- Changing a vote updates the same vote row.
- Votes after backend lock time are rejected.
- Votes for unknown candidate ids are rejected.
- Rate-limit by user, session/device, IP, and fingerprint where existing middleware supports it.
- Award gold/points once per accepted user per round using an idempotency key:
  `round_id:user_id:voting_reward`
- Do not award extra gold/points for changing votes.
- Keep an audit trail for accepted/rejected vote attempts.
- Persist resolution mode internally:
  - `user-vote`
  - `tie-break`
  - `no-vote-fallback`
- Do not expose no-vote fallback as user-facing random attribution.
- Agent requests must authenticate using a device-scoped secret or signed token.
- Agent-submitted local file paths must not be returned to mobile clients.

## Local Agent Follow-Up Work

After backend contracts exist, update `tools/local-voting-agent`:

- Add `src/agent/folderCatalog.ts` for recursive folder scanning.
- Add `src/agent/playbackPlan.ts` for jingle-before-winner playback sequencing.
- Add `src/agent/backendClient.ts` with typed methods for the real backend.
- Keep the current mock API for local dry-run/dev mode.
- Add env vars:
  - `RADIOTEDU_BACKEND_URL`
  - `RADIOTEDU_AGENT_ID`
  - `RADIOTEDU_AGENT_SECRET`
  - `RADIOTEDU_DEVICE_ID`
  - `MUSIC_LIBRARY_DIR`
  - `JINGLE_LIBRARY_DIR`
  - `JINGLE_BEFORE_WINNER`
- Add retry/backoff for backend connectivity.
- Add command polling or Socket.IO client for winner commands.
- Add explicit operator state for disconnected, connected, round-open, locked, resolved, playback-error.
- Keep playback dry-run by default.

Local agent tests to add before implementation:

- Folder scanner recursively loads supported audio files and ignores non-audio files.
- Folder scanner marks normal music as `assetRole: "song"`.
- Jingle folder scanner marks jingles as `assetRole: "jingle"`.
- Candidate selection never returns `assetRole: "jingle"`.
- Playback plan returns `[jingle, winner]` when jingle-before-winner is enabled and jingles exist.
- Playback plan returns `[winner]` when jingle-before-winner is disabled or no jingles exist.
- API state exposes a playback plan preview without leaking local filesystem paths to public/mobile responses.

## Mobile Follow-Up Work

After backend endpoints are stable:

- Add a next-song voting surface to the existing Jukebox/mobile flow.
- Reuse `mobile/src/theme/theme.ts` tokens.
- Show album art, title, artist, vote count, and lock/countdown state.
- Show voter attribution only when a user vote decides the winner.
- Do not show random fallback copy for no-vote rounds.
- Show gold/points feedback after an accepted vote.

## Implementation Strategy

Do this in phases. Do not wire everything at once.

Phase 1:

- Backend schema and pure helper tests for round resolution, vote idempotency, lock behavior, no-vote fallback copy, tie-break behavior.

Phase 2:

- Backend HTTP routes and Socket.IO events using tests.

Phase 3:

- Agent folder scanner, jingle playback plan, and backend client in `tools/local-voting-agent` while preserving mock mode.

Phase 4:

- Mobile UI integration.

Phase 5:

- End-to-end smoke test on staging/server.

## Verification Commands

Use package-local commands. Do not claim pass unless run in the current session.

Backend:

```powershell
cd backend
npm test
npm run build
```

Local agent:

```powershell
cd tools/local-voting-agent
npm install
npm test
npm run build
```

When working on folder/jingle support, also manually smoke-test with server-side folders:

```powershell
cd tools/local-voting-agent
$env:MUSIC_LIBRARY_DIR="D:\RadioTEDU\Music"
$env:JINGLE_LIBRARY_DIR="D:\RadioTEDU\Jingles"
$env:JINGLE_BEFORE_WINNER="true"
npm run dev
```

Mobile, only if mobile code is changed:

```powershell
cd mobile
npm test
```

## Deliverables

For the first server-side pass, produce:

- Backend voting-round design or implementation plan.
- Database migration/schema changes if implementation is approved.
- Tests for winner resolution, lock behavior, vote idempotency, and no-vote fallback without public random copy.
- Backend route/socket contract documentation.
- Local agent folder-database and jingle integration notes.
- A clear note of what remains before production use.

## Safety

- Do not delete or reset existing production data.
- Do not expose local filesystem paths to mobile or public web responses.
- Do not store raw agent secrets in committed files.
- Do not run destructive database commands without an explicit backup/restore plan.
- Keep the local agent dry-run by default until the operator explicitly enables live playback.
