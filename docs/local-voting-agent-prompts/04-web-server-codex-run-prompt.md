# Web Server Codex Prompt: Next-Song Voting Backend

Paste this into Codex on the web server checkout of `rtjukebox`.

```text
You are working in the `rtjukebox` web server/backend repository.

Goal: implement the backend side of RadioTEDU next-song voting as a separate feature from the existing Jukebox queue. Do not put this under existing Jukebox queue behavior except for shared auth/socket/gamification helpers where appropriate.

Current client contracts already exist in this branch:
- Mobile service: `mobile/src/services/nextSongVote.ts`
- Mobile UI: `mobile/src/screens/next-song-vote/NextSongVoteScreen.tsx`
- Local broadcast agent backend client: `tools/local-voting-agent/src/agent/backendClient.ts`

Implement the server namespace:
- `GET /api/v1/next-song-voting/rounds/active`
- `GET /api/v1/next-song-voting/rounds/:roundId`
- `POST /api/v1/next-song-voting/rounds/:roundId/votes`
- `POST /api/v1/next-song-voting/agent/register`
- `POST /api/v1/next-song-voting/agent/heartbeat`
- `POST /api/v1/next-song-voting/agent/playback-progress`
- `POST /api/v1/next-song-voting/agent/rounds`
- `GET /api/v1/next-song-voting/agent/commands`
- `POST /api/v1/next-song-voting/agent/commands/:id/ack`

Data/model requirements:
- A voting round has 2 or 3 candidates, status `open | locked | resolved | cancelled`, lock/resolve timestamps, winner candidate id, resolution mode `user-vote | tie-break | no-vote-fallback`.
- Candidate payload must include `id`, `songId`, `title`, `artist`, `albumArtUrl`, `votes`.
- Never expose local Windows filesystem paths from the broadcast computer.
- A user can have one active vote per round; changing vote updates the selected candidate.
- Award gold/points idempotently per `(roundId, userId)` using a stable reward key.
- If no one votes, backend may resolve fallback but public/mobile copy must not say “randomly selected” or “rastgele seçildi”.
- Tie result is resolved by backend/agent lottery and must be auditable.
- Agent requests must use device-scoped auth: bearer token plus device id header.

Socket.IO events for mobile clients:
- `next_vote_round_started`
- `next_vote_round_updated`
- `next_vote_round_locked`
- `next_vote_round_resolved`
- `next_vote_round_cancelled`

Implementation guidance:
- Inspect existing backend route/service/socket/auth/gamification patterns before editing.
- Prefer `backend/src/routes/nextSongVoting.ts` and `backend/src/services/nextSongVotingService.ts` or the nearest local convention.
- Add migrations/schema/tests using existing backend test style.
- Keep the existing Jukebox queue endpoints unchanged.

Verification:
- Run the backend test command documented in this repo.
- Run focused tests for next-song voting routes, vote idempotency, agent auth, no local path leakage, socket payload shape, and gold reward idempotency.
- Report exact commands and pass/fail results.
```

