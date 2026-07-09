# Working Jukebox: Functional Recovery Design

Status: approved for implementation on 2026-07-09

Repository: https://github.com/trivagotr/rtjukebox

Implementation branch: `fix/radiotedu-kiosk-web-playback`

Branch link: https://github.com/trivagotr/rtjukebox/tree/fix/radiotedu-kiosk-web-playback

## Objective

Deliver one reliable event flow:

1. The kiosk is open at `https://radiotedu.com/kiosk/` and connected to a Spotify Premium account.
2. Its QR code opens `https://radiotedu.com/jukebox?device=DEVICE_CODE`.
3. A guest enters a name, searches Spotify, and adds a song.
4. The backend stores the queue item and broadcasts the updated queue.
5. The kiosk browser plays the queue head through Spotify Web Playback SDK exactly once.
6. When a track ends, the kiosk reports completion and the next queued track starts.

This design is intentionally small. Mobile, games, voting changes, Windows/CLI playback, broad security hardening, UI redesign, and unrelated backend work are out of scope.

## Architecture Decision

The kiosk browser is the only component allowed to start Spotify playback.

- The guest web controller selects a device, searches, and enqueues.
- The backend owns durable queue state and broadcasts changes.
- The kiosk owns Spotify Web Playback SDK playback for that queue.
- The backend must not independently transfer/start the same Spotify track after enqueue.
- The Windows agent and Spotify Connect placeholder are not part of this recovery.

This removes the current race where the backend starts a track and the kiosk starts it again after receiving `queue_updated`.

## Required Data Flow

### 1. Device selection and QR

- The kiosk must determine its effective device without requiring a visitor to type a device code.
- The QR target must include that device code as the `device` query parameter.
- The guest page must read the query parameter, connect to the matching jukebox device, and preserve it through refresh.
- Production base URLs must come from an explicit runtime configuration suitable for `/kiosk/` and `/jukebox/` subpaths.

### 2. Search and enqueue

- Guest search uses the existing backend Spotify search route.
- Selecting a result submits one enqueue request with the selected device and guest name.
- The UI disables or deduplicates repeated submissions while the request is pending.
- A successful enqueue causes the backend to persist the item as queued and emit the queue update.
- Enqueueing does not start Spotify playback on the backend.

### 3. Realtime controller lifecycle

- The guest controller creates at most one Socket.IO connection for the selected device.
- Updating React state with that socket must not trigger cleanup of the same connection.
- Cleanup occurs only when the selected device changes or the component unmounts.
- On reconnect, the controller rejoins the device room and refreshes the queue.
- The UI must not claim the kiosk is live unless the socket/device state supports that claim.

The known self-teardown effect is in `jukebox-web-controller/src/App.tsx` around the effect currently depending on both `device` and `socket`.

### 4. Kiosk playback ownership

- The kiosk waits until Spotify Web Playback SDK is ready and its Spotify device is registered.
- It loads the current queue on startup and after socket reconnect.
- It selects only the current/head queue item eligible for playback.
- It keeps an in-memory identity for the active queue item and an in-flight start promise/flag.
- Repeated queue broadcasts for the same item do not call Spotify play again.
- A different item cannot start until the previous item is terminal or the backend confirms the transition.
- Player state events, not arbitrary timers, determine when a track actually ends.

### 5. Playback-state transitions

- Before or immediately after successful Spotify start, the kiosk reports `playing` for the current queue item.
- On actual track end it reports `played`; an explicit operator skip reports `skipped`.
- The client treats non-2xx HTTP responses as failures. A resolved `fetch()` is not automatically success.
- The backend accepts a transition only for the device's current queue item and only from an allowed prior state.
- The backend performs the state update and next-item selection atomically or conditionally so stale reports cannot produce multiple playing items.
- After a successful terminal transition, the backend broadcasts the new queue; the kiosk then starts the new head exactly once.

### 6. Recovery behavior

- If the Spotify token or SDK is temporarily unavailable, keep the queue item pending/current and show the kiosk reconnect action. Do not silently mark the item played.
- After Spotify reconnects, refresh the queue and resume the current eligible item once.
- A kiosk refresh must recover from backend queue state rather than relying only on local variables.
- Socket reconnects and duplicate broadcasts must not restart an already-playing track.

## Source Reconciliation

The current implementation branch contains the newest browser playback coordination commits, while `origin/codex/fallback-jukebox-website` contains the production runtime-config and password-free kiosk work. They modify overlapping kiosk files.

The coding task must reconcile these changes deliberately:

- Preserve the current branch's playback-state fixes.
- Bring over the minimum production runtime configuration and fixed RadioTEDU URLs.
- Keep the production target on `radiotedu.com`; do not restore a GitHub Pages runtime target.
- Do not blindly replace `kiosk-web/app.js`, `config.js`, `device-spotify-auth.js`, or `index.html` with one branch's versions.
- Add or update tests for the merged behavior before editing production code.

## Coding Workstream

The coding Codex owns repository changes only. It must:

1. Reproduce the React socket lifecycle failure with a regression test, then fix the effect lifecycle.
2. Add backend tests proving enqueue persists/broadcasts without starting Spotify playback.
3. Add kiosk tests proving duplicate queue updates start a queue item only once.
4. Add kiosk tests proving non-2xx state reports are failures and do not incorrectly advance local state.
5. Add backend tests for conditional current-item transitions and single next-item selection.
6. Reconcile runtime configuration from the fallback branch without losing current playback changes.
7. Run all relevant package checks and commit/push the implementation branch.

Required local verification:

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

The coding task must report the exact tested commit SHA and changed files. It must not deploy production.

## Production Webserver Workstream

The server Codex runs only after the coding task has pushed a verified commit. It must:

1. Discover the existing RT Jukebox backend service, reverse-proxy/IIS mapping, static kiosk directory, static guest-jukebox directory, environment file, database, logs, and backup location.
2. Back up only the RT Jukebox targets before replacing files.
3. Fetch the implementation branch and verify the exact approved commit SHA.
4. Build in a separate source/staging directory.
5. Preserve production database/JWT/CORS/Spotify values; add only missing required values and never place secrets in git or public assets.
6. Deploy backend changes through the existing service method.
7. Overlay the enumerated kiosk runtime files and the built guest controller without mirror-delete operations.
8. Restart only the RT Jukebox backend if required.
9. Complete or confirm Spotify OAuth through Spotify's own page.
10. Run the end-to-end acceptance test below and retain rollback paths until it passes.

The server task must not modify WordPress, radio stream files, unrelated IIS sites, certificates, uploads, other databases, or unrelated services.

## End-to-End Acceptance Test

All items must pass on `radiotedu.com`:

1. `/jukebox/health` returns HTTP 200.
2. `/kiosk/` loads without a required query string and reaches a connected/ready Spotify player after setup.
3. The displayed QR URL contains the effective device code and opens `/jukebox?device=DEVICE_CODE`.
4. The guest page selects that device automatically after scanning.
5. A guest name can be entered and a Spotify search returns selectable tracks.
6. Adding track A creates exactly one queue item and the guest UI confirms it.
7. The kiosk receives the update without refresh and starts track A exactly once.
8. Adding tracks B and C preserves their order.
9. When A actually ends, A becomes played and B starts exactly once; C follows B.
10. Refreshing the guest page preserves device selection and queue visibility.
11. Refreshing/reconnecting the kiosk recovers queue state without duplicating or restarting the active track unnecessarily.
12. Backend and browser logs contain no unhandled error for the tested flow.

Unit tests or a health response alone do not satisfy this acceptance test. A real Spotify Premium account, the real browser SDK, the real production URLs, and at least three queued songs are required.

## Completion and Handoff

The coding task finishes first and supplies a commit SHA. The server task deploys that exact SHA and supplies:

- Backup paths.
- Commit SHA deployed.
- Files/directories changed.
- Backend service restarted or left untouched, with status.
- Public URLs tested.
- Results for every acceptance-test item.
- Rollback instructions and any remaining functional blocker.

The product is complete only when the real QR-to-third-song flow passes. Passing unit tests without that production flow is not completion.
