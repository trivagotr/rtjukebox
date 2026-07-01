# Codex Prompt 3: Mobile App Menu For Next-Song Voting

Use this prompt in the Codex session that will update the RadioTEDU mobile app after the backend voting contracts exist.

## Objective

Add a mobile app entry point and voting surface for next-song voting, connected to the backend voting-round API and Socket.IO contract.

Do not implement backend routes here. Do not implement Windows playback here.

## Current Context

The mobile app lives under:

`mobile/`

Relevant files to inspect first:

- `mobile/src/navigation/RootNavigator.tsx`
- `mobile/src/screens/jukebox/JukeboxScreen.tsx`
- `mobile/src/theme/theme.ts`
- `mobile/src/services/api.ts`
- `mobile/src/context/AuthContext.tsx`
- `mobile/src/components/MiniPlayer.tsx`
- `docs/06-mobile-screen-flows.md`
- `tools/local-voting-agent/README.md`

Backend contract should come from Prompt 1. Do not invent final endpoint names if the backend implementation chose different names; adapt to the actual contract.

## UX Goal

Users should be able to enter next-song voting from the mobile app menu/Jukebox area and vote for one of 2 or 3 candidates.

The UI must feel native to the current RadioTEDU mobile design:

- background `#121212`
- primary red `#E31E24`
- card `#181818`
- surface `#1E1E1E`
- text `#FFFFFF`
- muted text `#A0A0A0`
- use existing `COLORS` and `SPACING` tokens from `mobile/src/theme/theme.ts`

## Menu / Navigation Requirement

Add a visible entry point for next-song voting.

Preferred placement:

- inside the existing Jukebox tab/screen as a prominent "Next Song Vote" section or button

Alternative if existing navigation expects a screen:

- add a dedicated `NextSongVoteScreen` under the Jukebox stack/menu

Avoid creating a marketing/landing page. The first screen should be useful: active round, candidates, timer/lock state, and vote controls.

## Voting UI Requirements

Show:

- active round state
- countdown or lock state from backend
- 2 or 3 candidate cards
- album art when available
- title
- artist
- vote count
- user's selected candidate
- gold/points feedback after an accepted vote
- resolved winner

Copy rules:

- If a user-voted winner exists, show voter attribution if backend provides it.
- If nobody voted and backend used fallback, do not show "randomly selected" or equivalent copy.
- Jingles should not appear as voting candidates.

## Data Contract

Use actual backend endpoints from Prompt 1 implementation. Expected shape:

- `GET /api/v1/jukebox/voting/rounds/active`
- `POST /api/v1/jukebox/voting/rounds/:roundId/votes`
- Socket.IO events:
  - `next_vote_round_started`
  - `next_vote_round_updated`
  - `next_vote_round_locked`
  - `next_vote_round_resolved`
  - `next_vote_round_cancelled`

Expected mobile payload fields:

- `roundId`
- `status`: `open`, `locked`, `resolved`, `cancelled`
- `lockAt`
- `endsAt`
- `candidates`
- `candidates[].id`
- `candidates[].title`
- `candidates[].artist`
- `candidates[].albumArtUrl`
- `candidates[].votes`
- `userVoteCandidateId`
- `winnerCandidateId`
- `winnerAttribution`
- `reward`

Do not rely on local Windows file paths. Mobile should only receive safe URLs or public tokens.

## State Handling

Implement states:

- loading
- no active round
- active/open round
- locked round
- resolved round
- network error
- unauthenticated user
- vote accepted
- vote rejected

Vote behavior:

- one active vote per user per round
- changing vote should update the selected candidate
- lock state disables voting
- show backend rejection messages calmly

## Suggested Files

Exact structure depends on the existing app, but likely:

- `mobile/src/screens/jukebox/NextSongVoteScreen.tsx`
- `mobile/src/services/nextSongVotingService.ts`
- `mobile/__tests__/nextSongVotingService.test.ts`
- possibly update `mobile/src/screens/jukebox/JukeboxScreen.tsx`
- possibly update `mobile/src/navigation/RootNavigator.tsx`

Follow existing mobile patterns before adding new abstractions.

## Tests To Add First

Use TDD.

- Service maps active round payload correctly.
- Vote request sends the selected candidate and auth headers.
- No-vote fallback response does not render random-selection copy.
- Locked round disables vote controls.
- Candidate cards render album art/title/artist/votes.
- Jukebox menu entry navigates to or reveals next-song voting.

## Verification

Run mobile-local commands and inspect exit codes:

```powershell
cd mobile
npm test
```

If TypeScript/build commands exist in `mobile/package.json`, run the relevant package-local command as well. Do not claim it passes unless it was run in the current session.

## Deliverables

- Mobile service for voting API.
- Mobile next-song voting UI/menu entry.
- Tests for service and UI behavior.
- Notes for backend contract mismatches, if any.

## Safety

- Do not hard-code production secrets.
- Do not show local file paths.
- Do not show "randomly selected" for no-vote fallback.
- Do not make jingles selectable in mobile voting.
