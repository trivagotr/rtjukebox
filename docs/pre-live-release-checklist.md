# Pre-live release checklist

This checklist covers changes recorded in `backend-refactor-progress.md` and keeps the existing production backend separate from the isolated `backend-refactor/` scaffold.

## Release target

- Deploy the existing `backend/` service for this release. Do not switch traffic to `backend-refactor/`: its Identity slice is not mounted, the remaining domain modules are placeholders, and its initial Prisma migration has not been reconciled with the live schema/token formats.
- A future cutover needs a staging database snapshot, a mapped legacy schema baseline, bcrypt-to-scrypt identity compatibility, token compatibility/expiry policy, migrated domain modules, and a rollback rehearsal. No live cutover is included here.

## Database and services

- Back up the intended staging database and apply only `backend/src/db/migrations/20260925_pre_live_auth.sql` for the pending auth/OAuth tables. From `backend/`, set `$env:SCHEMA_SQL_PATH='src/db/migrations/20260925_pre_live_auth.sql'` and run `npm run db:migrate`. Clear the variable after the command. The normal `db:migrate` target is the broad `src/db/schema.sql`; it manages unrelated domains and must not be used for this scoped task. Confirm `public.devices` exists with UUID `id` before applying the OAuth-state foreign key.
- Verify the migration on the target with `SELECT to_regclass('public.auth_login_attempts'), to_regclass('public.spotify_oauth_states');`. Then exercise login lockout and both Spotify OAuth state flows in staging.
- The configured Neon database is a temporary database, not the confirmed staging target. Do not treat it as a migration target or run schema/data changes there.
- The ignored local `backend/.env` now selects the existing `radiotedu` database. The scoped auth/OAuth migration has been applied and verified locally; a custom-format backup of only `users` and `devices` was validated before the migration. Neon is retained as a test source and its test records were not imported. This is a local setup, not a staging/production migration.
- Local Redis at `localhost:6379` answers `PING`, but reports version `3.0.504`; BullMQ requires Redis 5 or newer. The app now checks this before starting a worker and keeps non-test readiness false when Redis is too old. A non-test local readiness smoke returned 503 as expected. Upgrade/provision a supported Redis before enabling BullMQ-backed readiness or job endpoints.
- Spotify client credentials are configured and the client-credentials token request returned HTTP 200. Spotify's authorization endpoint accepted both the admin callback `https://radiotedu.com/jukebox/api/v1/spotify/callback` and derived device callback `https://radiotedu.com/jukebox/api/v1/spotify/device-auth/callback` (HTTP 303 preflight). No login or account grant was completed; interactive admin/device OAuth remains to be done.
- A local-only `HEALTHCHECK_TOKEN` is present in the ignored `backend/.env`. The protected readiness route returned 200 in a test-mode smoke using local DB, writable uploads, and Redis rate-limit connectivity. Test mode bypasses BullMQ readiness; the non-test probe correctly returns 503 while Redis is unsupported.
- `/jukebox/health` returns 200; `/jukebox/health/live` and `/jukebox/health/ready` still return 404 from the currently running old backend. The machine-level IIS rule now forwards all three paths to port 3000, with a timestamped rollback copy. The backend process must be updated/restarted before the new probes can respond. The prefixed Spotify callback route reaches the backend and returns its expected 400 when OAuth state/code are omitted.
- Public preflight `OPTIONS /jukebox/api/v1/auth/login` returned 204 but omitted `Access-Control-Allow-Credentials`, `PATCH`, `x-auth-transport`, and `x-kiosk-credential`. The deployed CORS behavior is stale/incomplete for cookie auth, PATCH requests, and kiosk credential requests. Update the deployed backend/proxy and repeat preflight checks before enabling the controller or kiosk clients.
- The normal backend process was not started, so periodic Spotify/device reconciliation did not run. The isolated worker probe found an empty queue and stopped after confirming the Redis-version blocker.
- Before any copy or migration, identify the intended source and destination, obtain authorized access to both, and take backups. Do not overwrite local data without a confirmed transfer direction and restore plan.
- Local PostgreSQL access is now configured for the `radiotedu` database; the earlier password-access blocker is closed.
- Neon records were confirmed as test data and intentionally excluded. No data copy is planned; retain the Neon URL only as a separate test-source setting and do not overwrite either database.
- Local target credentials connect. `TARGET_DATABASE_URL` now selects the existing `radiotedu` database; its `users` and `devices` tables were confirmed. The narrow auth/OAuth migration has been applied locally and verified; a custom-format backup of only `users` and `devices` was validated. The default `postgres` database was not migrated.
- The user confirmed Neon rows were test data and need not be imported. The ignored local `backend/.env` now points primary `DATABASE_URL` to `radiotedu`, sets `DB_SSL=false`, and preserves the former Neon URL as `NEON_TEST_DATABASE_URL`. No Neon data was copied.
- Primary-config local API smoke passed earlier: `/health/live` and the jukebox song catalog returned 200. Redis reachability is verified, but BullMQ is blocked by Redis 3.0.504. Spotify credentials and both callback registrations are verified; interactive authorization remains open.
- The users router currently exposes only the leaderboard; there is no admin user-directory endpoint or user-list panel. See the endpoint/UI inventories for the scan result.
- Configure `REDIS_URL`; readiness checks both the rate-limit Redis client and BullMQ worker. Ensure the `uploads` directory exists and is writable.

## Auth and browser configuration

- Configure strong `JWT_SECRET`, `JWT_REFRESH_SECRET`, `HEALTHCHECK_TOKEN`, and exact `CORS_ORIGINS` values. The controller uses HttpOnly, SameSite=Strict cookies and requires the API and web origin to be same-site. If deployment uses cross-site origins, add an explicit CSRF design before changing cookie policy.
- New JWTs carry issuer and audience. `JWT_ALLOW_LEGACY_TOKENS=true` is a temporary compatibility setting for existing sessions; turn it off after the 30-day refresh-token lifetime has elapsed. Setting it false immediately forces existing users to sign in again.
- The local environment contains controller/kiosk CORS origins and Spotify credentials/callbacks. Spotify accepted both callback URLs. Before release, update deployed CORS handling, fix the `/jukebox/health/live` 404, compare reverse-proxy paths, complete interactive admin/device OAuth, and verify cookie/Socket.IO behavior in staging.
- Health probes are available at `/health/live` and `/health/ready`, plus `PUBLIC_BASE_PATH` aliases. Readiness requires a bearer `HEALTHCHECK_TOKEN` and returns a generic status only.

## Verification record

- Backend build and focused auth/health tests passed after guest refresh was disabled, JWT issuer/audience validation was added, and browser cookie auth was implemented.
- Controller production build and component tests passed after the token moved out of `localStorage`.
- Mobile production-source typecheck and focused auth/podcast/QR tests passed. The old whole-project `tsc` command still includes stale game tests; those game files were left untouched under the no-games scope.
- Docker is unavailable in this workspace, so the Postgres/Redis Testcontainers integration suite could not run. A staging DB/Redis/Spotify smoke test remains required before rollout.

## Current release blockers (2026-09-25)

| Blocker | Evidence | Required to close |
|---|---|---|
| BullMQ Redis compatibility | Memurai service is Running/Automatic on 6380; `PONG`, Redis API 8.2.10, node-redis connection and BullMQ queue readiness passed. After the service auto-restarted on 2026-09-25, startup logs reported rate-limit Redis and background jobs ready; authenticated local `/health/ready` returned 200. | Keep legacy Redis 6379 available for rollback until remaining release checks pass. |
| Running backend health/CORS | `/health/live`, token-authenticated `/health/ready`, login CORS preflight, guest login/session restore, device connect, queue display, and authenticated Socket.IO room-join smoke all passed through local IIS. User confirmed the public controller displays `KOLEJ` and its queue. | Closed for the current controller/API path. |
| Kiosk provisioning and playback | Backup and scoped kiosk migration are complete. The user confirmed the public kiosk now reports Queue ready and the active DB has an unrevoked kiosk credential with a fresh heartbeat. One Spotify-backed song remains queued; no Spotify playback target is authorized. | Backend/kiosk connectivity is ready. To play Spotify songs, connect the Spotify account/device and verify playback; this is currently deferred by the user. |
| Separate staging smoke | The active service's `radiotedu` DB has the scoped auth/OAuth tables applied and verified. No separate staging environment was identified or tested. | If a separate staging target is used for the release, back it up, apply the scoped auth/OAuth migration, and verify login/OAuth there. |
| Spotify user/device grant | Client credentials and callback preflights passed. Authenticated public status requests return HTTP 200, but both admin Spotify authorization and `KOLEJ` device authorization currently report disconnected. | Complete both Spotify authorization flows with the intended Spotify account, then validate playback. |
| Browser session and socket path | Guest login/session restore and device connection were observed in the user's browser. After correcting IIS's Socket.IO target, an authenticated polling client using an existing `KOLEJ` device session connected through IIS and joined the device room; the server logged both events. The user confirmed the controller displays the device and queue. | Closed for controller access and queue visibility; playback still depends on a provisioned kiosk/Spotify grant. |

Do not mark the release live-ready until the remaining checks pass. The Jukebox Windows service restarted automatically after the user's restart command triggered a WinSW stop error; IIS and the legacy Redis service were not stopped.

### Admin access and kiosk onboarding (2026-09-25)

- Created a separate admin account in the active `radiotedu` database at the user's request. Its password is stored only as a bcrypt hash; the credentials were handed to the user in chat and the plaintext is not recorded in this repository.
- Confirmed the account can log in through `https://radiotedu.com/jukebox/api/v1/auth/login` and access the public admin device API.
- Issued a one-time `KOLEJ` kiosk provisioning code through the authenticated public admin API. Its plaintext was returned only to the user in chat; the database stores a hash and the code expires after 15 minutes.
- Rechecked public `/jukebox/health/live`: HTTP 200. Authenticated public Spotify status checks return HTTP 200 but show that neither the admin account nor the `KOLEJ` device has an OAuth grant yet.
- Remaining interactive action: enter the issued provisioning code on the physical kiosk, then finish Spotify authorization from the admin dashboard and kiosk. Playback cannot be verified until those authorizations complete.

### Interactive test deferral (2026-09-25; superseded by 2026-09-26 kiosk check)

- User asked to defer Spotify tests and cannot connect the physical kiosk right now. The previously issued one-time provisioning code is short-lived and should be regenerated when the kiosk computer is available; do not rely on the earlier code.
- Non-Spotify checks already completed: public live health, admin cookie login, CORS/auth behavior, controller session restore, device connect and queue reads, authenticated Socket.IO room join, BullMQ readiness on Memurai, scoped DB migration/table presence, and authenticated issuance of a kiosk provisioning code.
- Remaining non-Spotify device test: consume a fresh provisioning code on the actual kiosk, confirm kiosk registration/credentialed heartbeat and playback-state requests. A separate staging smoke is needed only if a separate staging environment is used for this release; none has been identified so far.
- Spotify admin/device authorization and playback validation are explicitly deferred until the user can connect the kiosk and Spotify account.
- On user request, generated a fresh single-use `KOLEJ` setup password through the authenticated public admin API. It supersedes any previous code, expires 15 minutes after issue, and its plaintext is shared only in chat.

### Public kiosk registered (2026-09-26)

- User confirmed the kiosk now shows `Queue ready`, `Kolej`, the waiting queue item, and the Spotify connection prompt. This confirms physical kiosk registration completed after correcting the API base path.
- Active database check confirms `KOLEJ` is active, its kiosk credential is unrevoked and valid, the heartbeat is current, and one queue item is pending. `spotify_player_is_active=false` and no Spotify playback device ID is set.
- Public `/jukebox/health/live` returned 200 and authenticated `/jukebox/health/ready` returned 200. Jukebox backend/API and kiosk connection are live-ready. Spotify playback is the only identified functional blocker for playing Spotify-backed songs and is deferred by the user.
- Separate staging remains conditional: run staging smoke only if a separate staging target will be used. The active service and public host are already serving the current Jukebox.

### Read-only Jukebox live toggle scan (2026-09-25)

- Public controller `/jukebox/`, kiosk `/jukebox/kiosk/`, and song catalog API returned HTTP 200. `/jukebox/health` returned 200, but `/jukebox/health/live` returned 404.
- Public OPTIONS preflight to `/jukebox/api/v1/auth/login` omitted `PATCH`, credentials, `x-auth-transport`, and `x-kiosk-credential`. Public static delivery and catalog access work; cookie-auth controller readiness is not proven.
- Local IIS and the Node backend on port 3000 are running. The backend is managed by automatic Windows service `RadioTEDU-Jukebox` (LocalSystem), launching `backend/dist/server.js` from this repo. A clean TypeScript rollback baseline from commit `928ece2d` is at `C:/RadioTEDU/backups/20260925-jukebox-baseline-r928ece2d/dist`; SHA-256 manifest is alongside it. It is a source baseline, not a captured copy of the exact current binary. The ignored backend `.env` now points to Memurai at 6380; Redis and BullMQ connection preflights passed. The Jukebox service has not been restarted.
- Added `docs/jukebox-live-toggle-runbook.md` with a scoped maintenance rule sequence and restore checks. Do not stop IIS or kill the Node PID to take only Jukebox offline.

### Post-restart smoke check (2026-09-25)

- User ran `Restart-Service -Name 'RadioTEDU-Jukebox'`. WinSW logged a process stop error (`The handle is invalid`) while stopping Node; Windows Service Control Manager recorded the unexpected termination and applied the configured automatic restart. The service is now Running (PID 27664 at inspection) and local health is 200. No IIS or legacy Redis stop occurred.
- The restarted process startup log reports `rate_limit_redis_ready` and `background_jobs_ready`. Memurai on 6380 responds `PONG`; the ignored backend `.env` points to 6380.
- Local IIS `/jukebox/`, `/jukebox/kiosk/`, `/jukebox/health`, and `/jukebox/health/live` returned 200. `/jukebox/health/ready` returned 200 when called with the configured bearer token (unauthenticated readiness intentionally returns 404).
- `OPTIONS /jukebox/api/v1/auth/login` returned 204 with `Access-Control-Allow-Credentials: true`, PATCH allowed, and the required auth/kiosk headers.
- Interactive browser smoke: server logs show guest session creation returned 201 and device connection returned 200. After refresh the controller showed the same signed-in guest, confirming auth-cookie session restore. The selected device was not restored in the UI; entering `KOLEJ` again is required. Authenticated Socket.IO still needs confirmation.
- Socket.IO route verification found IIS was stripping `/jukebox` and forwarding to Node `/socket.io`, while both the client and backend use `/jukebox/socket.io`. Updated only `JUKEBOX_SUBDIR_SOCKET_PROXY` in `C:\inetpub\wwwroot\web.config`; preserved the original at `C:\inetpub\wwwroot\web.config.pre_live_jukebox_socket_20260925.bak`. Local IIS polling handshake now returns 200. Browser-authenticated Socket.IO and room join remain to be confirmed after a page refresh.
- Authenticated Socket.IO smoke through local IIS completed using an existing `KOLEJ` user/device session: connection succeeded, `join_device` was emitted, and server logs recorded `socket_connected` (`guest`) plus `socket_joined_device`. This validates the full IIS path, cookie-token verification, and room authorization. The smoke used a short-lived in-memory token and made no persistent data changes.
- User confirmed the controller displays device `KOLEJ` and a pending `Howlin' for You` row. The empty center panel is based on `nowPlaying`, separate from pending queue rows; this state indicates the song is queued but nothing is currently playing.
- The active local `radiotedu` DB initially lacked `kiosk_provisioning_codes` and `kiosk_credentials`. Created and validated a full custom-format backup at `C:\RadioTEDU\backups\20260925-radiotedu-pre-kiosk-migration.dump` (13,618,236 bytes; SHA-256 `783D21264D2767D8C9330E567BD093B2B80F84B51E73343E3E785124366D7D59`). Applied only `backend/src/db/migrations/20260925_kiosk_credentials.sql`; both tables now resolve in `public`.
- Post-migration check: active device `KOLEJ` remains enabled, has zero valid kiosk credentials, and has no active Spotify player target. Next requires an admin-generated one-time provisioning code and Spotify kiosk authorization; no credentials were created or account grants performed by this check.
- Remaining checks are interactive controller cookie login and authenticated Socket.IO, intended public-hostname verification, and production/staging auth/schema migration plus Spotify admin/device grants. These need the target host/account context; no DB or Spotify grant was changed here.
