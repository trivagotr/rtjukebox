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
- The public site returned 200 at `/jukebox/health` but 404 at `/jukebox/health/live`; the prefixed Spotify callback route reached the backend and returned its expected 400 for a request without OAuth state/code. No IIS/reverse-proxy configuration is present in the workspace, so repair of the deployed health alias must happen in hosting configuration.
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
