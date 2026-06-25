# Fallback Jukebox Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-account fallback jukebox website that lets visitors choose songs tomorrow while using the existing backend queue contracts.

**Architecture:** Reuse the existing React/Vite `jukebox-web-controller` and backend `/api/v1/jukebox` routes. The fallback creates or restores an anonymous guest session through `/api/v1/auth/guest`, uses the existing guest fingerprint helper, and posts song selections to the backend queue.

**Tech Stack:** React, TypeScript, Vite, Axios, Socket.IO client, Express, Vitest.

## Global Constraints

- Do not make this the released product surface; keep it framed as a fallback chooser.
- Do not bypass backend queue, guest-limit, scoring, device, or socket logic.
- Do not require visitors to create or sign into an account before selecting songs.
- Preserve existing admin/member behavior where it already works.
- Do not revert unrelated worktree changes.
- Verify with package-local commands before claiming readiness.

---

## File Structure

- Modify `jukebox-web-controller/src/App.tsx`: auto guest session, fallback-first visitor flow, song chooser behavior, queue refresh.
- Modify `jukebox-web-controller/src/jukeboxCatalog.ts`: keep queue payload helpers as the contract boundary for selectable songs.
- Modify `jukebox-web-controller/src/guestFingerprint.ts`: add or reuse helper APIs for stable anonymous request headers.
- Add or modify `jukebox-web-controller/src/fallbackGuestSession.ts`: focused helper for reading, validating, creating, and storing anonymous fallback sessions.
- Add `jukebox-web-controller/src/fallbackGuestSession.test.ts`: test guest-session persistence and creation behavior without rendering the app.
- Modify `backend/src/routes/jukeboxQueueContract.test.ts` or `backend/src/routes/jukeboxGuestLimit.test.ts`: prove guest queue adds remain allowed through the intended auth path.
- Modify backend route code only if tests show the current contract cannot support tomorrow's no-account fallback.

### Task 1: Anonymous Fallback Session Helper

**Files:**
- Create: `jukebox-web-controller/src/fallbackGuestSession.ts`
- Test: `jukebox-web-controller/src/fallbackGuestSession.test.ts`

**Interfaces:**
- Consumes: `axios.post`, browser `localStorage`
- Produces: `ensureFallbackGuestSession(apiRoot, storage, postGuest?)`

- [ ] **Step 1: Write the failing test**

```ts
it('reuses a stored fallback guest session', async () => {
  const storage = createStorage({
    fallback_guest_session: JSON.stringify({
      user: { id: 'guest-1', display_name: 'Misafir', is_guest: true, role: 'guest', total_songs_added: 0 },
      access_token: 'token-1',
    }),
  });

  const postGuest = vi.fn();

  await expect(ensureFallbackGuestSession('http://api.test', storage, postGuest)).resolves.toMatchObject({
    access_token: 'token-1',
    user: { id: 'guest-1', is_guest: true },
  });
  expect(postGuest).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/fallbackGuestSession.test.ts` from `jukebox-web-controller`.
Expected: FAIL because `fallbackGuestSession.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export const FALLBACK_GUEST_SESSION_STORAGE_KEY = 'fallback_guest_session';

export async function ensureFallbackGuestSession(apiRoot, storage = window.localStorage, postGuest = defaultPostGuest) {
  const stored = readStoredFallbackGuestSession(storage);
  if (stored) return stored;
  const session = await postGuest(apiRoot);
  storage.setItem(FALLBACK_GUEST_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/fallbackGuestSession.test.ts`.
Expected: PASS.

### Task 2: Fallback-First Web Controller Flow

**Files:**
- Modify: `jukebox-web-controller/src/App.tsx`
- Test: `jukebox-web-controller/src/fallbackGuestSession.test.ts`

**Interfaces:**
- Consumes: `ensureFallbackGuestSession`, existing `connectToDevice`, `buildQueueRequestPayload`, `buildGuestQueueHeaders`
- Produces: a first-run flow that starts as guest without requiring account input

- [ ] **Step 1: Write the failing test**

```ts
it('creates a guest session with a fallback display name when none is stored', async () => {
  const storage = createStorage();
  const postGuest = vi.fn().mockResolvedValue({
    user: { id: 'guest-2', display_name: 'Jukebox Guest', is_guest: true, role: 'guest', total_songs_added: 0 },
    access_token: 'token-2',
  });

  const session = await ensureFallbackGuestSession('http://api.test', storage, postGuest);

  expect(postGuest).toHaveBeenCalledWith('http://api.test');
  expect(session.user.display_name).toBe('Jukebox Guest');
  expect(storage.getItem(FALLBACK_GUEST_SESSION_STORAGE_KEY)).toContain('token-2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/fallbackGuestSession.test.ts`.
Expected: FAIL until guest creation is implemented.

- [ ] **Step 3: Implement the flow**

Use `ensureFallbackGuestSession(API_URL)` during startup when no real user token is present. Store the returned token under the existing `token` key and set the existing `user` state so `addToQueue` can keep using the current queue path.

- [ ] **Step 4: Run focused web tests**

Run: `npm test -- src/fallbackGuestSession.test.ts src/jukeboxCatalog.test.ts src/guestFingerprint.test.ts`.
Expected: PASS.

### Task 3: Song Chooser Polish

**Files:**
- Modify: `jukebox-web-controller/src/App.tsx`
- Modify: `jukebox-web-controller/src/App.css`

**Interfaces:**
- Consumes: existing `searchSongs`, `addToQueue`, queue state
- Produces: visible, clickable song results and clear fallback status

- [ ] **Step 1: Add focused tests if helper logic changes**

If selection logic moves out of `App.tsx`, add a helper test before production code. If only JSX/CSS changes, rely on build and browser smoke because the repo has no React DOM test harness.

- [ ] **Step 2: Implement the UI changes**

Make the default screen emphasize device code, search, and song results. Keep login/admin access available but secondary. Keep button text short enough for mobile.

- [ ] **Step 3: Run web build checks**

Run: `npm run lint`, `npm test`, and `npm run build` from `jukebox-web-controller`.
Expected: exit code 0 for all three.

### Task 4: Backend Contract Check

**Files:**
- Modify only if needed: `backend/src/routes/jukebox.ts`
- Modify only if needed: `backend/src/routes/jukeboxGuestLimit.test.ts`
- Modify only if needed: `backend/src/routes/jukeboxQueueContract.test.ts`

**Interfaces:**
- Consumes: existing guest auth and queue logic
- Produces: verified backend support for guest song selection

- [ ] **Step 1: Run focused backend tests**

Run: `npm test -- src/routes/jukeboxGuestLimit.test.ts src/routes/jukeboxQueueContract.test.ts` from `backend`.
Expected: PASS or a failure that identifies the missing guest fallback contract.

- [ ] **Step 2: If the contract fails, write the failing test first**

Add a test proving a guest token plus `x-guest-fingerprint` can add one valid song and receives the guest-limit error on a second same-day add.

- [ ] **Step 3: Implement only the minimal backend fix**

Keep auth required for queue mutation, but allow authenticated guest users through the queue add path and preserve `enforceGuestDailySongLimit`.

- [ ] **Step 4: Run backend verification**

Run: `npm test -- src/routes/jukeboxGuestLimit.test.ts src/routes/jukeboxQueueContract.test.ts` and `npm run build`.
Expected: exit code 0.

### Task 5: Runtime Smoke

**Files:**
- No source edits expected.

**Interfaces:**
- Consumes: backend dev server, Vite dev server or built controller served by backend
- Produces: evidence that songs are choosable through the website and backend wiring works

- [ ] **Step 1: Start backend with configured database**

Run the package-local backend start command documented in the verification report. If a database is unavailable, report that runtime smoke is blocked and keep test/build evidence separate.

- [ ] **Step 2: Open the fallback website**

Use `/controller?device=<known active device code>` when a known code exists, otherwise enter an active device code from `GET /api/v1/jukebox/devices`.

- [ ] **Step 3: Search and select a song**

Search a known term, select a visible result, and confirm the queue updates in the UI or by `GET /api/v1/jukebox/queue/:deviceId`.

- [ ] **Step 4: Final verification audit**

Map the original goal to evidence: website exists, no account required, fallback-only framing, backend wired, songs searchable, songs selectable, and verification commands inspected.
