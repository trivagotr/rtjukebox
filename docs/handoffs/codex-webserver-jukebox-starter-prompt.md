# Starter Prompt: Codex on the RadioTEDU Webserver

Run this task only after the kiosk/jukebox coding task has pushed its verified implementation commit. Copy everything below into Codex on the production webserver.

---

You are Codex operating directly on the RadioTEDU production webserver. Your job is to deploy and prove the completed working-jukebox implementation.

Use these GitHub sources:

- Repository: https://github.com/trivagotr/rtjukebox
- Branch: https://github.com/trivagotr/rtjukebox/tree/fix/radiotedu-kiosk-web-playback
- Exact verified application commit to deploy: `3541119602dbd8d27c0580768da35300eabcc246`
- Commit URL: https://github.com/trivagotr/rtjukebox/commit/3541119602dbd8d27c0580768da35300eabcc246
- Design and acceptance-test authority: https://github.com/trivagotr/rtjukebox/blob/fix/radiotedu-kiosk-web-playback/docs/superpowers/specs/2026-07-09-working-jukebox-design.md

The two public product URLs are fixed:

- Kiosk/player computer: `https://radiotedu.com/kiosk`
- QR destination and guest song selector: `https://radiotedu.com/jukebox`

Functional delivery is the priority. Do not spend time on a security audit, dependency audit, broad hardening, architecture cleanup, or unrelated refactoring. Preserve the server's existing credentials and access controls, but do not block this task on security findings. The requested product is only: a person scans the kiosk QR, chooses a song, adds it to the queue, and the kiosk plays it.

Read every applicable `AGENTS.md` and the full design authority first. The only goal is this real flow:

`QR scan -> /jukebox?device=CODE -> guest name -> Spotify search -> enqueue -> backend queue broadcast -> kiosk browser plays -> track ends -> next queued track plays`

Deploy commit `3541119602dbd8d27c0580768da35300eabcc246`, not an unverified newer branch tip. Confirm that exact commit includes the socket, sole-playback-authority, idempotent playback, state-reporting, queue-transition, and runtime-config fixes described by the design. Record the current production SHA and the target SHA before changing production.

Proceed in this order:

1. Start with read-only discovery. Identify the existing RT Jukebox source/deployment directories, backend service and service manager, IIS/reverse-proxy routes, `/kiosk` static root, `/jukebox` static root/API split, environment/config mechanism, database, logs, WordPress installation, and radio stream services.
2. Inspect current Git state and production versions. Do not reset, clean, overwrite, or reuse a dirty live working tree. Fetch/build in a separate staging or release directory.
3. Before each mutation, create timestamped backups of only the RT Jukebox targets: backend release/config, kiosk static directory, guest-jukebox static directory, and database if a migration is explicitly required. Record exact rollback commands and verify the backups exist.
4. Preserve all existing database/JWT/CORS/Spotify environment values. Add only values explicitly required by the design through the server's existing secret/config mechanism. Never print, log, commit, or place actual secret values in static files or the final report.
5. Fetch `fix/radiotedu-kiosk-web-playback`, check out commit `3541119602dbd8d27c0580768da35300eabcc246`, and run the repository's relevant tests/builds in the staging checkout. Stop if they fail.
6. Deploy only the enumerated RT Jukebox backend release and generated/static `/kiosk` and `/jukebox` artifacts. Use an overlay/copy of intended files; do not mirror-delete target directories. Ensure `/kiosk/runtime-config.js` is deployed and the kiosk HTML actually loads it.
7. Keep API routing under `/jukebox/api/...` working while serving the guest application at `/jukebox/`. Preserve the existing reverse proxy/IIS layout unless the design requires a narrowly scoped correction.
8. Restart or reload only the RT Jukebox backend/service if required. Do not restart, edit, or replace unrelated IIS sites, WordPress, radio streams, certificates, uploads, logs, databases, or other services.
9. Complete or confirm Spotify authorization only through Spotify's real OAuth page and configured callback. If operator login/consent is needed, provide the URL and pause for the operator; never ask for Spotify credentials, authorization codes, tokens, client secrets, or refresh tokens in chat.
10. If rollout or verification fails, collect logs, roll back promptly using the verified backups, and report the functional blocker without disturbing unrelated services.

Required staging checks:

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

Required real production acceptance test:

1. `https://radiotedu.com/jukebox/health` returns HTTP 200 after deployment.
2. `https://radiotedu.com/kiosk` loads without a required query string and reaches a Spotify-ready state after operator setup.
3. The kiosk QR points to `https://radiotedu.com/jukebox?device=DEVICE_CODE` using the effective kiosk device.
4. Scan that real QR from a guest phone/browser; the page selects the device automatically.
5. Enter a guest name, search for a real Spotify track, and add track A.
6. Confirm exactly one queue item is created, the kiosk receives it without refresh, and audible playback/progress starts exactly once.
7. Add tracks B and C and confirm the order remains A, B, C.
8. Let A end naturally; confirm A becomes played and B starts exactly once. Let B end and confirm C starts exactly once.
9. Refresh the guest page and verify device selection plus queue visibility recover.
10. Refresh/reconnect the kiosk and verify queue state recovers without duplicate advancement or unnecessary track restart.
11. Inspect backend/browser logs for unhandled errors during the tested flow.
12. Confirm the deployment did not stop the existing WordPress site, radio stream, or unrelated IIS sites. Do not investigate or modify them beyond this quick availability check.

Do not substitute API-only calls, mocked events, or unit tests for the real QR, browser, audio, and three-track test. Do not expand scope into mobile, Windows-agent/CLI playback, broad security hardening, refactoring, or cleanup.

Finish with a factual deployment report containing:

- Exact commit SHA and GitHub commit URL deployed.
- Backup paths and rollback commands.
- Exact production paths/files changed.
- Backend service/reverse-proxy actions and final status.
- Environment variable names touched, never values.
- Spotify authorization status.
- Evidence/result for each acceptance-test item.
- Any remaining functional blocker.

Completion means the real QR-to-third-song flow passed on `radiotedu.com`.

---
