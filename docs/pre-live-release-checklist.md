# Pre-live release checklist

This checklist covers changes recorded in `backend-refactor-progress.md` and keeps the existing production backend separate from the isolated `backend-refactor/` scaffold.

## Release target

- Deploy the existing `backend/` service for this release. Do not switch traffic to `backend-refactor/`: its Identity slice is not mounted, the remaining domain modules are placeholders, and its initial Prisma migration has not been reconciled with the live schema/token formats.
- A future cutover needs a staging database snapshot, a mapped legacy schema baseline, bcrypt-to-scrypt identity compatibility, token compatibility/expiry policy, migrated domain modules, and a rollback rehearsal. No live cutover is included here.

## Database and services

- Back up the target database and run `npm run db:migrate` from `backend/` against the intended staging database. The current migrator applies the idempotent `src/db/schema.sql` transaction; the added `auth_login_attempts` and `spotify_oauth_states` tables must exist after it completes.
- Verify the migration on the target with `SELECT to_regclass('public.auth_login_attempts'), to_regclass('public.spotify_oauth_states');`. Then exercise login lockout and both Spotify OAuth state flows in staging.
- The workspace `.env` points at a hosted Neon database. No migration was run against it because its role as staging or production has not been established.
- Configure `REDIS_URL`; readiness checks both the rate-limit Redis client and BullMQ worker. Ensure the `uploads` directory exists and is writable.

## Auth and browser configuration

- Configure strong `JWT_SECRET`, `JWT_REFRESH_SECRET`, `HEALTHCHECK_TOKEN`, and exact `CORS_ORIGINS` values. The controller uses HttpOnly, SameSite=Strict cookies and requires the API and web origin to be same-site. If deployment uses cross-site origins, add an explicit CSRF design before changing cookie policy.
- New JWTs carry issuer and audience. `JWT_ALLOW_LEGACY_TOKENS=true` is a temporary compatibility setting for existing sessions; turn it off after the 30-day refresh-token lifetime has elapsed. Setting it false immediately forces existing users to sign in again.
- Configure the controller and kiosk API origins, Spotify client credentials, and fixed Spotify callback URL. Validate cookie set/refresh/logout and Socket.IO authentication through the production reverse proxy.
- Health probes are available at `/health/live` and `/health/ready`, plus `PUBLIC_BASE_PATH` aliases. Readiness requires a bearer `HEALTHCHECK_TOKEN` and returns a generic status only.

## Verification record

- Backend build and focused auth/health tests passed after guest refresh was disabled, JWT issuer/audience validation was added, and browser cookie auth was implemented.
- Controller production build and component tests passed after the token moved out of `localStorage`.
- Mobile production-source typecheck and focused auth/podcast/QR tests passed. The old whole-project `tsc` command still includes stale game tests; those game files were left untouched under the no-games scope.
- Docker is unavailable in this workspace, so the Postgres/Redis Testcontainers integration suite could not run. A staging DB/Redis/Spotify smoke test remains required before rollout.
