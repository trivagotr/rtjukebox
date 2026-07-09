/goal Complete and verify the RadioTEDU Study server integration end to end on the radiotedu.com backend. Maintain a live checkbox to-do list, implement every item below, and do not mark the goal complete until the authoritative database, API, security, migration, and integration evidence satisfies every acceptance criterion.

# RadioTEDU Study Server / Backend Codex Prompt

You are working in the backend repository that serves the RadioTEDU mobile app. Build the production server contract for the authenticated Study experience, including Çim Alan, global points, avatar clothes, live room presence, atomic seat reservations, and anti-cheat enforcement.

This prompt is authoritative. Do not invent a second API namespace, a parallel point wallet, a standalone Study website, or another mobile application.

## Operating Rules

1. Read all repository instructions and inspect the current auth, API response envelope, database transaction helpers, migrations, global point ledger, rate limiting, tests, and deployment scripts before editing.
2. Create a checkbox plan in the task and keep exactly one item in progress. Update it after each verified milestone.
3. Work test-first for behavior and security changes. A mocked handler test alone is not sufficient for transaction, constraint, replay, or concurrency guarantees.
4. Reuse existing backend conventions. Do not replace working auth or global points infrastructure with a new subsystem.
5. Make small, reviewable commits. Do not include unrelated formatting, generated files, or refactors.
6. Never trust client-supplied elapsed time, point totals, prices, ownership, equipped state, user IDs, room occupancy, seat occupancy, or reward eligibility.
7. Do not stop after writing a plan or schema. Implement, migrate, test, and verify the complete contract.

## Protected Product Constraints

- Existing Library behavior is already approved. Do not redesign or replace it.
- The invalid standalone prototype path `prototypes/library-iso/` must remain absent and must not be recreated.
- Study is available only through the authenticated RadioTEDU app. Do not expose a public Study page or anonymous gameplay API.
- The existing app login must authorize Study. There is no second Study login, Study password, or Study-specific token.
- Registered users may earn and spend persistent global points. Guests and unauthenticated users may not start reward-bearing sessions, reserve seats, buy clothes, or persist equipment.
- Use the location IDs `library` and `chim-alan` exactly. Reject `cim-alan`, localized display strings, unknown IDs, and client-created room IDs.
- Android Auto and Android Automotive remain media-only. Never expose Study gameplay, rooms, points, clothes, seats, or presence through car browse trees or car templates.

## Canonical API Contract

Mount all canonical Study APIs under `/api/v1/study`. Use the repository's existing success/error envelope and error-code conventions. The mobile app must not have to guess whether payload data is at the root or under `data`.

### Profile

#### `GET /api/v1/study/profile`

Return the authenticated user's server-owned Study state:

```json
{
  "points": {
    "lifetime_points": 0,
    "spendable_points": 0,
    "monthly_points": 0,
    "study_points_today": 0,
    "study_daily_cap": 25
  },
  "activeSession": null,
  "ownedItemIds": [],
  "equipped": {
    "hair": null,
    "top": null,
    "bottom": null,
    "shoes": null,
    "accessory": null
  },
  "locations": [
    {"id": "library", "available": true},
    {"id": "chim-alan", "available": true}
  ],
  "policy": {
    "heartbeatIntervalSeconds": 15,
    "presenceLeaseSeconds": 45,
    "seatLeaseSeconds": 45
  }
}
```

Read balances from the app's existing global point tables and ledger. Do not derive balances by summing client events at request time and do not create a Study-only wallet.

### Reward-Bearing Sessions

#### `POST /api/v1/study/sessions/start`

Request:

```json
{
  "locationId": "chim-alan",
  "clientSessionId": "uuid-or-stable-random-id",
  "appVersion": "1.2.3",
  "sessionType": "free",
  "pomodoroTargetMinutes": null
}
```

Requirements:

- `sessionType` is `free` or `pomodoro`.
- Pomodoro targets are integer minutes within the server policy range.
- A user may have at most one active reward-bearing Study session.
- `(user_id, client_session_id)` is unique and makes a retried start idempotent.
- Generate a cryptographically random heartbeat nonce. Store only its hash.
- Return the session ID, next nonce, server start time, heartbeat interval, and point policy.
- Never accept a starting point balance or an initial elapsed duration.

#### `POST /api/v1/study/sessions/:sessionId/heartbeat`

Request:

```json
{
  "nonce": "single-use-server-issued-nonce",
  "sequence": 4,
  "focused": true,
  "foreground": true,
  "interaction": "walking",
  "position": {"x": 12, "y": 18, "elevation": 1},
  "seatId": null,
  "clientTimestamp": "2026-07-09T12:00:00.000Z"
}
```

Requirements:

- Authenticate the route and prove the session belongs to the authenticated user.
- Lock the active session row before validating and rotating the nonce.
- Accept every nonce once. Store nonce hashes and reject replay.
- Require strictly increasing sequence numbers.
- Treat client timestamps as diagnostics only. All credit uses server timestamps.
- Reject heartbeats that are too frequent, stale, after expiry, after completion, from the wrong app user, or for a different location.
- Cap one heartbeat's eligible gap using server policy. Never credit a long offline gap.
- Credit only foreground, focused, policy-eligible intervals.
- Validate that position changes are possible for the elapsed server time and current map version. Reject impossible teleports, blocked coordinates, invalid elevation transitions, and seat positions without a valid reservation.
- Persist an immutable session event row for accepted heartbeats.
- Rotate and return the next nonce atomically.

#### `POST /api/v1/study/sessions/:sessionId/finish`

Request:

```json
{
  "nonce": "single-use-server-issued-nonce",
  "idempotencyKey": "uuid"
}
```

Requirements:

- Lock the session, user point row, and relevant idempotency row in one transaction.
- Compute eligible seconds from accepted server-timestamped heartbeat events.
- Enforce minimum duration, minimum heartbeat count, and the configured daily Study point cap.
- Award only the server-calculated amount.
- Insert an immutable global ledger row with source `study`, reason, session ID, location ID, delta, before/after balances, policy version, and idempotency key.
- Mark the session completed in the same transaction.
- A retry returns the original successful result and never awards twice.
- An expired or abandoned session awards nothing unless the existing product policy explicitly defines a bounded partial award.

### Room Presence and Seats

#### `GET /api/v1/study/rooms/:roomId`

Return:

- canonical room ID and map version,
- current non-expired participants,
- each participant's validated tile, elevation, interaction, seat ID, display name, and equipped outfit,
- all semantic seats with `seatId`, tile, entry tile, facing, elevation, and occupancy,
- Spark and Rock metadata,
- server time and lease durations.

Do not expose email addresses, auth tokens, private profile fields, IP addresses, or raw anti-cheat data.

#### `POST /api/v1/study/rooms/:roomId/presence/heartbeat`

Request includes `sequence`, validated position, interaction, optional seat ID, and current outfit revision. Use a server lease; remove or hide stale presence after the configured expiry. Rate-limit by authenticated user and IP.

Presence is not a point source. It may not award points independently of a valid reward-bearing Study session.

#### `POST /api/v1/study/rooms/:roomId/seats/:seatId/reserve`

Request:

```json
{"requestId": "uuid", "position": {"x": 12, "y": 17, "elevation": 1}}
```

Atomically reserve an available seat for the authenticated user:

- Verify the seat belongs to the room and map version.
- Verify the user is at the seat's walkable entry tile.
- Use a unique active reservation constraint so two users cannot own one seat.
- Make retries with the same request ID idempotent.
- Return a short server-owned lease and authoritative occupancy.
- Reject occupied, invalid, unreachable, or stale requests with stable error codes.

#### `DELETE /api/v1/study/rooms/:roomId/seats/:seatId/reservation`

Release only the authenticated user's reservation. Also release on presence expiry, room leave, logout, or a new valid seat reservation.

### Avatar Wardrobe

#### `GET /api/v1/study/avatar/catalog`

Return active catalog items with:

- `itemId`, `slot`, title, rarity, server-owned `costPoints`,
- preview/asset key and color metadata used by the app renderer,
- `isDefault`, `enabled`, and catalog revision.

#### `GET /api/v1/study/avatar/me`

Return owned item IDs, equipped items by slot, outfit revision, and current global point balances.

#### `POST /api/v1/study/avatar/purchase`

Request:

```json
{"itemId": "radiotedu-backpack", "idempotencyKey": "uuid"}
```

In one transaction:

- lock the catalog item and global point row,
- reject inactive/unknown items and insufficient spendable points,
- insert ownership under a unique `(user_id, item_id)` constraint,
- debit the existing global wallet without allowing a negative balance,
- create a global ledger spend row with before/after balances,
- return the authoritative wallet and inventory,
- make duplicate requests return the original result without a second debit.

#### `POST /api/v1/study/avatar/equip`

Request:

```json
{"slot": "top", "itemId": "campus-navy-tee", "idempotencyKey": "uuid"}
```

Verify slot compatibility and ownership/default status. Upsert one equipped item per slot, increment the outfit revision, and return the complete authoritative outfit. Do not charge points for equipping an owned item.

## Data Model and Constraints

Adapt names to existing repository conventions, but preserve these guarantees:

- `study_sessions`: user ownership, canonical location, client session uniqueness, status, server timestamps, nonce hash, sequence, eligible seconds, awarded points, policy version.
- `study_session_events`: immutable accepted/rejected security events; unique accepted `(session_id, sequence)`; nonce replay protection.
- `study_room_presence`: one current row per user and room with lease expiry.
- `study_seat_reservations`: one active owner per room and seat plus one active seat per user and room.
- `avatar_items`: server-owned catalog.
- existing user inventory/equipment tables or equivalent unique constraints.
- existing global point ledger: one row per award/spend with idempotency uniqueness.

Add forward and rollback-safe migrations. Backfill defaults without overwriting existing users. Seed a small deterministic catalog only when the repository has no catalog seed mechanism.

## Anti-Cheat and Abuse Controls

- Existing bearer/session auth on every route.
- Registered-account guard for all persistent mutations.
- Strict JSON schema validation and request size limits.
- Per-user and per-IP rate limits for start, heartbeat, presence, reserve, purchase, and equip.
- Nonce hashes, monotonic sequences, idempotency keys, row locks, unique constraints, and database transactions.
- Server time for duration and lease decisions.
- Maximum movement speed and map/elevation validation.
- Daily cap evaluated under lock.
- No points from NPC taps, Spark, Rock, chat, repeated sitting, presence-only heartbeats, or client-provided totals.
- Structured security logs without secrets or raw bearer tokens.

## Legacy Compatibility

The current app may still call:

- `GET /api/v1/gamification/study-room?room_id=...`
- `POST /api/v1/gamification/study-room/heartbeat`

During one mobile release window, keep these as thin authenticated adapters to the canonical room/presence services. Do not duplicate business logic. Add contract tests proving canonical and legacy adapters return equivalent state. Mark adapters for removal only after production telemetry proves the canonical mobile release is adopted.

## Required Tests

Add tests at the repository's normal layers:

1. Auth and account tests: unauthenticated, expired token, guest, registered user, cross-user session access.
2. Contract tests for every request and response shape, including `chim-alan`.
3. Session tests: idempotent start, parallel start race, too-fast/stale/out-of-order heartbeat, nonce replay, teleport, invalid elevation, expiry, minimum duration, daily cap.
4. Finish tests: duplicate and concurrent finish award once; ledger and wallet balances agree.
5. Wardrobe tests: duplicate purchase, parallel purchase, insufficient balance, inactive item, unowned equip, slot mismatch, idempotent equip.
6. Seat tests: two-user reservation race, unreachable entry tile, lease expiry, release ownership, stale presence cleanup.
7. Database integration tests against the real test database for constraints, locks, rollback, and migrations. Do not rely only on mocked `db.query`.
8. Rate-limit and structured error-code tests.
9. Legacy adapter equivalence tests.

## Deployment and Verification

- Run the backend's complete typecheck, lint, unit, integration, and migration verification commands.
- Apply migrations to a disposable database from empty and from the latest prior schema.
- Verify rollback/forward behavior according to repository policy.
- Exercise the canonical API with a real test account and existing app auth token in a non-production environment.
- Confirm logs contain no token, nonce, email, or sensitive payload leakage.
- Document required environment variables and defaults.
- Do not claim radiotedu.com production deployment unless the deployment command and post-deploy smoke tests actually succeed.

## Completion Checklist

Do not close the goal until all are true:

- [ ] One canonical `/api/v1/study` contract is implemented and documented.
- [ ] `library` and `chim-alan` are the only accepted location IDs.
- [ ] Existing app auth works without a second login.
- [ ] No public or standalone Study web entry exists.
- [ ] Sessions, points, ledger, wardrobe, presence, and seat reservations are server-authoritative.
- [ ] Replay, duplicate, concurrency, teleport, cap, and ownership attacks are covered by meaningful tests.
- [ ] Database migrations and constraints are verified against a real test database.
- [ ] Legacy adapters delegate to canonical services without duplicated logic.
- [ ] Android Auto receives no Study gameplay surfaces.
- [ ] Verification commands and their exit codes are recorded.
- [ ] Remaining risks, deployment status, and rollback procedure are reported honestly.
