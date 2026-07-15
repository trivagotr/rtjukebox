# Production web-server adaptation prompt for Codex

You are Codex running on the production Radio TEDU web server. Adapt the web
server to the already-released mobile application contract. Do not redesign the
mobile application, do not edit mobile source on the server, and do not merge
independent projects merely because they share a hostname, reverse proxy, or
backend process.

Work through this document in order. Keep every checkbox in your final report,
mark completed checks, and leave blocked checks unmarked with the exact redacted
reason. Do not claim success from configuration inspection alone: verify the
public routes and the owning upstreams.

## 1. Authority, safety, secrets, and stop conditions

- [ ] Confirm you are operating on the intended production host and record the hostname, operating-system release, current UTC time, and deployment user.
- [ ] Confirm the repository remote points to the approved Radio TEDU repository before fetching or changing files.
- [ ] Treat `origin/codex/study-game-oss` as the only source branch authorized by this prompt.
- [ ] Do not modify mobile source, mobile route constants, WebView URLs, payload keys, or Socket.IO paths on the server; make server routing and upstream adapters conform to them.
- [ ] Do not print access tokens, refresh tokens, cookies, passwords, QR secrets, database credentials, private keys, environment-file contents, or full authorization headers.
- [ ] Redact secrets in command output and the final report; show only variable names, configured/not-configured state, and safe path ownership.
- [ ] Do not rotate, replace, or expose production secrets unless separate explicit authority is provided.
- [ ] Do not use destructive Git commands, overwrite the current release in place, or delete the previous release.
- [ ] Stop before mutation if the live reverse-proxy owner, process owner, static root, database target, or rollback path cannot be determined safely.
- [ ] Stop before migration if a restorable database backup cannot be produced and verified.
- [ ] Stop before release switching if repository tests, backend build, Study build, prompt verification, or migration fails.
- [ ] Stop and report a scoped blocker instead of rewriting one project through another project's backend.

## 2. Fetch and pin the release commit

- [ ] Record the current repository path, branch, commit, worktree status, remotes, and active release symlink without changing them.
- [ ] Fetch `origin/codex/study-game-oss` without merging it into the live checkout.
- [ ] Resolve `origin/codex/study-game-oss^{commit}` to a full immutable commit SHA and record that exact fetched SHA as `DEPLOY_COMMIT` in the deployment log.
- [ ] Verify the fetched commit contains `study-game`, `backend`, `mobile`, `docs/study-game/WEB_SERVER_CODEX_PROMPT.md`, and `docs/study-game/verify-web-server-prompt.mjs`.
- [ ] Run `node docs/study-game/verify-web-server-prompt.mjs` from the fetched tree and stop if it fails.
- [ ] Create an isolated release directory named with the exact fetched SHA; do not build inside the active production directory.
- [ ] Check out or archive only the exact fetched commit into that release directory and verify `git rev-parse HEAD` equals `DEPLOY_COMMIT`.

## 3. Discover and back up the live topology

- [ ] Identify the active reverse proxy and record its service name, binary version, configuration root, enabled-site files, included snippets, and validation command.
- [ ] Export or copy the effective reverse-proxy configuration to a timestamped backup outside the new release directory before editing it.
- [ ] Identify every process manager involved, including systemd, PM2, Docker Compose, containers, supervisors, and static-file services.
- [ ] Record the process/service/container that owns each public path before changing anything.
- [ ] Record the environment-file path and owner for each service without displaying secret values.
- [ ] Record the current backend release directory, Study static root, Juke-local static/controller root, and any Voting adapter location.
- [ ] Record the production database engine, host classification, database name, migration command, and application role without printing credentials.
- [ ] Produce a timestamped restorable database backup and record its path, byte size, checksum, and restore command.
- [ ] Verify the database backup can be read by the appropriate restore/listing tool before migration.
- [ ] Record current health endpoints, listening ports, Unix sockets, upstream names, and service dependencies.
- [ ] Record current public status codes and safe response shapes for Juke-local, Voting, Account, Gold, and Study before deployment.
- [ ] Prepare separate rollback notes for reverse-proxy configuration, backend release, database migration, and Study static release.

## 4. Record the non-mergeable application structure

The public hostname may share infrastructure, but these are three independent
projects plus two shared platform services:

| Boundary | Existing mobile entry point | Server responsibility |
| --- | --- | --- |
| Juke-local / Jukebox project | `https://radiotedu.com/juke-local/controller/` | Jukebox controller WebView, QR workflow, and `/juke-local` resources only. |
| Voting project | REST under `/jukebox/api/v1/next-song-voting` and Socket.IO path `/jukebox/socket.io` | Mobile-facing Voting adapter while preserving the Music PC information source. |
| Study project | `https://radiotedu.com/study/` and API `/jukebox/api/v1/study` | Authenticated Study game static release and Study API. |
| Account platform | `/jukebox/api/v1/auth` and `/jukebox/api/v1/profile` | Shared identity, sessions, profile, logout, and account deletion. |
| Gold economy | `user_points` and `points_ledger` | Shared authoritative Gold balance, award ledger, spend ledger, and replay protection. |

- [ ] Map each row above to its current reverse-proxy location, upstream service, process manager, release path, log path, and rollback action.
- [ ] Confirm Juke-local / Jukebox project, Voting project, and Study project have separate route blocks or unambiguous path ownership.
- [ ] Confirm no `/juke-local` location proxies Voting or Study traffic.
- [ ] Confirm no Voting location serves the Juke-local controller or Study assets.
- [ ] Confirm `/study/` does not shadow `/jukebox/api/v1/study` and neither path falls through to an unrelated single-page application.
- [ ] Keep restarts and rollback decisions scoped to the owning project whenever the live topology permits it.

## 5. Juke-local / Jukebox preservation and QR checks

The mobile Jukebox section is a WebView. Its fixed page is
`https://radiotedu.com/juke-local/controller/`. That controller talks to the
Juke-local backend and owns the QR reading workflow. Voting is not part of this
controller.

- [ ] Verify `GET https://radiotedu.com/juke-local/controller/` returns the controller document rather than an empty response, directory listing, login redirect, unrelated application shell, or server error.
- [ ] Verify the controller document's relative JavaScript, CSS, images, manifest, and worker URLs resolve correctly beneath `/juke-local/`.
- [ ] Verify trailing-slash behavior preserves `/juke-local/controller/` and does not redirect it to `/jukebox`, Voting, Study, or the site root.
- [ ] Verify the controller's API and socket calls remain scoped to the existing `/juke-local` backend contract.
- [ ] Verify camera/QR operation is permitted by HTTPS, response headers, iframe/WebView policy, and controller code without weakening unrelated site security headers globally.
- [ ] Verify a valid Juke-local QR payload is accepted by the existing Jukebox workflow and an invalid payload produces a controlled error.
- [ ] Verify Juke-local does not call `/jukebox/api/v1/next-song-voting/rounds/active` and does not connect to `/jukebox/socket.io` for Voting.
- [ ] Capture a safe baseline response/status for the Juke-local controller and one safe backend health/read operation before other deployments.
- [ ] Do not rewrite Juke-local code unless a public-path adapter is strictly required for the fixed mobile WebView URL.
- [ ] Do not restart or roll back Voting or Study merely to correct Juke-local routing.

## 6. Voting mobile adapter and Music PC freeze rule

Voting is a separate project. The mobile app reads the active round with
`GET /jukebox/api/v1/next-song-voting/rounds/active`, submits a vote with
`POST /jukebox/api/v1/next-song-voting/rounds/{roundId}/votes`, and listens for
live round changes on the `radiotedu.com` origin using Socket.IO path
`/jukebox/socket.io`.

Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.

- [ ] Identify and document the existing Music PC Voting information source, transport, process owner, and safe health check without changing its structure.
- [ ] If the server can communicate with the Music PC source, leave that source, protocol, polling/subscription behavior, internal fields, and upstream ownership unchanged.
- [ ] Restrict any Voting correction to the server-to-mobile adapter, public reverse-proxy route, CORS/upgrade handling, or response translation required by the existing mobile contract.
- [ ] Verify unauthenticated and authenticated behavior of `GET /jukebox/api/v1/next-song-voting/rounds/active` matches the current mobile authorization policy.
- [ ] Verify the active-round response preserves the fields already consumed by mobile, including the round identity, candidates, timing/state, and any current user vote state.
- [ ] Verify `POST /jukebox/api/v1/next-song-voting/rounds/{roundId}/votes` accepts the current mobile JSON body and returns the current mobile response envelope.
- [ ] Verify duplicate, closed-round, invalid-candidate, guest, and expired-session vote errors remain explicit and do not become generic HTML responses.
- [ ] Verify WebSocket upgrade headers, origin handling, namespace behavior, and Socket.IO path `/jukebox/socket.io` through the public proxy.
- [ ] Verify at least one safe live or synthetic round update reaches a test client through the public Socket.IO path.
- [ ] Verify Voting routes do not use the `/juke-local` controller, `/juke-local` API, or Juke-local QR workflow.
- [ ] Do not change the Music PC software, Music PC database, Music PC file format, internal Voting source, or acquisition structure when communication already works.
- [ ] Do not restart or roll back Juke-local or Study solely because the Voting mobile adapter changes.

## 7. Account platform migration and route checks

The mobile app owns credentials locally and calls the Account platform under
`/jukebox/api/v1/auth`. Preserve the existing JSON response envelope and field
names. Registered accounts and guests are different authorization states.

- [ ] Verify the production secret preflight requires non-empty access-token and refresh-token signing secrets before backend startup.
- [ ] Verify `POST /jukebox/api/v1/auth/register` normalizes supported email input, hashes the password, returns a sanitized account, and never returns `password_hash`.
- [ ] Verify `POST /jukebox/api/v1/auth/login` returns the current `user`, `access_token`, and `refresh_token` fields used by mobile.
- [ ] Verify `POST /jukebox/api/v1/auth/guest` creates a guest account with guest authorization boundaries rather than a registered account with missing fields.
- [ ] Verify `POST /jukebox/api/v1/auth/refresh` rotates a valid refresh token and rejects an invalid, expired, or revoked token.
- [ ] Verify `GET /jukebox/api/v1/auth/me` accepts the Bearer token forwarded by the proxy and returns only the sanitized current identity.
- [ ] Verify `POST /jukebox/api/v1/auth/logout` accepts `{ "refresh_token": "..." }`, revokes only the matching session, and is idempotent without revealing whether a token existed.
- [ ] Verify `POST /jukebox/api/v1/auth/logout-all` requires a registered/authenticated session and revokes all refresh sessions for that account.
- [ ] Verify `DELETE /jukebox/api/v1/auth/account` requires `{ "confirmation": "DELETE" }`.
- [ ] Verify registered account deletion additionally requires the current password and rejects a wrong password without deleting or logging out the account.
- [ ] Verify confirmed guest account deletion follows the guest policy without inventing a password.
- [ ] Verify successful account deletion atomically removes refresh sessions and the account-owned dependent rows covered by database cascades/policy.
- [ ] Verify failed account deletion rolls back and leaves identity, Gold, Study inventory, and profile data unchanged.
- [ ] Verify `GET` and `PUT /jukebox/api/v1/profile/me` preserve the current mobile profile contract.
- [ ] Verify the proxy forwards `Authorization`, `Content-Type`, request bodies, status codes, and JSON responses for Account routes.
- [ ] Verify Account logs redact credentials, authorization headers, access tokens, refresh tokens, and password material.

## 8. Gold economy migration, invariants, and reconciliation

Gold and the existing points system are the same economy. Do not create a
second wallet or a new `gold` database column. `spendable_points` is the current
Gold balance. `lifetime_points` is historical Gold earned and is not reduced by
spending. `points_ledger` is the audit trail.

- [ ] Inspect the migration SQL at the exact fetched commit and record every additive Account/Gold schema change before applying it.
- [ ] Verify `points_ledger.idempotency_key` and `points_ledger.balance_after` exist after migration.
- [ ] Verify the partial unique index for account plus Gold idempotency key exists and is valid.
- [ ] Verify the database enforces `spendable_points >= 0` for every account.
- [ ] Verify market redemptions have their additive idempotency key and unique account/key index.
- [ ] Verify a positive Gold award increments `lifetime_points`, `spendable_points`, monthly/category totals, and writes one positive `points_ledger` entry.
- [ ] Verify replaying the same award idempotency key does not increment Gold, rankings, category totals, or ledger count again.
- [ ] Verify Study finish uses stable key `study:finish:{sessionId}` and returns the authoritative `spendable_points`.
- [ ] Verify QR reward keys are scoped as `qr:{rewardId}:{userId}`.
- [ ] Verify game award keys are scoped from the mobile `client_round_id` and a replay does not award twice.
- [ ] Verify listening awards only the delta between the new cumulative earned amount and stored `points_awarded`.
- [ ] Verify a Gold spend reduces only `spendable_points`, never `lifetime_points` or earned category totals, and writes one negative `points_ledger` entry.
- [ ] Verify market and avatar prices come from server-owned catalog rows, not a mobile/WebView price.
- [ ] Verify Market and Study avatar purchase spend, inventory/redemption creation, stock mutation, and negative ledger entry commit in one transaction.
- [ ] Verify insufficient Gold rolls back without inventory, redemption, stock, balance, or ledger changes.
- [ ] Verify replaying a successful market or avatar purchase returns the original ownership/redemption state and does not spend or decrement stock again.
- [ ] Verify two concurrent spends serialize on the account balance and cannot make `spendable_points` negative.
- [ ] Run a read-only reconciliation comparing `user_points.spendable_points` with ordered positive/negative `points_ledger` mutations and record discrepancies without silently repairing them.
- [ ] Stop the Account/Gold release if reconciliation, non-negative constraints, idempotency indexes, or transactional spend checks fail.

## 9. Build, migrate, and release backend and Study independently

- [ ] Install dependencies in the isolated exact-commit release using the repository lockfiles and the production Node version; do not replace lockfiles on the server.
- [ ] Run the complete backend test suite from `backend` and record the number of passed files/tests and zero failures.
- [ ] Run the backend TypeScript build from `backend` and record the exit code.
- [ ] Run the complete Study test suite from `study-game`, including generator and Vitest suites, and record totals.
- [ ] Run the Study production build from `study-game` and verify `study-game/dist/index.html` plus hashed assets exist.
- [ ] Verify the built Study bundle contains Gold labeling and does not contain the old `<span>PTS</span>` balance label.
- [ ] Reconfirm the timestamped database backup, checksum, and restore command immediately before migration.
- [ ] Apply the repository's database migration using the backend's production environment and record only safe migration names/status.
- [ ] Verify Account and Gold constraints/indexes after migration before starting the new backend.
- [ ] Create or update an immutable backend release target for `DEPLOY_COMMIT` and preserve the previous target.
- [ ] Start the candidate backend on an isolated port/socket or use the process manager's safe reload mechanism without taking Juke-local or Voting down unnecessarily.
- [ ] Run local candidate health and contract checks before switching the public backend upstream.
- [ ] Switch the backend release atomically and validate the process manager reports the intended exact commit/release path.
- [ ] Deploy `study-game/dist` to a new immutable Study static release directory named with `DEPLOY_COMMIT`.
- [ ] Switch only the `/study/` static root or symlink atomically to the new Study release and preserve the previous Study release.
- [ ] Validate reverse-proxy configuration before reload and reload only after validation succeeds.
- [ ] Do not point `/study/` at the repository source tree, Vite development server, mobile bundle, Juke-local directory, or Voting directory.

## 10. Authenticated app-only Study bridge and WebView behavior

The native app opens `https://radiotedu.com/study/`. It injects an authenticated
`RadioTEDUStudyBridge` with the signed-in account, an access token, the Study API
base, and the current global balance. The Study production adapter calls
`/jukebox/api/v1/study`. The browser page must not invent a production account
or persist production Gold.

- [ ] Verify `GET https://radiotedu.com/study/` returns the new exact-commit Study `index.html` with correct HTML content type and no unrelated redirect.
- [ ] Verify hashed JavaScript, CSS, maps if published, images, room data, and avatar assets resolve beneath `/study/` with correct MIME types.
- [ ] Verify SPA fallback applies only to safe `/study/` navigation routes and never captures `/jukebox/api/v1/study` API requests or missing hashed assets.
- [ ] Verify `/jukebox/api/v1/study` forwards Bearer authorization, JSON bodies, status codes, and response envelopes to the backend.
- [ ] Verify the production Study gate rejects a normal external browser without `RadioTEDUStudyBridge` rather than creating a local production identity.
- [ ] Verify the app bridge account identity remains the Account platform identity and is not replaced by browser storage.
- [ ] Verify the bridge access token is used only for authenticated API requests and is never written to logs, HTML, query strings, analytics events, localStorage, or sessionStorage.
- [ ] Verify `globalPoints` is presentation bootstrap only and is replaced by authoritative `spendable_points` returned/refetched from the backend.
- [ ] Verify finishing a Study session updates the displayed Gold balance from the authoritative response and a retry does not award twice.
- [ ] Verify an avatar purchase updates the displayed Gold balance from `data.points.spendable_points` or the compatible top-level response and a retry does not spend twice.
- [ ] Verify paid avatar ownership and equipment come from the authenticated backend account, not local browser persistence.
- [ ] Verify the Study page labels the balance `Gold`, labels item prices in Gold, and retains backward-compatible transport fields `globalPoints` and `spendable_points`.
- [ ] Verify clicking or tapping a quiz answer does not close the Study WebView, navigate to an external page, dismiss the game, or trigger an unhandled form submission.
- [ ] Verify correct and incorrect quiz answers update only in-game state and the next-question control remains usable.
- [ ] Verify Android hardware back behavior is controlled by the native app and ordinary in-game taps do not masquerade as navigation/back events.

## 11. Disposable end-to-end Account, Gold, and Study check

Use a uniquely named disposable registered test account approved for production
smoke testing. Do not use a real student's account. Redact credentials and
tokens from output.

- [ ] Register or provision the disposable account through the public Account route and record only the account ID suffix and status code.
- [ ] Log in through the public route and verify `/auth/me` returns the same sanitized identity.
- [ ] Record the starting `spendable_points`, `lifetime_points`, and relevant `points_ledger` count using safe redacted output.
- [ ] Open Study through an app-equivalent authenticated bridge and verify the displayed Gold equals the Account platform `spendable_points`.
- [ ] Complete one valid Study award flow and verify exactly one positive ledger mutation and one authoritative balance increase.
- [ ] Retry the identical Study finish and verify Gold and ledger count do not change again.
- [ ] Purchase one affordable non-default Study avatar item with one stable idempotency key.
- [ ] Verify one negative ledger mutation, owned inventory, unchanged `lifetime_points`, and matching mobile/Study `spendable_points`.
- [ ] Retry the identical avatar purchase and verify no second spend or inventory mutation.
- [ ] Log out the current refresh-token session and verify that refresh token can no longer rotate.
- [ ] Log in again, request account deletion with the wrong password, and verify the account, Gold, inventory, and session remain intact.
- [ ] Delete the disposable account with confirmation and the correct password.
- [ ] Verify the deleted account cannot log in or refresh and its account-owned sessions/profile/Gold/Study inventory are removed according to policy.
- [ ] Remove only disposable smoke-test artifacts not already removed by account deletion and record the cleanup result.

## 12. Independent public smoke checks and rollback decisions

- [ ] Smoke Juke-local independently: controller status/content, static assets, one safe QR validation path, and its existing backend health.
- [ ] Smoke Voting independently: active-round REST, one authorized validation path, Socket.IO connection/upgrade, and continued Music PC communication.
- [ ] Smoke Account independently: register/login/guest/refresh/me/logout/logout-all/deletion policy with redacted output.
- [ ] Smoke Gold independently: balance read, one controlled award/spend replay test, non-negative invariant, and reconciliation.
- [ ] Smoke Study independently: `/study/`, hashed assets, authenticated API, bridge gate, quiz-answer interaction, session finish, avatar purchase, and Gold refresh.
- [ ] Compare all public status codes, response content types, safe response shapes, upstream owners, and latency against the captured baseline.
- [ ] Inspect scoped reverse-proxy, backend, Juke-local, Voting, and Study logs for new errors without printing secrets.
- [ ] If Juke-local alone fails, roll back only the Juke-local route/config/release change and re-smoke Juke-local.
- [ ] If Voting alone fails, roll back only the mobile-facing Voting adapter/proxy change; preserve the working Music PC source and re-smoke Voting.
- [ ] If Account/Gold fails, roll back the backend release and reverse-proxy upstream; use the recorded database recovery plan only after assessing whether the additive migration can safely remain.
- [ ] If Study alone fails, atomically restore the previous `/study/` static release without rolling back Juke-local or Voting.
- [ ] Validate reverse-proxy configuration before every rollback reload.
- [ ] After any rollback, repeat the independent smoke checks for the rolled-back boundary and verify unaffected boundaries remain healthy.
- [ ] Do not declare a global success if one boundary is failed, degraded, unverified, or rolled back unsuccessfully.

## 13. Required final report

- [ ] Report the exact deployed `DEPLOY_COMMIT` full SHA and confirm it equals the fetched `origin/codex/study-game-oss` commit used for the release.
- [ ] Report the immutable backend and Study release paths, active symlink/static-root targets, and preserved previous-release paths.
- [ ] Report reverse-proxy service name/version, changed configuration paths, validation result, and reload timestamp.
- [ ] Report process-manager service/container names, active release paths, safe health status, and scoped restart/reload actions.
- [ ] Report the database backup path, checksum, verified restore/listing result, migration result, and rollback/recovery path without credentials.
- [ ] Report backend, Study, and prompt-verifier commands with exit codes and test totals.
- [ ] Report each Juke-local, Voting, Account, Gold, and Study public smoke check with URL/path, method, status code, safe content type/shape, and owning upstream.
- [ ] Report the disposable end-to-end account flow with redacted identifiers and before/after Gold invariants.
- [ ] Report that the Music PC Voting information source and acquisition structure were preserved, or leave this check blocked with the exact reason communication could not be verified.
- [ ] Report separate rollback decisions and paths for Juke-local, Voting, Account/Gold, and Study.
- [ ] Report every unmarked checkbox as a blocker or deferred item with a redacted error, owner, impact, and safest next action.
- [ ] End with one status per boundary: `Juke-local`, `Voting`, `Account/Gold`, and `Study`, each marked deployed, unchanged-and-healthy, rolled-back, or blocked.
