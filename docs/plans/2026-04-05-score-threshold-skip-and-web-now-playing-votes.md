# Score Threshold Skip And Web Now-Playing Votes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move jukebox auto-skip to a visible `song_score <= -5` rule and allow voting on the currently playing song in the web app.

**Architecture:** Keep the backend vote endpoint as the single source of truth. Apply the new skip threshold after score recomputation, then reuse the existing socket updates so kiosk, mobile, and web stay in sync. In the web app, extract small now-playing vote helpers and render the same controls already used for queue items.

**Tech Stack:** Express, PostgreSQL, Socket.IO, React, TypeScript, Vitest/Jest.

---

### Task 1: Lock the new skip rule with failing backend tests

**Files:**
- Modify: `backend/src/routes/jukeboxVoteScoring.test.ts`
- Modify: `backend/src/routes/jukeboxPlaybackDispatch.test.ts`

**Step 1: Write the failing tests**

- Add a route-level contract test that expects a queue item to become skipped when recomputed `song_score` reaches `-5`.
- Add a playing-item case that expects the playing item to be skipped and device state cleared.

**Step 2: Run test to verify it fails**

Run: `cd E:\rtmusicbox\backend && npx vitest run src/routes/jukeboxVoteScoring.test.ts src/routes/jukeboxPlaybackDispatch.test.ts`

**Step 3: Implement the minimal backend fix**

- Update the vote route in `backend/src/routes/jukebox.ts` to use `song_score <= -5`.
- Reuse the existing socket emit and device cleanup path for playing items.

**Step 4: Run test to verify it passes**

Run the same command and confirm green.

### Task 2: Lock now-playing web vote behavior with failing tests

**Files:**
- Create: `jukebox-web-controller/src/nowPlayingVotes.ts`
- Create: `jukebox-web-controller/src/nowPlayingVotes.test.ts`
- Modify: `jukebox-web-controller/src/App.tsx`

**Step 1: Write the failing tests**

- Add helper tests for:
  - deriving current vote state for now-playing items
  - exposing the displayed song score
  - enabling/disabling supervote via existing daily rule

**Step 2: Run test to verify it fails**

Run: `cd E:\rtmusicbox\jukebox-web-controller && npx vitest run src/nowPlayingVotes.test.ts`

**Step 3: Implement the minimal web fix**

- Add helper(s) for now-playing vote rendering.
- Render vote buttons in the now-playing hero and wire them to `handleVote`.

**Step 4: Run test to verify it passes**

Run the same Vitest command and confirm green.

### Task 3: Verify integrated behavior

**Files:**
- Modify only if verification reveals a contract gap

**Step 1: Run focused verification**

Run:
- `cd E:\rtmusicbox\backend && npx vitest run src/routes/jukeboxVoteScoring.test.ts src/routes/jukeboxPlaybackDispatch.test.ts`
- `cd E:\rtmusicbox\jukebox-web-controller && npx vitest run src/nowPlayingVotes.test.ts`
- `cd E:\rtmusicbox\jukebox-web-controller && npm run build`

**Step 2: Live smoke if needed**

- Keep backend and Vite running.
- Open the web jukebox, vote on a now-playing song, and verify socket updates.

**Step 3: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/routes/jukeboxVoteScoring.test.ts backend/src/routes/jukeboxPlaybackDispatch.test.ts jukebox-web-controller/src/App.tsx jukebox-web-controller/src/nowPlayingVotes.ts jukebox-web-controller/src/nowPlayingVotes.test.ts docs/plans/2026-04-05-score-threshold-skip-and-web-now-playing-votes-design.md docs/plans/2026-04-05-score-threshold-skip-and-web-now-playing-votes.md
git commit -m "feat: add score threshold skip and web now-playing votes"
```
