# Mobile 1.3.6 backend handoff — 2026-09-05

Ready for deployment approval; **not deployed**. No production migration, release switch, service restart, or production account/balance mutation was performed.

## Source and active release

- Backend repository: https://github.com/trivagotr/rtjukebox
- Branch: `backend/mobile-136-durable-recovery-20260905`
- Tested source commit: `ecbd13a0ff509c072a5e954074c1351ff890eb8f`
- Local backend: `C:\Users\tuna.ozsari\codex-work\backend-mobile-136-20260905\backend`
- Active release: `C:\inetpub\rtjukebox-releases\20260828-ecosystem-r1`.
- Verified through `C:\Users\tuna.ozsari\server-autostart\RadioTEDU-AppSupervisor.ps1`: application `jukebox-study-api-3000`, working directory above, `node dist\server.js`. Port 3000 listener PID 34036 was a child of supervisor PID 4088. Re-resolve PIDs at deployment; do not reuse these historical numbers.
- The live compiled score handler has no `game_score_recoveries` reference. It still claims volatile proof state before its transaction.
- Fetched the backend remote before reconciliation. Commit `a4947d23` records newer live backend source over the July Git backend; `a64e3017` preserves concurrent live Study source/tests. A final comparison found no remaining differences between that baseline and live source. Existing dirty checkouts were untouched.
- Timestamped pre-edit backups: `C:\Users\tuna.ozsari\codex-work\backend-mobile-136-backups`.
- Mobile evidence commit `f3cfd03d6ba28f3b1cd5b2f6d9a752d00571600f` was fetched from `radiotedu/rtai-mobile`. It contains verification/documentation, not the handler implementation. The Antigravity archive path was absent; its claimed 83/12 results were not reused as verification.

## Changes relative to the reconciled release

- `src/routes/gamification.ts`: serialize score transactions on the authenticated user row, recover committed outcomes before claiming a proof, persist outcome with score/wallet/ledger, discard uncertain connections, and use current-month rank totals for `/me` and `/home`.
- `src/services/gameScoreRecovery.ts`: versioned SHA-256 fingerprint binds user, game, round, session, nonce, score, duration, and submission source. Raw nonces are not persisted. Numeric score/duration must be safe integers; round IDs are limited to the existing 120-character score-column limit.
- `src/db/migrations/20260905_game_score_recovery.sql`: additive recovery table keyed by `(user_id, client_round_id)`.
- `src/routes/auth.ts`: logout reports database failures as retryable errors; restores `/logout-all` with transaction locking and session-family socket revocation.
- New tests: `src/routes/gameScoreRecovery.integration.test.ts`, `src/services/gameScoreRecovery.test.ts`.
- Updated tests: `src/routes/authLifecycle.test.ts`, `src/routes/gamification.test.ts`, `src/services/goldTransactions.test.ts`.
- The earlier reconciliation commits include existing server changes, not additional mobile work. No Android, iOS, terminal, or mobile UI files were changed.

## API behavior

Authenticated `POST /api/v1/gamification/games/<game-id>/score`:

```json
{"score":100,"play_duration_ms":5000,"session_id":"<issued-session-id>","nonce":"<issued-nonce>","client_round_id":"<original-round-id>","submission_source":"mobile_game"}
```

First success and an exact retry both return **201**, with the same original success body. For a game with rate 0.02 and sufficient daily allowance, an example is:

```json
{"success":true,"data":{"score":100,"points_awarded":2,"spendable_points":102},"message":"Game score submitted"}
```

The wallet value in a replay is the original committed outcome, not a new wallet snapshot; normal account refresh returns the current wallet. Zero-award outcomes retain the existing omission of `spendable_points`.

Changed valid payload under the same user/round: **409**, `game_round_payload_mismatch`. Missing session/nonce: **400**, `game_session_required`. Authentication and game eligibility still apply. Cross-user proof use is rejected. No request may create a second score or Gold award for a committed round.

No app changes or rebuild are required for this backend behavior: the v1.3.6 source already retains the exact payload. The build computer's earlier isolated verification script expects replay status 200 plus `replayed:true`; update that **verification expectation** to the original 201 body. Do not change the app to regenerate nonce/session/duration on retry.

## Verification

- `npm run build`: passed, TypeScript exit 0.
- Full backend suite with isolated DB enabled: **68 files passed; 637 tests passed; 2 skipped**, exit 0.
- Includes **20 real PostgreSQL integration tests** and **18 fingerprint tests**. Covers exact retry, all changed identity fields, cross-user/game attempts, concurrent identical/conflicting requests, in-flight locking, daily cap and zero awards, rollback including failed rollback transport, both sides of ambiguous COMMIT, a fresh Node process, registration/login/refresh rotation/logout over HTTP, and wallet/ledger/account endpoint agreement including an old monthly cache.
- Two pre-existing voting integration tests require separate opt-in and were skipped. No mobile tests/builds were run.
- An unrestricted final run timed out under host contention. The final passing run used two workers and a 30-second test timeout.

Reproduce from the backend directory, with a dedicated synthetic PostgreSQL cluster on **127.0.0.1:55436**, database **mobile136_test**. Never point this suite at production or copy production data:

```powershell
$env:NODE_ENV='test'
$env:GAME_RECOVERY_TEST_DATABASE_URL='postgres://mobile136_test@127.0.0.1:55436/mobile136_test'
$env:JWT_SECRET='synthetic-test-secret-only'
$env:JWT_REFRESH_SECRET='synthetic-refresh-secret-only'
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=30000
```

The integration suite rejects any other host, port, or database before initialization, uses synthetic accounts, and does not load a production environment file. It creates the relevant actual table definitions and the additive recovery migration. The test cluster's retained data directory is `C:\Users\tuna.ozsari\codex-work\backend-mobile-136-testdb-20260905`.

## Deployment requiring approval

1. Recheck the active supervisor configuration, listener ownership, Git remote, and current live source. Preserve any changes since this handoff; never replace live source from the older upstream checkout. Back up each target before editing.
2. Prepare a new release directory, suggested `C:\inetpub\rtjukebox-releases\20260905-mobile136-recovery-r1`, retaining the current release's runtime assets, configuration references and uploads. Overlay the reconciled backend source and build output only after checking for newer source. Do not copy production credentials into Git or the build computer archive.
3. Using existing server-side database access, apply **only** `src/db/migrations/20260905_game_score_recovery.sql`, with stop-on-error and a single transaction. Do not run the full bootstrap schema or seed scripts on production. Keep all existing score, wallet, ledger, and recovery rows.
4. Back up the supervisor script. Change only the port-3000 application's `WorkingDirectory` and corresponding `RequiredPaths` to the new release. Reload that supervisor configuration and replace only the verified port-3000 backend process. Leave unrelated app processes and infrastructure services running. Coordinate this short restart window; never kill all Node processes or restart PostgreSQL/IIS/ERP/Audio Library.
5. Perform the checks below. Stop rollout and restore the old application release if they fail.

## Safe post-deployment verification

1. Inspect supervisor configuration and actual port-3000 process ownership again; verify the new release path and startup logs. Check `GET http://127.0.0.1:3000/health` and the existing public health route if configured.
2. Compare the new release's compiled artifacts to the reviewed build. SHA-256 values for this local build:
   - `dist/routes/auth.js`: `7ede78d836a346f8f019d40091a9997e8e512edd5290bebf71d1236d24a7f1f5`
   - `dist/routes/gamification.js`: `8bbbce1c7733df0e1643b855dd5849e16ec0ea410b7452da3e6df9cfb6bef6a7`
   - `dist/services/gameScoreRecovery.js`: `0fe8bd3370c77e2b8c74af06a775e5e38781029b5e478a8bd754a557e0b99bf3`
3. In a read-only SQL transaction verify `to_regclass('public.game_score_recoveries')`, its primary key and column definitions. Do not enumerate users, tokens, or balances. Check logs for missing-table, deadlock, or score-transaction errors.
4. An unauthenticated score POST must return 401 without changing data. With an already-authorized session, use only GET `/api/v1/auth/me`, `/api/v1/auth/session`, `/api/v1/gamification/me`, and `/api/v1/gamification/home` to compare the corresponding wallet/current-month fields. Never print tokens or personal account data in the handoff.
5. Run the same recovery suite against the dedicated isolated database using the deployed source/build version. This exercises retry/award behavior without submitting scores or changing balances in production. Do not register synthetic users or test Gold writes against production.

## Rollback and limitations

- Restore the backed-up supervisor configuration and previous release, then replace only the port-3000 backend process. Leave the additive recovery table and every committed row in place. Never roll back wallets/ledgers or delete recovery rows. Old application code will again reject used-proof retries; accounting remains protected by the existing unique round constraint.
- Previously committed rounds without a stored fingerprint cannot be safely backfilled from score alone. They remain non-recoverable/conflicting rather than accepting changed nonce/duration/session.
- Uncommitted proofs remain in memory as before; an application restart can expire an uncommitted game. Durable recovery applies to committed outcomes.
- Existing full bootstrap `schema.sql` fails on a fresh empty database because it references `study_player_reports` before creation. This separate fresh-install ordering problem is not required for, and must not be worked around during, the additive production migration.
- Antigravity's source archive was unavailable; these are independently implemented and tested changes. Do not describe production as fixed until the approved deployment and post-deployment checks have completed.
