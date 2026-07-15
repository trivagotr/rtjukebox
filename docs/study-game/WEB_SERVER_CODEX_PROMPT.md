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

> **NON-NEGOTIABLE PRODUCTION PRESERVATION RULE:** NEVER AND NEVER DELETE OR NUKE RADIOTEDU.COM FILES, PERSONAL ACCOUNTS WHERE RADIO TEDU DETAILS ARE
> STORED (especially most @tedu.edu.tr accounts), OR WordPress pages. This
> prohibition includes WordPress posts, page revisions, databases, uploads,
> themes, plugins, configuration, mailboxes, home directories, account records,
> credentials, and unrelated Radio TEDU services. Do not run a recursive delete,
> replacement sync with deletion enabled, database reset, account cleanup, or
> destructive WordPress command against production. Use additive changes,
> immutable release directories, verified backups, atomic symlink/root switches,
> and scoped rollback only.

> **ABSOLUTE USER RULE (verbatim):** NEVER AND NEVER DELETE AND NUKE RADIOTEDU.COM FILES, PERSONAL ACCOUNTS (WHERE RADIOTEDU STUFF DETAILS ARE THERE, most @tedu.edu.tr accounts) AND WORDPRESS PAGES.
>
> Interpret that sentence as a prohibition on either deleting or nuking any of
> those assets. It is not limited to doing both actions together. If a deployment
> tool cannot prove its write/delete scope before execution, do not run it.

## 1. Authority, safety, secrets, and stop conditions

- [ ] Confirm you are operating on the intended production host and record the hostname, operating-system release, current UTC time, and deployment user.
- [ ] Confirm the repository remote points to the approved Radio TEDU repository before fetching or changing files.
- [ ] Treat `origin/codex/study-game-oss` as the only source branch authorized by this prompt.
- [ ] Do not modify mobile source, mobile route constants, WebView URLs, payload keys, or Socket.IO paths on the server; make server routing and upstream adapters conform to them.
- [ ] Do not print access tokens, refresh tokens, cookies, passwords, QR secrets, database credentials, private keys, environment-file contents, or full authorization headers.
- [ ] Redact secrets in command output and the final report; show only variable names, configured/not-configured state, and safe path ownership.
- [ ] Do not rotate, replace, or expose production secrets unless separate explicit authority is provided.
- [ ] Do not use destructive Git commands, overwrite the current release in place, or delete the previous release.
- [ ] Inventory and explicitly preserve every existing `radiotedu.com`/Radio TEDU file root, WordPress root and database, personal/home/mail account, and `@tedu.edu.tr` account before any mutation.
- [ ] Confirm that no deployment command uses `--delete`, destructive mirroring, recursive removal, WordPress reset, database recreation, or account pruning against an existing production root.
- [ ] If a path contains mixed Radio TEDU, WordPress, personal-account, or university-account data, do not mutate it in place; create a separate immutable release target and switch only the narrowly owned application route.
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
| Voting project | Mobile WebView `https://radiotedu.com/vote/?embed=1`; website backend REST under `/jukebox/api/v1/next-song-voting` and Socket.IO path `/jukebox/socket.io` | Production Voting website and backend adapter while preserving the Music PC information source. |
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

The kiosk release uses `https://radiotedu.com/juke-local` as its exact API base,
the Socket.IO path `/juke-local/socket.io`, and
`https://radiotedu.com/juke-local/controller/` as the QR/controller link base.
The reverse proxy may strip or map the public `/juke-local` prefix only as needed
to reach the existing Juke-local upstream; it must preserve the controller,
`/api/v1/jukebox/...`, query string, request body, response status, and socket
upgrade behavior. Never route these requests through Voting.

- [ ] Verify `GET https://radiotedu.com/juke-local/controller/` returns the controller document rather than an empty response, directory listing, login redirect, unrelated application shell, or server error.
- [ ] Verify the controller document's relative JavaScript, CSS, images, manifest, and worker URLs resolve correctly beneath `/juke-local/`.
- [ ] Verify trailing-slash behavior preserves `/juke-local/controller/` and does not redirect it to `/jukebox`, Voting, Study, or the site root.
- [ ] Verify the controller's API calls use `https://radiotedu.com/juke-local/api/v1/jukebox/...` and its socket connects through `/juke-local/socket.io`, with no duplicate or missing path prefix.
- [ ] Verify the generated QR/controller URL remains beneath `https://radiotedu.com/juke-local/controller/` and preserves the device/code query value used by the existing QR workflow.
- [ ] Verify camera/QR operation is permitted by HTTPS, response headers, iframe/WebView policy, and controller code without weakening unrelated site security headers globally.
- [ ] Verify a valid Juke-local QR payload is accepted by the existing Jukebox workflow and an invalid payload produces a controlled error.
- [ ] Verify Juke-local does not call `/jukebox/api/v1/next-song-voting/rounds/active` and does not connect to `/jukebox/socket.io` for Voting.
- [ ] Capture a safe baseline response/status for the Juke-local controller and one safe backend health/read operation before other deployments.
- [ ] Do not rewrite Juke-local code unless a public-path adapter is strictly required for the fixed mobile WebView URL.
- [ ] Do not restart or roll back Voting or Study merely to correct Juke-local routing.

## 6. Voting WebView adapter and Music PC freeze rule

Voting is a separate project. The released mobile app does not run a native
Voting REST client, polling loop, Socket.IO client, local round, or fallback
vote. Its fixed WebView URL is `https://radiotedu.com/vote/?embed=1`. The Voting
website owns all round, vote, polling/live-update, and stream communication with
the web server. The website may continue to use the existing backend
`GET /jukebox/api/v1/next-song-voting/rounds/active`,
`POST /jukebox/api/v1/next-song-voting/rounds/{roundId}/votes`, and Socket.IO
path `/jukebox/socket.io`; do not move those backend paths into Juke-local.

Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.

- [ ] Deploy `GET https://radiotedu.com/vote/?embed=1` as the production Voting document with HTTP 200; it currently must not be a 404, directory listing, unrelated WordPress page, login redirect, or generic server error.
- [ ] Preserve `/vote` and `/vote/` trailing-slash/query behavior so the exact mobile URL stays on HTTPS host `radiotedu.com` and exact pathname `/vote/`.
- [ ] Keep the production `/jukebox` API base and `/jukebox/socket.io` path inside the Voting website; do not ask the native app to poll, open a socket, or submit a duplicate vote.
- [ ] Install `window.__RADIOTEDU_SET_AUTH__` before declaring the Voting page ready. The setter must accept `{accessToken, user}`, keep it only in page runtime memory, update it when called again, and clear auth on `{accessToken:null,user:null}`.
- [ ] After the auth setter exists, notify the native WebView with `window.ReactNativeWebView.postMessage(JSON.stringify({type:"radiotedu.voting.ready"}))`.
- [ ] Never place the access token in a URL, query string, cookie, localStorage, sessionStorage, HTML, console output, analytics, access log, or crash report. Redact authorization headers from application and proxy logs.
- [ ] After a successful website-owned vote, the page may post `{type:"radiotedu.voting.vote-recorded",roundId,candidateId}` for UI/analytics only; this message must not trigger another backend vote.
- [ ] Render a normal embedded waiting state when the active-round response is HTTP 200 with `round: null` or the equivalent safe envelope. Do not turn “Aktif oylama oturumu yok” into a connection error.
- [ ] Render active candidates and accurate locked, resolved, cancelled, 401, 403, 409, offline, timeout, and server-error states inside the Voting website without fabricating rounds or votes.
- [ ] Identify and document the existing Music PC Voting information source, transport, process owner, and safe health check without changing its structure.
- [ ] If the server can communicate with the Music PC source, leave that source, protocol, polling/subscription behavior, internal fields, and upstream ownership unchanged.
- [ ] Restrict any Voting correction to the `/vote/` website, public reverse-proxy route, backend-to-website adapter, CORS/upgrade handling, or response translation required by the fixed WebView contract.
- [ ] Verify unauthenticated and authenticated behavior of `GET /jukebox/api/v1/next-song-voting/rounds/active` matches the website authorization policy.
- [ ] Verify the active-round response preserves round identity, candidates, timing/state, and current user vote state in both camelCase and snake_case inputs expected by the Voting website.
- [ ] Verify `POST /jukebox/api/v1/next-song-voting/rounds/{roundId}/votes` accepts the website JSON body and returns the website response envelope.
- [ ] Verify duplicate, closed-round, invalid-candidate, guest, and expired-session vote errors remain explicit and do not become generic HTML responses.
- [ ] Verify WebSocket upgrade headers, same-origin handling, namespace behavior, and Socket.IO path `/jukebox/socket.io` through the public proxy for the website.
- [ ] Verify at least one safe live or synthetic round update reaches the `/vote/` website through the public Socket.IO path.
- [ ] Verify a mobile-sized WebView smoke can load `/vote/?embed=1`, exchange the ready/auth messages without logging a token, show `round: null` as waiting, render an active round, submit exactly one authorized vote, and receive a live update.
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
- [ ] Verify the additive Study migration created/backfilled `study_room_presence.instance_id`, `study_room_presence.client_session_id`, and `study_chat_messages.instance_id` plus the instance-scoped indexes; do not drop or recreate either table.
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

The deployed Study is a mobile-only touch game. Its required gameplay contract
is tap-to-move through collision-safe A* navigation, tap-to-sit on valid seats,
tap while seated to stand, cancellable mid-walk redirection, and no keyboard or
virtual joystick requirement. The compact HUD must preserve the full-screen
canvas and show at most one Chat, People, Wardrobe, or Profile sheet at a time.
The default avatar uses the generated full-angle Radio TEDU hoodie, black cargo,
sneaker, and bucket-hat art with distinct front, rear, profile, and seated poses;
wardrobe changes use the deterministic layered fallback.

### Study logical room-instance contract

Do not create a second backend process when a room fills. One backend owns
server-authoritative logical instances of each physical map. The client still
uses only the physical room IDs `library` and `chim-alan`; the server assigns an
instance ID such as `library-1`, `library-2`, or `chim-alan-2`.

| Concern | Required contract |
| --- | --- |
| Capacity | `library` is 51 users because it has 51 seats. `chim-alan` is 9 users because it has 9 seats. |
| Allocation | Serialize joins per physical room with a PostgreSQL transaction and advisory lock. Fill/reuse the lowest non-full instance number. The 52nd Library user and 10th Çim Alan user enter instance 2. |
| Join | `POST /jukebox/api/v1/study/instances/join` receives authenticated `roomId`, optional `preferredInstanceId`, `nodeId`, `position`, and stable tab-scoped `clientSessionId`; it returns `{ instance: { id, roomId, number, occupancy, capacity, preferredInstanceFull } }`. |
| Reconnect | Reuse a recent assignment for the same account, physical room, and `clientSessionId`. Presence older than the server TTL is excluded from capacity and must rejoin. The client retries one rejoin after a stale-assignment rejection. |
| Presence | `GET /jukebox/api/v1/study/presence?roomId=...&instanceId=...` and `POST /jukebox/api/v1/study/presence/heartbeat` are instance-scoped. A heartbeat may update only the authenticated user's server-issued `instanceId` plus `clientSessionId`; it must not move the user to an arbitrary client-supplied instance. |
| Chat | `GET` and `POST /jukebox/api/v1/study/chat` require the assigned `instanceId`. Never leak presence, seat occupancy, or chat between logical instances. |
| Seats | Seat reservations and occupancy conflicts are isolated by logical instance. Two users may use the same seat ID only when they are in different logical instances. |
| Shared state | Account identity, Study time, Gold, inventory, wardrobe ownership, and equipment remain account-global. Do not copy or reset them when the user changes room instance. |
| HUD | After assignment the Study HUD shows `Room N · occupancy/capacity`; while joining it shows `Finding room…`. |

The Study adapter may remember an assigned instance as a preference, but the
backend remains authoritative. Invalid or cross-room IDs such as requesting
`chim-alan-1` while joining `library` must be rejected before a transaction is
opened. A full preferred room falls back to the lowest non-full room. Empty or
expired instance numbers are reusable; no destructive cleanup job is required.

- [ ] Verify `GET https://radiotedu.com/study/` returns the new exact-commit Study `index.html` with correct HTML content type and no unrelated redirect.
- [ ] Verify `/study/` NEVER redirects or falls through to `/studying-further/`, a WordPress article/page, the site home page, or any other unrelated handler.
- [ ] Verify hashed JavaScript, CSS, maps if published, images, room data, and avatar assets resolve beneath `/study/` with correct MIME types.
- [ ] Verify SPA fallback applies only to safe `/study/` navigation routes and never captures `/jukebox/api/v1/study` API requests or missing hashed assets.
- [ ] Verify `/jukebox/api/v1/study` forwards Bearer authorization, JSON bodies, status codes, and response envelopes to the backend.
- [ ] Verify the reverse proxy forwards `/jukebox/api/v1/study/instances/join`, instance-scoped presence, and instance-scoped chat without stripping query parameters or JSON keys.
- [ ] Verify a candidate/staging concurrency test cannot place more than 51 active users in one Library instance or more than 9 in one Çim Alan instance, and that overflow selects instance 2 without a second backend server.
- [ ] Verify presence, seat occupancy, and chat from `library-1` are invisible in `library-2`, while both instances still read the same authenticated Account and Gold state.
- [ ] Verify a reload in the same WebView tab reuses the tab-scoped `clientSessionId`, a stale assignment receives a rejoin-required response, and the client successfully rejoins once.
- [ ] Verify the production Study gate rejects a normal external browser without `RadioTEDUStudyBridge` rather than creating a local production identity.
- [ ] Verify the app bridge account identity remains the Account platform identity and is not replaced by browser storage.
- [ ] Verify the bridge access token is used only for authenticated API requests and is never written to logs, HTML, query strings, analytics events, localStorage, or sessionStorage.
- [ ] Verify `globalPoints` is presentation bootstrap only and is replaced by authoritative `spendable_points` returned/refetched from the backend.
- [ ] Verify finishing a Study session updates the displayed Gold balance from the authoritative response and a retry does not award twice.
- [ ] Verify an avatar purchase updates the displayed Gold balance from `data.points.spendable_points` or the compatible top-level response and a retry does not spend twice.
- [ ] Verify paid avatar ownership and equipment come from the authenticated backend account, not local browser persistence.
- [ ] Verify the Study page labels the balance `Gold`, labels item prices in Gold, and retains backward-compatible transport fields `globalPoints` and `spendable_points`.
- [ ] Verify the generated `canonical-idle.png`, `canonical-walk.png`, `canonical-sit.png`, `canonical-stand.png`, layered wardrobe sheets, and avatar manifest resolve beneath `/study/assets/avatars/engine-proof/` without stale-cache or MIME errors.
- [ ] On a real mobile-sized browser or app-equivalent WebView, verify tap-to-move follows A* walkable routes, a second floor tap redirects without teleporting, tap-to-sit reaches and reserves an available seat, and a later canvas tap stands the avatar.
- [ ] Verify the Study game has no keyboard-only path, no required keyboard input, and no on-screen joystick; all required movement and sitting actions must work with touch alone.
- [ ] Verify the compact HUD at 320x568, 390x844, and 430x932 keeps the canvas equal to the viewport, uses touch targets at least 44x44 CSS pixels, has no horizontal overflow, and never shows more than one sheet.
- [ ] From `study-game`, run the mobile touch recording and frame analysis (`node scripts/qa-mobile-touch-journey.mjs` followed by `node scripts/analyze-mobile-touch-video.mjs`) against the candidate release; require observed `ready`, `walking`, `sitting`, `seated`, and `standing` states, zero console errors, and `unexpectedFreeze: false`.
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
- [ ] Smoke Voting independently: `/vote/?embed=1` HTTP 200, ready/auth bridge with redacted data, `round: null` waiting UI, active-round REST, exactly one authorized vote, Socket.IO connection/update inside the website, and continued Music PC communication.
- [ ] Smoke Account independently: register/login/guest/refresh/me/logout/logout-all/deletion policy with redacted output.
- [ ] Smoke Gold independently: balance read, one controlled award/spend replay test, non-negative invariant, and reconciliation.
- [ ] Smoke Study independently: `/study/`, hashed assets, authenticated API, bridge gate, logical room allocation, instance-isolated presence/chat, quiz-answer interaction, session finish, avatar purchase, and Gold refresh.
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
- [ ] Report each Juke-local, Voting, Account, Gold, and Study public smoke check with URL/path, method, status code, safe content type/shape, and owning upstream; Voting must explicitly report `/vote/?embed=1`, ready/auth bridge, waiting UI, active candidates, one vote, and one live update without tokens.
- [ ] Report the disposable end-to-end account flow with redacted identifiers and before/after Gold invariants.
- [ ] Report Study room capacity/overflow results, assigned instance IDs, reconnect behavior, and cross-instance presence/chat isolation using only redacted disposable account identifiers.
- [ ] Report that the Music PC Voting information source and acquisition structure were preserved, or leave this check blocked with the exact reason communication could not be verified.
- [ ] Report separate rollback decisions and paths for Juke-local, Voting, Account/Gold, and Study.
- [ ] Report every unmarked checkbox as a blocker or deferred item with a redacted error, owner, impact, and safest next action.
- [ ] End with one status per boundary: `Juke-local`, `Voting`, `Account/Gold`, and `Study`, each marked deployed, unchanged-and-healthy, rolled-back, or blocked.
