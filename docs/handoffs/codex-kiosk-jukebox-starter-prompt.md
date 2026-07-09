# Starter Prompt: Codex for Kiosk and Jukebox

Copy everything below into a new Codex task.

---

You are the orchestrator for the functional RT Jukebox recovery.

Work in this GitHub repository and branch:

- Repository: https://github.com/trivagotr/rtjukebox
- Branch: https://github.com/trivagotr/rtjukebox/tree/fix/radiotedu-kiosk-web-playback
- Design authority: https://github.com/trivagotr/rtjukebox/blob/fix/radiotedu-kiosk-web-playback/docs/superpowers/specs/2026-07-09-working-jukebox-design.md

Read every applicable `AGENTS.md`, then read the full design authority before changing code. Preserve existing work and the current playback fixes. Do not discard, reset, stage, or commit unrelated local changes.

If subagents are available, remain the orchestrator and delegate bounded, independent coding or test tasks to small/fast agents such as GPT-5.6 Luna or GPT-5.4 Mini when the runtime lets you select them. You own the design, integration, diff review, and final verification. Do not claim a model assignment the runtime does not expose.

Implement and test only this product flow:

1. A guest scans the kiosk QR code and opens `/jukebox?device=DEVICE_CODE`.
2. The guest page selects that device automatically, accepts a guest name, searches Spotify, and enqueues tracks.
3. The backend is the authoritative queue store and broadcasts queue changes. Enqueueing never starts Spotify playback on the backend.
4. The kiosk browser is the only playback authority and uses Spotify Web Playback SDK.
5. The kiosk plays each authoritative queue head exactly once, reports `playing` and terminal state, and starts the next head after the backend accepts the transition.
6. Duplicate socket events, refreshes, reconnects, retries, stale completions, and concurrent enqueue/completion must not restart a track or advance multiple items.

Fix these known functional defects with targeted TDD:

1. `jukebox-web-controller/src/App.tsx`, around the socket effect currently near lines 814-829: creating the socket updates a dependency and triggers cleanup that disconnects the same socket. Add a regression test and correct the lifecycle so there is one connection per selected device, cleanup occurs only on device change/unmount, and reconnect rejoins/refetches.
2. Remove or disable the backend Spotify autostart path used during enqueue. The kiosk must be the sole component that calls Spotify play for queued songs.
3. Add an identity/in-flight guard in the kiosk so repeated queue broadcasts start a queue item once per queue-item identity.
4. Make `reportKioskPlaybackState` reject non-2xx responses. A resolved `fetch()` with HTTP 4xx/5xx is a failure and must not create false local success or queue advancement.
5. Make backend queue transitions current-item-aware, conditional, and idempotent. Ignore or reject stale/duplicate terminal reports without skipping the current head or producing multiple playing items.
6. Reconcile `origin/codex/fallback-jukebox-website` selectively: retain its required `runtime-config.js`, RadioTEDU production URL, fixed QR, and password-free startup behavior, while preserving the current branch's newer playback coordination. Do not blindly replace overlapping kiosk files or restore GitHub Pages as the runtime target.

Required tests must cover:

- QR/device selection survives refresh.
- Search and enqueue do not initiate playback from the guest or backend.
- Socket remains connected instead of self-tearing down.
- Duplicate queue events start the same track once.
- A real terminal event advances exactly one queue item.
- Duplicate/stale completion does not advance again.
- A non-2xx state report is handled as failure.
- Runtime config points production kiosk/QR/API traffic to `radiotedu.com`.
- Existing relevant behavior remains covered.

Use deterministic Spotify SDK, HTTP, database, and Socket.IO doubles. Do not require a live Spotify account for automated tests.

Run and inspect exit codes for all relevant checks:

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

Scope limits:

- No mobile work.
- No Windows-agent or CLI playback implementation.
- No unrelated security hardening.
- No production deployment.
- No broad redesign, cleanup, or dependency churn.
- Do not place Spotify credentials or secret values in code, tests, docs, logs, or chat output.

After verification, review the complete diff, commit only the intended source/tests/docs, and push `fix/radiotedu-kiosk-web-playback` to origin. Report:

- The pushed commit SHA and GitHub commit URL.
- Behavior fixed.
- Files changed.
- Tests added.
- Exact verification commands, exit codes, and counts.
- Any remaining functional blocker for the real QR-to-playback flow.

Do not report completion merely because unit tests pass. The next webserver task must still deploy this exact commit and run the real Spotify Premium end-to-end acceptance test in the design document.

---
