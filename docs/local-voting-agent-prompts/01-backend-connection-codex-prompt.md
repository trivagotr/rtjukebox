# Codex Prompt 1: Backend Connection For Local Voting Agent

Use this prompt in the server-side Codex session for the RadioTEDU `rtjukebox` repository.

## Objective

Connect the local voting agent architecture to the real RadioTEDU backend, without assuming this local Codex session can reach the server. Build the backend-side contract that mobile clients and the Windows/local broadcast agent will use later.

Do not implement Windows playback or mobile UI in this pass. This prompt is only for the backend connection layer.

## Current Context

The local voting agent MVP exists at:

`tools/local-voting-agent`

It currently has:

- TypeScript/Express/React/Vite local tool.
- Mock in-memory voting round engine.
- 2 or 3 candidate voting rounds.
- FFmpeg command helpers.
- Anti-cheat basics in local mock mode.
- No-vote fallback that does not show user-facing random-selection copy.

The broadcast computer music "database" is a plain folder tree, not SQL. Folder scanning and jingle playback are local-agent responsibilities, not backend responsibilities.

## Backend Scope

Add or design backend support for next-song voting rounds alongside the existing jukebox system. Do not replace the current jukebox queue/vote behavior yet.

Recommended namespace:

`/api/v1/jukebox/voting`

Recommended backend concepts:

- `voting_rounds`
- `voting_round_candidates`
- `voting_round_votes`
- `voting_agent_devices` or a safe extension of existing jukebox devices
- audit trail for accepted/rejected vote attempts
- command queue for agent playback commands

## Required Behavior

The backend must:

- Add agent auth: authenticate local agent requests with a device-scoped secret or signed token.
- Accept agent heartbeat/progress updates.
- Accept 2 or 3 agent-submitted candidates for a voting round.
- Store only safe candidate metadata for mobile: title, artist, public/temporary album-art token or URL, opaque local song id.
- Enforce no local paths in public/mobile payloads: never expose local Windows filesystem paths to mobile or public web clients.
- Let authenticated mobile users vote once per round.
- Allow a user to change their vote by updating the same vote row.
- Reject votes after backend lock time.
- Reject votes for non-candidate ids.
- Lock the round in the final 10 seconds.
- Resolve the round:
  - highest vote count wins
  - ties choose from tied candidates
  - no-vote fallback chooses a candidate internally
- Persist internal resolution mode:
  - `user-vote`
  - `tie-break`
  - `no-vote-fallback`
- Never expose no-vote fallback as "randomly selected" user-facing copy.
- Award gold/points at most once per accepted user per round with an idempotency key:
  `round_id:user_id:voting_reward`
- Emit Socket.IO events for mobile and agent consumers.

## Suggested API

Agent endpoints:

- `POST /api/v1/jukebox/voting/agent/register`
- `POST /api/v1/jukebox/voting/agent/heartbeat`
- `POST /api/v1/jukebox/voting/agent/playback-progress`
- `POST /api/v1/jukebox/voting/agent/rounds`
- `GET /api/v1/jukebox/voting/agent/commands`
- `POST /api/v1/jukebox/voting/agent/commands/:id/ack`

Mobile endpoints:

- `GET /api/v1/jukebox/voting/rounds/active`
- `GET /api/v1/jukebox/voting/rounds/:roundId`
- `POST /api/v1/jukebox/voting/rounds/:roundId/votes`

Admin/operator endpoints:

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
- `voting_agent_status`

Use existing Socket.IO room conventions where possible.

## Files To Inspect First

- `backend/src/routes/jukebox.ts`
- `backend/src/services/jukeboxScoring.ts`
- `backend/src/services/gamification.ts`
- `backend/src/sockets/index.ts`
- `backend/src/db/schema.sql`
- `docs/04-jukebox-algorithm.md`
- `docs/06-mobile-screen-flows.md`
- `docs/08-full-project-technical-report.md`
- `tools/local-voting-agent/README.md`

## Implementation Guidance

Use TDD. Start with pure helpers before routes:

- winner resolution
- no-vote fallback without public random copy
- tie-break behavior
- lock-time vote rejection
- one active vote per user per round
- idempotent reward key behavior
- safe mobile payload shape that excludes local file paths

Then add schema/routes/socket events.

Keep route code small. If `backend/src/routes/jukebox.ts` is already large, add focused helper/service files rather than making it more tangled.

## Verification

Run only package-local commands and inspect exit codes:

```powershell
cd backend
npm test
npm run build
```

If local-agent contracts are touched:

```powershell
cd tools/local-voting-agent
npm test
npm run build
```

## Deliverables

- Backend implementation or implementation plan for voting-round contracts.
- Tests for resolution, lock behavior, vote idempotency, and no-vote fallback copy.
- Route/socket contract documentation.
- Clear list of remaining work for Windows agent and mobile UI.

## Safety

- Do not drop, truncate, or reset production data.
- Do not expose local filesystem paths.
- Do not commit secrets.
- Do not connect this local development session to production directly.
