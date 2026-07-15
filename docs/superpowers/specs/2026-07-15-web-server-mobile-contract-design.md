# Web Server–Mobile Contract Design

## Purpose

The production web server must adapt its public interfaces to the RadioTEDU
mobile application. The mobile application is the consumer contract. Existing
working integrations behind the server, especially the Voting project's Music
PC connection, are protected implementation details.

The server handoff must describe three independent projects. A shared hostname,
reverse proxy, or historical URL prefix does not make them one project.

## Project boundaries

| Project | Mobile-facing production contract | Ownership rule |
| --- | --- | --- |
| Juke-local / Jukebox | WebView at `https://radiotedu.com/juke-local/controller/` | Owns the Jukebox controller, QR workflow, and `/juke-local` resources. It does not own Voting or Study. |
| Voting | REST at `https://radiotedu.com/jukebox/api/v1/next-song-voting/...` and Socket.IO at `https://radiotedu.com/jukebox/socket.io` | Independent voting service. Its public mobile adapter may use an existing shared reverse proxy, but it must not be implemented as part of Juke-local. |
| Study | WebView at `https://radiotedu.com/study/` and authenticated API at `https://radiotedu.com/jukebox/api/v1/study` | Independent Study game and API. It must be deployed, tested, and rolled back independently of Juke-local and Voting. |

The `/jukebox` text inside a production URL is an existing infrastructure
prefix. It is not evidence that the Voting project belongs to Juke-local.

## Shared platform services do not merge the projects

Account and Gold are shared application-platform services. They may be used by
more than one RadioTEDU product, but that does not combine Juke-local, Voting,
or Study into one project.

- `users.id` is the canonical account identity wherever an authenticated
  RadioTEDU feature requires a user.
- The main backend owns authentication, profiles, refresh sessions, the Gold
  balance, and the Gold ledger.
- Juke-local remains independent. Do not make Juke-local depend on Account or
  Gold unless its already-deployed contract explicitly requires them.
- Voting remains independent. Do not insert Account or Gold into the protected
  Music PC path. A mobile-facing Voting endpoint may validate a user or device
  only when the current Voting contract requires it.
- Study consumes Account and Gold as external platform contracts. It does not
  create local production accounts or maintain a second production balance.
- A failure in Account or Gold must be reported as a platform dependency
  failure; it must not be “fixed” by merging product services or copying user
  balances into another database.

## Current implementation and readiness gaps

The repository already contains most of the Account and Gold foundation. The
handoff must distinguish verified existing behavior from work still required
for production readiness.

### Existing Account foundation

- `POST /jukebox/api/v1/auth/register` creates a registered account.
- `POST /jukebox/api/v1/auth/login` authenticates a registered account.
- `POST /jukebox/api/v1/auth/guest` creates a guest session.
- `POST /jukebox/api/v1/auth/refresh` rotates a refresh token and returns a new
  access/refresh pair.
- `GET /jukebox/api/v1/auth/me` returns the current sanitized identity.
- `POST /jukebox/api/v1/auth/upload-avatar` updates the account avatar.
- `GET /jukebox/api/v1/profile/me` and `PUT /jukebox/api/v1/profile/me` expose
  the authenticated profile contract.
- The mobile client stores access and refresh tokens, sends bearer
  authentication, restores `/auth/me`, and clears local credentials on logout.
- The Study WebView receives an authenticated account and API session through
  the existing app-only bridge.

### Account gaps that must be closed

- Local mobile logout currently clears the device but does not revoke the
  corresponding server refresh session. Production readiness requires a
  server-side logout/revocation contract.
- There is no complete account-deletion route even though the mobile product
  exposes account-deletion language. Production readiness requires an
  authenticated, deliberate deletion flow that revokes sessions and removes
  or anonymizes dependent personal data according to the database ownership
  policy.
- Registration, login, refresh, profile loading, logout, and deletion must
  return one stable sanitized user shape. Password hashes, token hashes,
  internal guest email addresses, and security metadata must never be returned.
- Refresh rotation and concurrent refresh behavior must be verified so one
  consumed refresh token cannot mint more than one valid successor session.
- Rate limits, validation, normalized email handling, role checks, and secret
  redaction must be verified on the live route actually used by the app.

### Existing Gold foundation

- Gold and the existing points system are the same economy. A second currency
  must not be created.
- `user_points.spendable_points` is the authoritative spendable Gold balance.
- `user_points.lifetime_points` is the historical Gold-earned total used for
  progress and ranking. Spending Gold never reduces this historical total.
- Awarding Gold increments `lifetime_points`, `spendable_points`, the monthly
  total, and the relevant category total in one server-controlled operation.
- `points_ledger` is the existing audit source for Gold awards.
- Current earning sources include Study completion, Pomodoro completion, QR
  rewards, arcade results, and verified listening activity.
- Study awards are server-calculated from accepted heartbeat activity and are
  currently capped at 25 Gold per account per day.
- Market redemptions and Study avatar purchases spend
  `spendable_points`; Study loads that same value as its global balance.
- Registered accounts may earn and spend Gold. Guest accounts may see
  applicable content but must not receive a persistent earn/spend balance.

### Gold gaps that must be closed

- Product copy is inconsistent: the Study client says `PTS` and mobile market
  copy says spendable `XP`. All user-facing spendable-currency copy must say
  **Gold**, while backward-compatible API/database field names remain
  `spendable_points` until a separately versioned migration is justified.
- Every spend must write a negative Gold ledger entry in the same database
  transaction as the balance reduction and purchased/redemption record.
- Every award and spend must have a stable idempotency identity. Retrying a
  Study finish, reward claim, score submission, listening heartbeat, market
  redemption, or avatar purchase must not change Gold twice.
- The Study client already sends an avatar-purchase idempotency key, but the
  current server purchase route does not enforce it. The server contract must
  store and reject/replay duplicate keys safely.
- Award source identity must be protected by an appropriate uniqueness rule;
  the presence of `source_type` and `source_id` in the ledger is not by itself
  duplicate protection.
- Concurrent purchases must lock the account balance and must never allow
  `spendable_points` to become negative.
- The server, not a WebView or mobile payload, is authoritative for prices,
  reward amounts, ownership, daily caps, and balances.
- Gold balance responses must be refreshed after an award or spend so the
  native app and Study show the same account balance without maintaining local
  production ledgers.

## Non-negotiable Voting boundary

The web-server prompt must reproduce this instruction verbatim:

> “Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.”

Operationally, this means:

- Preserve the existing Music PC host, port, protocol, authentication,
  polling/push behavior, message schema, timing, and song-information source
  whenever the current web server can communicate with it.
- Preserve the existing voting engine and Music PC data flow. Do not replace,
  relocate, redesign, or merge it into Juke-local.
- Change only the mobile-facing Voting adapter: request routing, response
  normalization, authentication forwarding, CORS where applicable, and
  Socket.IO delivery required by the current mobile contract.
- If the Music PC cannot be reached, diagnose and report the exact boundary
  that failed. Do not invent a replacement data source or modify the Music PC
  integration without separate approval.
- Never route Voting through `/juke-local`, reuse the Juke-local controller as
  its UI, or couple their service restarts and rollback procedures.

## Mobile-facing data flows

### Juke-local / Jukebox

1. The native Jukebox tab opens `/juke-local/controller/` in a WebView.
2. The Juke-local controller owns its QR reading and Jukebox-specific actions.
3. Web-server routing for `/juke-local` must remain scoped to this project.
4. Changes to Voting or Study must not alter Juke-local behavior.

### Voting

1. The native Voting screen fetches the active round from
   `GET /jukebox/api/v1/next-song-voting/rounds/active`.
2. It submits a vote to
   `POST /jukebox/api/v1/next-song-voting/rounds/{roundId}/votes`.
3. It receives live round events from the `radiotedu.com` Socket.IO origin
   using path `/jukebox/socket.io`.
4. The server-side Voting adapter translates this mobile contract to the
   existing Voting implementation while leaving the Music PC side unchanged.
5. Voting is deployed and verified as its own project even when its public
   routes share a reverse proxy with another service.

### Study

1. The native Study flow opens `/study/` in the authenticated app WebView.
2. The static Study client is built from `study-game` and published at the
   exact `/study/` base path.
3. Study uses the authenticated `/jukebox/api/v1/study` API family.
4. Direct ordinary-browser access remains locked according to the existing
   app-only bridge policy.
5. Study deployment includes its static client, backend support, additive
   database migration, security policy, smoke tests, and a project-specific
   rollback path.

## Account system production contract

### Canonical identity

- The PostgreSQL `users.id` UUID is the only production identity key shared by
  Account, Profile, Gold, and Study.
- Email is the registered login identifier and must be normalized consistently
  before uniqueness checks.
- Guest identity is explicitly marked with `is_guest` and role `guest`; an
  internal guest email must never be presented as a real account email.
- Display name and avatar are profile attributes, not authentication factors.
- Study account identity must come from the authenticated mobile bridge and
  bearer token. Query parameters, local-storage identities, and client-supplied
  user IDs are not trusted identity sources.

### Session lifecycle

1. Register or login returns a sanitized user plus short-lived access token and
   longer-lived refresh token.
2. Only a hash of each refresh token is stored server-side.
3. Refresh consumes the current token and rotates to a new pair.
4. Authenticated requests resolve the user from the bearer token and reject
   expired, malformed, or incorrectly signed tokens.
5. Logout revokes the current refresh session before the mobile client removes
   its local tokens.
6. Logout-all and account deletion revoke every refresh session for that user.
7. Account deletion requires fresh authentication or an equivalent deliberate
   confirmation and returns no sensitive deleted record.
8. Mobile session restoration calls `/auth/me`; failure clears invalid local
   state instead of constructing a user from cached profile data.

### Authorization boundaries

- Registered-account-only Account, Gold, and Study mutations return `401` for
  missing/invalid authentication and `403` for authenticated guest accounts.
- Users may read and mutate only their own profile, balance, inventory,
  equipment, Study sessions, presence, and chat identity.
- Moderator/admin roles are checked server-side and never accepted from a
  client body or WebView bridge.
- Account deletion cascades only through tables that are owned by the user;
  legally or operationally required aggregate/audit records are anonymized or
  retained according to the established production policy.

### Account API compatibility

- Existing endpoint paths and response fields consumed by the mobile app must
  remain backward compatible.
- New logout, session-revocation, and account-deletion behavior is additive.
- Error bodies must be stable enough for the mobile client to distinguish
  validation, authentication, authorization, conflict, rate-limit, and server
  failures without exposing internal SQL or token details.
- The web server must forward `Authorization` and JSON bodies to Account routes
  without caching authenticated responses.

## Gold economy production contract

### Naming and field mapping

| Meaning | Product-facing name | Backward-compatible field |
| --- | --- | --- |
| Current amount available to spend | Gold balance | `spendable_points` |
| Total Gold ever earned | Lifetime Gold | `lifetime_points` |
| Gold earned in the current month | Monthly Gold | `monthly_points` |
| Gold attribution by activity | Category earnings | `listening_points`, `events_points`, `games_points`, `social_points`, `jukebox_points` |

`spendable_points` and Gold are the same value. The server must not maintain a
separate `gold` column, Gold wallet, or second ledger that can drift from the
existing points tables.

### Award transaction

For each accepted earn event, one database transaction must:

1. Validate the authenticated registered account and server-owned reward rule.
2. Resolve a stable `(user_id, source_type, source_id)` or equivalent
   idempotency identity.
3. Return the original result without a second mutation when that identity was
   already processed.
4. Increment spendable, lifetime, monthly, and category totals by the same
   non-negative Gold amount.
5. Insert one positive ledger record containing the source and safe metadata.
6. Commit all changes together or roll them all back.
7. Return the authoritative new Gold balance and awarded amount.

### Spend transaction

For each market redemption or avatar purchase, one database transaction must:

1. Validate the account, catalog item, server-owned price, availability,
   ownership rules, and idempotency key.
2. Lock the account balance row.
3. Replay the original successful response when the same idempotency key is
   retried by the same account.
4. Reject insufficient Gold without changing inventory, redemption state, or
   ledger.
5. Reduce `spendable_points` only; never reduce lifetime or category totals.
6. Insert one negative ledger entry with item, price, and purchase source.
7. Insert the ownership or redemption record.
8. Commit together and return the authoritative remaining Gold balance.

### Balance invariants

- `spendable_points >= 0` for every account.
- The Gold displayed by mobile and Study comes from the same account row.
- Client-side cached Gold may be optimistic presentation only and is replaced
  by the next authoritative response.
- Every non-zero balance mutation has exactly one ledger entry.
- The sum of ledger mutations must be reconcilable with the current spendable
  balance, allowing only explicitly documented migration/opening adjustments.
- Daily caps use server time and the production timezone policy; clients cannot
  reset a cap by changing device time or locale.
- Prices and reward amounts are integers; malformed, fractional, negative, or
  excessive values are rejected before database mutation.

### Account–Gold–Study flow

1. Mobile authenticates the registered account.
2. Mobile opens Study with the existing authenticated app-only bridge.
3. Study loads `/study/summary` and `/study/avatar/me`; the returned
   `spendable_points` becomes the displayed Gold balance.
4. The server measures accepted Study activity from heartbeat/session state.
5. Finishing the session awards Gold idempotently and returns the updated
   authoritative summary.
6. Buying an avatar item spends the same Gold balance transactionally and
   updates authoritative inventory.
7. Returning to native mobile refreshes gamification/account data so both
   surfaces show the same Gold balance.

## Account and Gold failure handling

- If Account is unavailable, Study must show an authenticated-session failure
  and must not fall back to a local production identity.
- If the Gold balance cannot be loaded, purchases and rewards fail closed; the
  UI must not assume a zero balance mutation succeeded.
- A database timeout after a client request is handled by retrying with the
  same idempotency key, not by issuing a new logical transaction.
- A duplicate award or purchase returns/reconstructs the original result and
  does not surface as a second success with another balance change.
- Partial transaction failures roll back balance, ledger, inventory, and
  redemption changes together.
- Reconciliation discrepancies stop Gold-affecting deployment and produce a
  redacted diagnostic report; they are not repaired with guessed balances.

## Server adaptation strategy

The handoff prompt will use a compatibility-adapter strategy:

- Discover the live topology before changing configuration or services.
- Record the existing process, route, and upstream owner for each project.
- Treat the mobile URLs and payload expectations as acceptance criteria.
- Make the smallest server-side changes necessary to satisfy those criteria.
- Keep Juke-local, Voting, and Study in separate route blocks, service
  ownership descriptions, deployment steps, health checks, and rollback steps.
- Stop when a requested change would require modifying a protected working
  Music PC integration and report the blocker instead.

## Handoff prompt structure

The updated web-server Codex prompt will be an ordered checkbox checklist with
these sections:

1. Safety, secrets, backups, and live-topology discovery.
2. Three-project boundary confirmation.
3. Exact mobile route and payload contract inventory.
4. Juke-local preservation and verification.
5. Voting mobile-adapter verification or correction, with the Music PC side
   explicitly frozen when communication works.
6. Account schema, token lifecycle, profile, logout/revocation, and deletion
   readiness.
7. Gold naming, award/spend ledger, idempotency, concurrency, and reconciliation
   readiness.
8. Study source checkout, tests, build, migration, and deployment.
9. Cross-surface Account/Gold/Study verification using one short-lived test
   account.
10. Independent production smoke tests for all three projects.
11. Independent rollback decisions and a final deployment report.

Every action will be written as a checkbox. The prompt will forbid broad
catch-all rewrites, cross-project service restarts, silent endpoint changes,
secret disclosure, and unrelated refactoring.

## Error handling and rollback

- A failure in one project must not trigger an automatic change or rollback in
  another project.
- Failed Study deployment rolls back Study static files, Study backend changes,
  and its migration only as required by the established production procedure.
- Failed Voting mobile adaptation rolls back only the mobile-facing adapter;
  the Music PC integration remains untouched.
- Failed Juke-local checks stop the handoff and preserve the pre-change
  Juke-local release.
- The server Codex must report status codes, service names, deployed commits,
  configuration locations, and rollback locations without exposing secrets.

## Verification design

Before the handoff commit is described as ready:

- Run the complete `study-game` test suite and production build.
- Run the backend test suite and TypeScript build.
- Verify Account registration, login, refresh rotation, `/auth/me`, logout
  revocation, profile isolation, guest restrictions, and account deletion with
  redacted test data.
- Verify Gold award and spend invariants, positive and negative ledger entries,
  idempotent retries, insufficient-balance rejection, and concurrent purchase
  safety against a disposable test database.
- Verify a single registered test account sees the same Gold balance in native
  gamification responses and Study before and after a Study reward and avatar
  purchase.
- Run the relevant mobile tests for Juke-local WebView routing, Study WebView
  routing, quiz interaction safety, and Voting endpoint construction.
- Inspect the final prompt for unresolved placeholders, contradictory project
  ownership, missing checkbox actions, and accidental Voting/Juke-local merges.
- Confirm the committed branch and exact commit exist on GitHub before placing
  the commit SHA in the server handoff.
