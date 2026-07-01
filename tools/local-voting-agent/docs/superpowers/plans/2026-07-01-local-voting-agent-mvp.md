# Local Voting Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate local RadioTEDU voting-agent repository with a local song catalog, FFmpeg/ffprobe command support, mock voting rounds, anti-cheat guardrails, and a browser control panel.

**Architecture:** The new repo is independent from `rtjukebox`. The local agent owns song discovery, album-art metadata, playback command construction, and a localhost panel. Backend integration is represented by typed interfaces and a mock in-memory round engine so the real mobile backend can be connected after its contract is agreed.

**Tech Stack:** Node.js, TypeScript, Express, React, Vite, Vitest, FFmpeg/ffprobe via `child_process.spawn`, JSON local song catalog for the first local database shape.

## Global Constraints

- Repository path: `C:\Users\akgul\Downloads\radiotedu-local-voting-agent`.
- Branch: `codex/local-voting-agent-mvp`.
- Backend does not connect to the existing mobile backend in this MVP.
- Candidate songs come from the local computer catalog and are randomly selected.
- Candidate count is configurable as 2 or 3, defaulting to 3.
- Album art is visible when available and falls back to branded local UI when unavailable.
- No-vote random fallback must not display user-facing "randomly selected" copy.
- User-voted winners may show selector/voter attribution.
- Anti-cheat guardrails include one active vote per user per round, backend/engine authoritative lock state, idempotent voting reward markers, candidate validation, and local path validation.
- UI matches the RadioTEDU mobile theme: background `#121212`, primary `#E31E24`, card `#181818`, surface `#1E1E1E`, text `#FFFFFF`, muted text `#A0A0A0`, border `rgba(255, 255, 255, 0.1)`.

---

## File Structure

- `package.json`: scripts, dependencies, and workspace-level metadata.
- `tsconfig.json`: shared TypeScript settings for agent, server, and web.
- `vite.config.ts`: Vite React build and Vitest configuration.
- `index.html`: web entry point.
- `data/songs.sample.json`: sample local song catalog.
- `src/agent/types.ts`: shared domain types.
- `src/agent/config.ts`: config loading and candidate count normalization.
- `src/agent/pathSafety.ts`: local music/art directory path validation.
- `src/agent/songCatalog.ts`: JSON catalog loading and filtering.
- `src/agent/candidateSelection.ts`: deterministic random candidate selection with injected RNG.
- `src/agent/ffmpeg.ts`: ffprobe/ffmpeg command builders and metadata parsing helpers.
- `src/agent/roundEngine.ts`: in-memory voting round engine and anti-cheat rules.
- `src/server/app.ts`: Express API for panel actions.
- `src/server/index.ts`: local server entry point.
- `src/web/App.tsx`: browser control panel.
- `src/web/main.tsx`: React entry point.
- `src/web/styles.css`: RadioTEDU-aligned panel styling.
- `src/**/*.test.ts`: Vitest coverage for each behavior-bearing module.
- `README.md`: setup, FFmpeg requirements, and MVP scope.

---

### Task 1: Repository Scaffold And Config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/agent/config.test.ts`
- Create: `src/agent/config.ts`
- Create: `src/agent/types.ts`
- Create: `data/songs.sample.json`

**Interfaces:**
- Produces: `normalizeCandidateCount(value: unknown): 2 | 3`
- Produces: `loadAgentConfig(env?: NodeJS.ProcessEnv): AgentConfig`
- Produces: `AgentConfig`, `CatalogSong`, `VotingCandidate`, `VotingRound` types

- [ ] **Step 1: Write the failing config tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadAgentConfig, normalizeCandidateCount } from './config';

describe('agent config', () => {
  it('defaults candidate count to 3', () => {
    expect(normalizeCandidateCount(undefined)).toBe(3);
  });

  it('accepts only 2 or 3 candidates', () => {
    expect(normalizeCandidateCount('2')).toBe(2);
    expect(normalizeCandidateCount(3)).toBe(3);
    expect(normalizeCandidateCount('9')).toBe(3);
  });

  it('loads dry-run playback by default', () => {
    const config = loadAgentConfig({
      LOCAL_SONG_CATALOG: 'data/songs.sample.json',
      MUSIC_ROOTS: 'C:/Music;D:/Radio',
    });

    expect(config.playbackMode).toBe('dry-run');
    expect(config.musicRoots).toEqual(['C:/Music', 'D:/Radio']);
    expect(config.candidateCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/config.test.ts`

Expected: FAIL with a module resolution error for `./config`.

- [ ] **Step 3: Create scaffold and minimal config implementation**

Create `package.json` with scripts: `dev`, `dev:server`, `build`, `test`, `preview`.

Create `src/agent/types.ts` with `AgentConfig`, `CatalogSong`, `VotingCandidate`, `VotingRound`, `RoundResolutionMode`, and `VoteRecord`.

Create `src/agent/config.ts`:

```ts
export function normalizeCandidateCount(value: unknown): 2 | 3 {
  return Number(value) === 2 ? 2 : 3;
}
```

Then add `loadAgentConfig` using environment defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/config.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig.json vite.config.ts index.html data/songs.sample.json src/agent/config.ts src/agent/config.test.ts src/agent/types.ts
git commit -m "chore: scaffold local voting agent"
```

---

### Task 2: Local Catalog And Candidate Selection

**Files:**
- Create: `src/agent/pathSafety.test.ts`
- Create: `src/agent/pathSafety.ts`
- Create: `src/agent/songCatalog.test.ts`
- Create: `src/agent/songCatalog.ts`
- Create: `src/agent/candidateSelection.test.ts`
- Create: `src/agent/candidateSelection.ts`

**Interfaces:**
- Consumes: `CatalogSong`, `VotingCandidate`
- Produces: `isPathInsideRoots(filePath: string, roots: string[]): boolean`
- Produces: `loadSongCatalog(catalogPath: string, musicRoots: string[]): CatalogSong[]`
- Produces: `selectRandomCandidates(songs: CatalogSong[], count: 2 | 3, rng?: () => number): VotingCandidate[]`

- [ ] **Step 1: Write failing tests for safe paths, catalog loading, and deterministic candidate selection**

```ts
expect(isPathInsideRoots('C:/Music/song.mp3', ['C:/Music'])).toBe(true);
expect(isPathInsideRoots('C:/Windows/secret.mp3', ['C:/Music'])).toBe(false);
```

```ts
const candidates = selectRandomCandidates(songs, 2, () => 0);
expect(candidates.map((candidate) => candidate.songId)).toEqual(['song-1', 'song-2']);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/agent/pathSafety.test.ts src/agent/songCatalog.test.ts src/agent/candidateSelection.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement safe local catalog behavior**

Use Node `fs`, `path`, and `crypto.randomUUID`. Reject catalog entries whose `filePath` is outside configured music roots. Filter out disabled songs. Map selected songs into candidates with album-art URL fallback left nullable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/agent/pathSafety.test.ts src/agent/songCatalog.test.ts src/agent/candidateSelection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/agent/pathSafety.ts src/agent/pathSafety.test.ts src/agent/songCatalog.ts src/agent/songCatalog.test.ts src/agent/candidateSelection.ts src/agent/candidateSelection.test.ts
git commit -m "feat: load local catalog candidates"
```

---

### Task 3: FFmpeg And Metadata Command Support

**Files:**
- Create: `src/agent/ffmpeg.test.ts`
- Create: `src/agent/ffmpeg.ts`

**Interfaces:**
- Consumes: `CatalogSong`
- Produces: `buildFfprobeMetadataArgs(filePath: string): string[]`
- Produces: `parseFfprobeMetadata(stdout: string): { title?: string; artist?: string; durationSeconds?: number }`
- Produces: `buildAlbumArtExtractionArgs(inputPath: string, outputPath: string): string[]`
- Produces: `buildPlaybackArgs(filePath: string): string[]`

- [ ] **Step 1: Write failing command-builder tests**

```ts
expect(buildPlaybackArgs('C:/Music/song.mp3')).toEqual([
  '-hide_banner',
  '-nostdin',
  '-re',
  '-i',
  'C:/Music/song.mp3',
  '-f',
  'null',
  '-',
]);
```

```ts
const metadata = parseFfprobeMetadata(JSON.stringify({
  format: { duration: '123.45', tags: { title: 'Track', artist: 'Artist' } },
}));
expect(metadata).toEqual({ title: 'Track', artist: 'Artist', durationSeconds: 123 });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/agent/ffmpeg.test.ts`

Expected: FAIL because `./ffmpeg` does not exist.

- [ ] **Step 3: Implement FFmpeg helpers**

Build argument arrays only. Do not start live playback in tests. Parse invalid ffprobe JSON into an empty object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/agent/ffmpeg.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/agent/ffmpeg.ts src/agent/ffmpeg.test.ts
git commit -m "feat: add ffmpeg command helpers"
```

---

### Task 4: Mock Voting Round Engine With Anti-Cheat

**Files:**
- Create: `src/agent/roundEngine.test.ts`
- Create: `src/agent/roundEngine.ts`

**Interfaces:**
- Consumes: `VotingCandidate`, `VotingRound`, `VoteRecord`
- Produces: `createVotingRound(candidates: VotingCandidate[], now?: Date): VotingRound`
- Produces: `submitVote(round: VotingRound, input: { userId: string; candidateId: string; now?: Date }): { round: VotingRound; accepted: boolean; rewardKey?: string; reason?: string }`
- Produces: `lockRound(round: VotingRound, now?: Date): VotingRound`
- Produces: `resolveRound(round: VotingRound, rng?: () => number): VotingRound`
- Produces: `getWinnerAttribution(round: VotingRound): string | null`

- [ ] **Step 1: Write failing anti-cheat and attribution tests**

```ts
const first = submitVote(round, { userId: 'u1', candidateId: 'c1' });
const second = submitVote(first.round, { userId: 'u1', candidateId: 'c2' });
expect(second.round.votes).toHaveLength(1);
expect(second.rewardKey).toBeUndefined();
```

```ts
const resolved = resolveRound(roundWithNoVotes, () => 0);
expect(resolved.resolutionMode).toBe('no-vote-fallback');
expect(getWinnerAttribution(resolved)).toBeNull();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/agent/roundEngine.test.ts`

Expected: FAIL because `./roundEngine` does not exist.

- [ ] **Step 3: Implement the in-memory round engine**

Use immutable updates. Reject unknown candidates and locked rounds. Return a reward key only for the first accepted vote by a user in a round. Persist the selected winner id during resolution.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/agent/roundEngine.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/agent/roundEngine.ts src/agent/roundEngine.test.ts
git commit -m "feat: add mock voting round engine"
```

---

### Task 5: Local API And Browser Panel

**Files:**
- Create: `src/server/app.test.ts`
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/web/main.tsx`
- Create: `src/web/App.tsx`
- Create: `src/web/styles.css`

**Interfaces:**
- Consumes: config, catalog, candidate selection, round engine
- Produces: `createApp(options: CreateAppOptions): express.Express`
- Produces endpoints: `GET /api/state`, `POST /api/rounds/start`, `POST /api/rounds/:roundId/votes`, `POST /api/rounds/:roundId/lock`, `POST /api/rounds/:roundId/resolve`

- [ ] **Step 1: Write failing API tests**

```ts
const response = await request(app).post('/api/rounds/start').send({ candidateCount: 2 });
expect(response.status).toBe(201);
expect(response.body.round.candidates).toHaveLength(2);
```

```ts
const vote = await request(app).post(`/api/rounds/${roundId}/votes`).send({ userId: 'user-1', candidateId });
expect(vote.body.rewardKey).toContain('user-1:voting_reward');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/server/app.test.ts`

Expected: FAIL because `./app` does not exist.

- [ ] **Step 3: Implement Express API and React panel**

The panel should show current connection state, candidate-count segmented control, candidate cards with album art or fallback, vote totals, lock/resolve controls, winner line, and a dry-run FFmpeg playback command preview. Use the RadioTEDU mobile color tokens from Global Constraints.

- [ ] **Step 4: Run focused tests and build**

Run: `npm test -- src/server/app.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add src/server src/web
git commit -m "feat: add local voting panel"
```

---

### Task 6: Documentation And Final Verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: setup and operation instructions for the separate repo

- [ ] **Step 1: Write README**

Document:

- Install: `npm install`
- Run dev server: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- FFmpeg requirement: `ffmpeg` and `ffprobe` must be on PATH or configured later by env.
- Backend status: real RadioTEDU backend integration is intentionally not connected in this MVP.
- Safety status: playback is dry-run by default.

- [ ] **Step 2: Run full verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: build exits 0.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: document local voting agent"
```
