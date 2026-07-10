# Working Jukebox App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository-side QR guest flow enqueue songs that the kiosk browser plays exactly once and advances in order.

**Architecture:** The backend remains the durable queue authority but does not start Spotify playback when guests enqueue. The kiosk browser is the sole queue playback authority, guarded by queue-item identity and idempotent backend transitions. The guest controller owns one Socket.IO connection per selected device, and production URLs are supplied through kiosk runtime configuration.

**Tech Stack:** TypeScript, Express, PostgreSQL, React 19, Socket.IO, plain browser JavaScript, Spotify Web Playback SDK, Vitest, Vite.

**Execution Status (2026-07-10):** Tasks 1-5 are implemented and independently reviewed. Fresh integrated verification passed for backend tests/build, controller lint/tests/build, and kiosk tests. Production QR/Spotify audio verification remains the separate webserver task.

## Global Constraints

- Implement only the backend, `jukebox-web-controller`, and `kiosk-web` app flow.
- Do not modify mobile code, the untracked `windows-agent/`, or `docs/spotify-cli-spike.md`.
- Do not deploy or change the production webserver.
- Do not add the Windows/CLI playback path or broad security hardening.
- Preserve current playback work on `fix/radiotedu-kiosk-web-playback` while selectively reconciling runtime-config behavior from `origin/codex/fallback-jukebox-website`.
- Write a failing test before each behavioral change and inspect its failing output.
- Do not place Spotify credentials or secret values in source, tests, docs, logs, or output.

---

## File Structure

- Create `jukebox-web-controller/src/socketSession.ts`: small testable owner for one Socket.IO connection and idempotent cleanup.
- Create `jukebox-web-controller/src/socketSession.test.ts`: lifecycle regression coverage without adding a browser test dependency.
- Modify `jukebox-web-controller/src/App.tsx`: key the socket effect only by selected device identity and consume the socket session helper.
- Modify `backend/src/routes/jukebox.ts`: remove enqueue-time Spotify dispatch and make kiosk playback-state transitions conditional/idempotent.
- Modify `backend/src/routes/jukeboxPlaybackDispatch.test.ts`: remove the obsolete queue-add autostart expectation while retaining non-queue dispatch/recovery helper coverage.
- Modify `backend/src/routes/jukeboxSpotifyKiosk.test.ts`: route-level coverage for pending-to-playing, playing-to-played, and duplicate/stale transitions.
- Modify `kiosk-web/playback.js`: expose a queue-item playback-start coordinator.
- Modify `kiosk-web/playback.test.js`: exactly-once start and failed state-report regression coverage.
- Modify `kiosk-web/app.js`: use the coordinator, await/validate state reports, and clear a queue-item guard only after terminal transition success.
- Modify `kiosk-web/config.js` and `kiosk-web/index.html`: load and apply runtime configuration before kiosk config.
- Create `kiosk-web/runtime-config.js`: RadioTEDU public API/site/QR bases.
- Create or modify `kiosk-web/config.test.js`: production subpath, QR, fixed kiosk, and runtime-config coverage.

---

### Task 1: Stable Guest Controller Socket Lifecycle

**Files:**
- Create: `jukebox-web-controller/src/socketSession.ts`
- Create: `jukebox-web-controller/src/socketSession.test.ts`
- Modify: `jukebox-web-controller/src/App.tsx:814`

**Interfaces:**
- Consumes: `Socket` from `socket.io-client` and a zero-argument factory returning that socket.
- Produces: `createSocketSession(factory): { socket: Socket; dispose(): void }`.

- [ ] **Step 1: Write the failing lifecycle test**

Create a test proving the socket remains connected until explicit disposal and that repeated cleanup disconnects once:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createSocketSession } from './socketSession';

describe('createSocketSession', () => {
  it('keeps one socket alive until idempotent disposal', () => {
    const disconnect = vi.fn();
    const socket = { disconnect };
    const factory = vi.fn(() => socket);

    const session = createSocketSession(factory as never);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(session.socket).toBe(socket);
    expect(disconnect).not.toHaveBeenCalled();

    session.dispose();
    session.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
Set-Location jukebox-web-controller
npx vitest run src/socketSession.test.ts
```

Expected: failure because `./socketSession` does not exist.

- [ ] **Step 3: Implement the socket session helper**

Create a minimal helper with idempotent cleanup:

```ts
import type { Socket } from 'socket.io-client';

export function createSocketSession(factory: () => Socket) {
  const socket = factory();
  let disposed = false;

  return {
    socket,
    dispose() {
      if (disposed) return;
      disposed = true;
      socket.disconnect();
    },
  };
}
```

- [ ] **Step 4: Replace the self-triggering effect**

Import `createSocketSession`, derive `const socketDeviceId = device?.id ?? null`, and replace the effect that depends on `[device, socket]` with a session keyed only by `socketDeviceId`:

```ts
useEffect(() => {
  if (!socketDeviceId) {
    setSocket(null);
    return undefined;
  }

  const session = createSocketSession(() => io(SOCKET_URL, {
    path: SOCKET_PATH,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    transports: ['websocket', 'polling'],
  }));
  setSocket(session.socket);

  return () => {
    session.dispose();
    setSocket((current) => current === session.socket ? null : current);
  };
}, [socketDeviceId]);
```

Do not include `socket` in this effect's dependency list. Leave event listener registration in the following effect, which may still depend on `socket` and `device`.

- [ ] **Step 5: Run controller checks and verify GREEN**

Run:

```powershell
npx vitest run src/socketSession.test.ts
npm run lint
npm test
npm run build
```

Expected: all commands exit 0; the lifecycle test reports one passing test.

- [ ] **Step 6: Commit the isolated controller fix**

```powershell
git add -- jukebox-web-controller/src/App.tsx jukebox-web-controller/src/socketSession.ts jukebox-web-controller/src/socketSession.test.ts
git commit -m "fix: stabilize jukebox guest socket lifecycle"
```

---

### Task 2: Backend Queue-Only Enqueue and Idempotent Transitions

**Files:**
- Modify: `backend/src/routes/jukebox.ts:2543`
- Modify: `backend/src/routes/jukebox.ts:3416`
- Modify: `backend/src/routes/jukeboxPlaybackDispatch.test.ts`
- Modify: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`

**Interfaces:**
- Consumes: existing queue item statuses `pending`, `playing`, `played`, `skipped`; existing kiosk playback-state request.
- Produces: queue-add response with `auto_started: false`; conditional state transitions that execute terminal side effects once.

- [ ] **Step 1: Write a failing route test for queue-only enqueue**

Use the existing HTTP/database harness in `jukeboxSpotifyKiosk.test.ts` or the closest existing queue-route integration test. Enqueue one Spotify track on an idle device with an active browser player. Spy on the real dispatch boundary (`spotifyService.transferPlayback` and `spotifyService.playTrack`) and assert:

```ts
expect(response.status).toBe(200);
expect(response.body.data.auto_started).toBe(false);
expect(insertedQueueItem.status).toBe('pending');
expect(spotifyService.transferPlayback).not.toHaveBeenCalled();
expect(spotifyService.playTrack).not.toHaveBeenCalled();
```

The test must exercise the real enqueue route; do not add a production helper whose only purpose is to return `false` for a unit test.

- [ ] **Step 2: Run the focused route test and verify RED**

Run:

```powershell
Set-Location backend
npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts
```

Expected: Spotify transfer/play is called and/or the response reports `auto_started: true`.

- [ ] **Step 3: Remove enqueue-time backend playback**

Remove the enqueue block that calls `shouldImmediatelyStartSpotifyQueueItem`, `dispatchSpotifyPlaybackForSong`, updates the new item to `playing`, and writes `devices.current_song_id`. Delete `shouldImmediatelyStartSpotifyQueueItem` and its four obsolete unit assertions once the route-level regression is red. Preserve the response field for compatibility:

```ts
const autoStarted = false;
```

The route must insert the item as `pending`, apply queue-add stats, broadcast `queue_updated`, and return. Do not remove dispatch/recovery helpers still used by non-queue legacy endpoints in this task.

- [ ] **Step 4: Add failing route tests for transition idempotency**

In `jukeboxSpotifyKiosk.test.ts`, use its existing server/database harness to add these cases:

```ts
it('advances a playing queue item once when duplicate played reports arrive', async () => {
  // Arrange one current playing item and one pending item.
  // POST played twice for the first queue_item_id.
  // Expect the first response to transition it and the second to be idempotent.
  // Expect terminal/profile side effects and queue broadcast only once.
});

it('rejects a stale item trying to become playing while another item is current', async () => {
  // Arrange current item A and pending item B.
  // POST playing for B before A is terminal.
  // Expect HTTP 409 and no status/device-current mutation.
});
```

- [ ] **Step 5: Run the route tests and verify RED**

Run:

```powershell
npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts
```

Expected: duplicate terminal reporting repeats side effects and/or the stale transition is accepted.

- [ ] **Step 6: Make state updates conditional**

Include `qi.status` in the loaded queue item. For `playing`, accept `pending -> playing` only when the device has no different `current_song_id`; allow an already-playing report for the same item as idempotent success. Use conditional SQL with `RETURNING`:

```sql
UPDATE queue_items
SET status = 'playing'
WHERE id = $1 AND device_id = $2 AND status = 'pending'
RETURNING id
```

For `played` and `skipped`, transition only from `playing`:

```sql
UPDATE queue_items
SET status = 'played', played_at = NOW()
WHERE id = $1 AND device_id = $2 AND status = 'playing'
RETURNING id
```

If the item already has the requested terminal status, return idempotent success without clearing the device twice, enqueueing profile items twice, or broadcasting a second transition. Return HTTP 409 for incompatible stale transitions. Run device-current clearing, profile enqueue, and queue broadcast only after a `RETURNING` row proves a new transition occurred.

- [ ] **Step 7: Run focused and full backend verification**

Run:

```powershell
npx vitest run src/routes/jukeboxPlaybackDispatch.test.ts src/routes/jukeboxSpotifyKiosk.test.ts
npm test
npm run build
```

Expected: all commands exit 0 and the new duplicate/stale tests pass.

- [ ] **Step 8: Commit the isolated backend fix**

```powershell
git add -- backend/src/routes/jukebox.ts backend/src/routes/jukeboxPlaybackDispatch.test.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts
git commit -m "fix: make kiosk queue transitions idempotent"
```

---

### Task 3: Exactly-Once Kiosk Playback and Reliable Completion

**Files:**
- Modify: `kiosk-web/playback.js`
- Modify: `kiosk-web/playback.test.js`
- Modify: `kiosk-web/app.js:1003`
- Modify: `kiosk-web/app.js:1343`
- Modify: `kiosk-web/app.js:1636`

**Interfaces:**
- Consumes: a stable queue-item key and an async function that starts playback.
- Produces: `createPlaybackStartCoordinator()` with `start(key, startFn)`, `complete(key)`, and `reset()`.

- [ ] **Step 1: Write failing coordinator tests**

Add tests to `playback.test.js`:

```js
it('starts the same queue item only once across duplicate updates', async () => {
  const coordinator = playbackHelpers.createPlaybackStartCoordinator();
  const start = vi.fn(async () => undefined);

  await Promise.all([
    coordinator.start('queue-1', start),
    coordinator.start('queue-1', start),
  ]);
  await coordinator.start('queue-1', start);

  expect(start).toHaveBeenCalledTimes(1);
});

it('allows the next queue item after completing the active item', async () => {
  const coordinator = playbackHelpers.createPlaybackStartCoordinator();
  const start = vi.fn(async () => undefined);

  await coordinator.start('queue-1', start);
  coordinator.complete('queue-1');
  await coordinator.start('queue-2', start);

  expect(start).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the coordinator tests and verify RED**

Run:

```powershell
Set-Location kiosk-web
npx vitest run playback.test.js
```

Expected: failure because `createPlaybackStartCoordinator` does not exist.

- [ ] **Step 3: Implement the coordinator**

Add this behavior to the `KioskPlayback` factory:

```js
function createPlaybackStartCoordinator() {
  let activeKey = null;
  let startPromise = null;

  return {
    start(key, startFn) {
      if (!key) return Promise.resolve().then(startFn);
      if (activeKey === key) return startPromise || Promise.resolve(false);

      activeKey = key;
      startPromise = Promise.resolve()
        .then(startFn)
        .catch((error) => {
          if (activeKey === key) activeKey = null;
          throw error;
        })
        .finally(() => {
          startPromise = null;
        });
      return startPromise;
    },
    complete(key) {
      if (!key || activeKey === key) activeKey = null;
    },
    reset() {
      activeKey = null;
      startPromise = null;
    },
  };
}
```

Export it beside the existing helpers.

- [ ] **Step 4: Route `checkAndPlayNext` through the coordinator**

Create one coordinator in the `KioskApp` constructor. Replace direct `this.playSong(candidate)` calls with:

```js
const queueItemKey = this.getQueueItemIdForPlayback(candidate)
  || candidate.song_id
  || candidate.id;

void this.playbackStartCoordinator.start(queueItemKey, () => this.playSong(candidate))
  .catch((error) => this.log(`Playback start failed: ${error.message}`, 'error'));
```

Reset or complete the key only after a confirmed terminal transition, logout/device change, or an actual start failure. Duplicate `queue_updated` events must reuse the existing key.

- [ ] **Step 5: Add a failing non-2xx state-report test**

Using the existing VM/fetch harness in `playback.test.js`, make the playback-state endpoint return `{ ok: false, status: 500 }` and assert `reportKioskPlaybackState` rejects with `Kiosk playback state update failed (500)`.

- [ ] **Step 6: Run the focused test and verify RED**

Run:

```powershell
npx vitest run playback.test.js
```

Expected: the state-report promise resolves instead of rejecting.

- [ ] **Step 7: Validate state responses and await terminal reporting**

Change `reportKioskPlaybackState` to await the response and reject non-2xx status:

```js
const response = await fetch(url, options);
if (!response.ok) {
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error || `Kiosk playback state update failed (${response.status})`);
}
return response;
```

Make `handleSpotifyTrackEnded` async. Await a successful `played` report before calling `stopPlayback` and `playbackStartCoordinator.complete(queueItemId)`. If reporting fails, keep the queue identity, log the failure, and allow an explicit retry/reconnect path rather than silently clearing and replaying the item.

- [ ] **Step 8: Run focused and full kiosk verification**

Run:

```powershell
npx vitest run playback.test.js
npm test
```

Expected: all commands exit 0; duplicate events start once, the next key starts after completion, and non-2xx reporting rejects.

- [ ] **Step 9: Commit the isolated kiosk playback fix**

```powershell
git add -- kiosk-web/app.js kiosk-web/playback.js kiosk-web/playback.test.js
git commit -m "fix: play kiosk queue items exactly once"
```

---

### Task 4: Production Runtime Configuration Reconciliation

**Files:**
- Create: `kiosk-web/runtime-config.js`
- Create or modify: `kiosk-web/config.test.js`
- Modify: `kiosk-web/config.js`
- Modify: `kiosk-web/index.html:146`
- Modify as required: `kiosk-web/app.js`

**Interfaces:**
- Consumes: `window.RADIOTEDU_KIOSK_CONFIG` loaded before `config.js`.
- Produces: `CONFIG.API_URL`, `CONFIG.WS_URL`, `CONFIG.SOCKET_PATH`, and `CONFIG.QR_LINK_FORMAT` for the production `/kiosk` and `/jukebox` paths.

- [ ] **Step 1: Port the fallback configuration tests first**

Use `origin/codex/fallback-jukebox-website:kiosk-web/config.test.js` as the starting test harness, but remove GitHub Pages-only assertions. Require:

```js
expect(config.API_URL).toBe('https://radiotedu.com/jukebox');
expect(config.WS_URL).toBe('https://radiotedu.com');
expect(config.SOCKET_PATH).toBe('/jukebox/socket.io');
expect(config.QR_LINK_FORMAT).toBe('https://radiotedu.com/jukebox?device={DEVICE_CODE}');
```

Add a test that `/kiosk/` can load with no query string and no required password while retaining the existing fixed-device discovery/setup path from the fallback branch.

- [ ] **Step 2: Run configuration tests and verify RED**

Run:

```powershell
Set-Location kiosk-web
npx vitest run config.test.js
```

Expected: failure because runtime config is not loaded or applied by the current branch.

- [ ] **Step 3: Add production runtime config**

Create:

```js
window.RADIOTEDU_KIOSK_CONFIG = {
  API_BASE_URL: 'https://radiotedu.com/jukebox',
  PUBLIC_SITE_BASE_URL: 'https://radiotedu.com',
  QR_LINK_BASE_URL: 'https://radiotedu.com/jukebox',
};
```

Load `runtime-config.js` immediately before `config.js` in `index.html`.

- [ ] **Step 4: Reconcile `config.js` and fixed kiosk startup**

Port the runtime URL normalization from `origin/codex/fallback-jukebox-website` while preserving current branch playback fields. Use runtime `API_BASE_URL`, derive the socket origin/path, and generate `?device={DEVICE_CODE}` QR URLs. Selectively port the fallback's fixed kiosk device discovery/password-free startup changes needed for `/kiosk/` with no query string. Do not port GitHub Pages deployment logic or overwrite current playback coordination.

- [ ] **Step 5: Run kiosk checks and verify GREEN**

Run:

```powershell
npx vitest run config.test.js playback.test.js device-spotify-auth.test.js
npm test
```

Expected: all commands exit 0; production URLs, fixed startup, Spotify auth helpers, and playback tests pass.

- [ ] **Step 6: Commit the runtime configuration fix**

```powershell
git add -- kiosk-web/runtime-config.js kiosk-web/config.js kiosk-web/config.test.js kiosk-web/index.html kiosk-web/app.js
git commit -m "fix: reconcile production kiosk runtime config"
```

---

### Task 5: Backend Fixed-Kiosk Registration Contract

**Files:**
- Modify: `backend/src/routes/jukebox.ts:3099`
- Modify: `backend/src/routes/jukeboxSpotifyKiosk.test.ts`

**Interfaces:**
- Consumes: kiosk registration body `{ session_id, device_code?, password? }`.
- Produces: the existing registration response `{ device, kioskSession }`, with deterministic discovery when `device_code` is omitted.

- [ ] **Step 1: Add failing HTTP route tests for omitted device code**

Use the existing real Express route/database harness in `jukeboxSpotifyKiosk.test.ts` and add:

```ts
it('registers the sole active passwordless kiosk when device_code is omitted', async () => {
  // Arrange exactly one active device whose password is null/empty.
  // POST /kiosk/register with only session_id.
  // Expect HTTP 200 and that exact device in response.data.device.
});

it('rejects ambiguous no-code registration when multiple active passwordless devices exist', async () => {
  // Arrange two eligible devices.
  // POST with only session_id.
  // Expect HTTP 409 and no session activation.
});
```

Keep an explicit-code test proving the existing password/device behavior remains unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
Set-Location backend
npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts
```

Expected: the sole-device request returns 404 because the current query compares `device_code` to `undefined`.

- [ ] **Step 3: Implement deterministic no-code discovery**

Normalize the optional code:

```ts
const requestedDeviceCode = typeof device_code === 'string' ? device_code.trim() : '';
```

When it is present, preserve the existing exact-code lookup and password validation. When absent, query up to two eligible devices:

```sql
SELECT id,
       device_code,
       password,
       active_kiosk_session_id,
       active_kiosk_heartbeat_at
FROM devices
WHERE is_active = TRUE
  AND COALESCE(password, '') = ''
ORDER BY created_at ASC
LIMIT 2
```

Return 404 when no eligible fixed kiosk exists. Return 409 with a clear setup-required message when more than one exists. Continue through the existing active/standby session decision when exactly one exists. Do not auto-select a password-protected device without a code.

- [ ] **Step 4: Run focused and full backend checks**

```powershell
npx vitest run src/routes/jukeboxSpotifyKiosk.test.ts
npm test
npm run build
```

Expected: all commands exit 0 and explicit-code registration remains covered.

- [ ] **Step 5: Commit the backend registration contract**

```powershell
git add -- backend/src/routes/jukebox.ts backend/src/routes/jukeboxSpotifyKiosk.test.ts
git commit -m "fix: discover the fixed kiosk device on registration"
```

---

### Task 6: Integrated App Verification and Handoff

**Files:**
- Modify only if verification reveals a regression: files already owned by Tasks 1-4.
- Update: `docs/superpowers/plans/2026-07-10-working-jukebox-app.md` checkboxes as tasks complete.

**Interfaces:**
- Consumes: all task outputs.
- Produces: one verified branch commit set ready for the separate webserver deployment task.

- [ ] **Step 1: Review the integrated diff**

Confirm the diff contains no mobile, `windows-agent/`, production server, secret, generated `dist/`, or unrelated files. Confirm only the kiosk starts queued Spotify playback.

- [ ] **Step 2: Run the complete repository-side app checks**

Run:

```powershell
Set-Location backend
npm test
npm run build

Set-Location ../jukebox-web-controller
npm run lint
npm test
npm run build

Set-Location ../kiosk-web
npm test
```

Expected: every command exits 0.

- [ ] **Step 3: Inspect verification evidence**

Record test-file/test counts, build exit codes, lint exit code, and any intentionally untested production behavior. Do not claim the real Spotify/QR flow passes locally; that remains the later webserver acceptance test.

- [ ] **Step 4: Push the verified implementation**

After confirming only intended commits/files are present:

```powershell
git push origin fix/radiotedu-kiosk-web-playback
```

- [ ] **Step 5: Prepare the server handoff**

Report the exact pushed commit SHA and link the existing webserver starter prompt. State explicitly that the webserver task must deploy this exact SHA and run the real QR plus three-song Spotify acceptance test.
