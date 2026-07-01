# Local Voting Agent Design

## Goal

Build a separate local program for the RadioTEDU broadcast computer that lets mobile users vote on the next song while keeping local music files and playback control on the broadcast machine.

The local program should run as a small agent with a browser-based control panel. It should use FFmpeg and ffprobe for local playback/metadata work, choose random candidate songs from the computer's local song database, show album art, and preserve the visual language of the RadioTEDU mobile app.

## Product Decisions

- The voting system is a separate program, not logic embedded directly into the current broadcast wall.
- The separate program uses a local agent plus web panel model.
- Candidate songs come from the broadcast computer's local song database.
- Candidate songs are selected randomly by the local side.
- Each voting round should present either 2 or 3 candidates. The panel should allow this to be configured, with 3 as the default.
- Album art must be visible for each candidate when available.
- The app must show who selected the winning song when a user vote decides the result.
- If no one votes and the winner is chosen randomly, the UI must not display a "randomly selected" attribution message.
- If a tie is resolved by drawing from tied candidates, the result may show that the song won by tie-break, but it should still avoid making random fallback feel like an error state.
- Users earn gold/points for voting, with one award per voting round.
- The mobile voting UI should match the existing mobile app design.

## Architecture

The backend remains the source of truth for voting, user identity, gold/points awards, and real-time state. The local agent remains the source of truth for local song discovery, local media metadata, FFmpeg playback, and the broadcast-machine connection.

The local agent runs on the broadcast computer and exposes a local web panel. The panel shows connection status, the current song, upcoming vote round state, candidate count, candidates with album art, recent winners, and playback/broadcast health. The panel is operational software, not a marketing page.

The backend receives voting-round candidate payloads from the agent, publishes vote state to mobile clients over Socket.IO, closes/locks rounds according to the song timing rules, resolves the winner, awards gold/points, and sends the result back to the agent.

Mobile clients never read the broadcast computer's filesystem. They only call authenticated backend APIs and subscribe to backend socket events.

## Runtime Components

### Local Agent

The agent should:

- Connect to the local song database.
- Pick random eligible songs for each round.
- Use ffprobe to extract duration, artist/title metadata, and embedded album art when available.
- Generate or cache album-art files for the voting UI.
- Use FFmpeg to play or hand off the winning song to the local broadcast pipeline.
- Report current-song/progress state to the backend.
- Receive the resolved next-song result from the backend.
- Expose a browser panel on localhost for operators.

### Backend

The backend should add a voting-round layer next to the existing jukebox queue/vote model rather than replacing all current queue behavior at once.

It should manage:

- Round creation from agent-provided candidates.
- Round timing: open during the final 60 seconds of the current song.
- Vote lock: close voting during the final 10 seconds.
- One active vote per user per round.
- Gold/points awards for voting.
- Winner resolution:
  - Highest vote count wins.
  - Ties are resolved by selecting from tied candidates.
  - No-vote rounds are resolved by random candidate selection.
- Result attribution:
  - User-voted winner: show selector/voter attribution.
  - Tie-break winner: show tie-break status only if product copy wants it.
  - No-vote random winner: do not show a random-selection message.

### Mobile App

The mobile app should add a next-song voting surface using existing app conventions:

- Dark background: `#121212`.
- RadioTEDU red: `#E31E24`.
- Existing card/surface/text-muted patterns from `mobile/src/theme/theme.ts`.
- Album-art-led candidate cards.
- Clear countdown and lock state.
- Gold/points feedback after a vote.
- Winner attribution when a user-voted song wins.

The mobile UI should feel like a native part of the current app, not a separate mini-site.

## Data Flow

1. The local agent reports the currently playing song and progress to the backend.
2. When the current song enters its final 60 seconds, the agent/backend opens a new voting round.
3. The agent selects 2 or 3 random eligible candidates from the local song database.
4. The agent extracts or provides album-art URLs/assets for those candidates.
5. The backend publishes the round to mobile clients.
6. Users vote from the mobile app.
7. Each accepted vote updates live totals and awards gold/points once for that round.
8. At the final 10 seconds, the backend locks the round.
9. The backend resolves the winner.
10. The backend sends the winner to the agent.
11. The agent plays or queues the winning song through FFmpeg.
12. The mobile app and panel show the winner. If the winner came from no-vote random fallback, no random-selection attribution text is shown.

## Events And API Shape

Exact names can follow existing backend/socket conventions during implementation, but the feature needs these contract surfaces:

- Agent to backend: register agent/device.
- Agent to backend: report current song and playback progress.
- Agent to backend: create/update voting round candidates.
- Backend to mobile: voting round started/updated/locked/resolved.
- Mobile to backend: submit/change vote.
- Backend to agent: winner resolved / play next song.
- Backend to panel/mobile: gold/points award result.

## Error Handling

- If the local song database is unavailable, the panel shows a local-library error and the backend should avoid opening new rounds.
- If album art extraction fails, the candidate uses a branded fallback cover.
- If FFmpeg playback fails, the panel shows a playback error and the agent should not report a false successful handoff.
- If the backend connection drops, the agent keeps local playback stable and reconnects.
- If the round cannot be resolved before the song ends, the agent should fall back to a local random eligible song while avoiding user-facing random attribution copy.

## Testing

Backend tests should cover winner resolution, no-vote fallback without attribution text, tie-break behavior, vote idempotency, and gold/points awards.

Agent tests should cover local database candidate selection, 2/3 candidate configuration, ffprobe metadata parsing, album-art fallback, and playback command construction without invoking destructive local playback in unit tests.

Mobile tests should cover voting states, locked state, candidate rendering with album art, winner attribution, and no random-selection copy for no-vote fallback.

Integration testing should simulate one full song ending: current-song progress, round open, user votes, lock, winner resolution, agent handoff, and visible mobile/panel update.

## Open Scope Boundary

This design does not require replacing the whole existing jukebox queue in one step. The first implementation should add the voting-round path alongside the current jukebox system, then migrate or merge behaviors once the local agent is reliable.
