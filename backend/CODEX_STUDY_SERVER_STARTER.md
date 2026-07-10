/goal Prepare the RadioTEDU Study account, social, inventory, presence, and anti-cheat backend contract without deploying or guessing the final production server topology. Maintain a live checkbox to-do list and stop before deployment or irreversible database work unless the repository owner explicitly confirms the target environment.

# Codex Starter: RadioTEDU Study Server

Use this implementation branch as the client contract and source of truth:

https://github.com/trivagotr/rtjukebox/tree/codex/study-game-oss

Read these files before editing:

- `docs/superpowers/plans/2026-07-10-study-game-final-open-source-plan.md`
- `study-game/src/adapters/StudyAdapter.ts`
- `study-game/src/adapters/LocalStudyAdapter.ts`
- `study-game/src/rooms/data/image-rooms.generated.json`
- `backend/CODEX_STUDY_GLOBAL_POINTS_PROMPT.md`
- `backend/src/routes/study.ts`
- `backend/src/routes/study.test.ts`
- the existing authentication, profile, gamification, database, rate-limit, and socket infrastructure

## Scope

This run is contract-first. The final RadioTEDU server location and ownership may not yet be confirmed. Do not deploy, replace authentication, rotate production secrets, or run destructive migrations. Produce reviewed code, additive migrations, tests, OpenAPI/JSON contract documentation, and a deployment handoff.

Focus on the shared RadioTEDU account and social infrastructure:

1. Reuse the existing authenticated RadioTEDU user. Never create a second Study login or parallel identity table.
2. Treat the existing global point balance as authoritative. Study points are ledger entries that feed the same balance; they are not a client-side counter.
3. Server owns inventory, purchases, equipped appearance, room presence, seat leases, study sessions, and credited time.
4. Client movement animation is presentation only. The server validates legal room transitions, movement envelopes, seat reachability, and elevation transitions using the published room graph.
5. Public room broadcasts contain only public identity presentation, equipped appearance, room/node/seat state, and server timestamps. Never broadcast email, tokens, private profile fields, or anti-cheat secrets.

## Required Contract

Design canonical versioned endpoints or equivalent typed socket commands for:

- bootstrap current Study account, global balance, daily Study progress, inventory, equipped appearance, and server time
- join/leave Library or Chim Alan
- publish rate-limited movement snapshots with monotonic sequence numbers
- claim, renew, and release a seat lease
- subscribe to public room presence and chat
- list wardrobe catalog and owned inventory
- preview, equip, unequip, and purchase a wearable
- start, heartbeat, reconcile, and finish a Study or Pomodoro session
- retrieve immutable point-ledger entries relevant to Study

Return stable machine-readable error codes including:

- `AUTH_REQUIRED`
- `SESSION_EXPIRED`
- `ROOM_NOT_FOUND`
- `INVALID_ROOM_TRANSITION`
- `INVALID_MOVEMENT`
- `INVALID_ELEVATION_TRANSITION`
- `SEAT_OCCUPIED`
- `SEAT_LEASE_EXPIRED`
- `WEARABLE_NOT_FOUND`
- `WEARABLE_NOT_OWNED`
- `INSUFFICIENT_POINTS`
- `IDEMPOTENCY_CONFLICT`
- `NONCE_REPLAY`
- `RATE_LIMITED`

## Anti-Cheat Requirements

- Use the server clock for all leases, session durations, caps, and rewards.
- Issue short-lived rotating session nonces. Every reward heartbeat includes session ID, monotonic sequence, nonce, and idempotency key.
- Consume each nonce once. Do not blindly retry a consumed nonce; provide a reconcile response with the latest accepted sequence.
- Keep an append-only reward ledger with a unique source/idempotency constraint. Balance updates and ledger insertion must be one transaction.
- Enforce daily and per-session reward caps server-side.
- Reject impossible movement speed, teleporting between disconnected graph nodes, skipping required stair edges, claiming unreachable seats, and cross-room seat claims.
- Use short seat leases with renewal and server-side release on disconnect/expiry.
- Rate-limit chat, movement, seat, purchase, equip, and reward operations independently.
- Sanitize chat and enforce length/content policy on the server.
- Never trust client prices, ownership, point balance, elapsed time, room elevation, or reward totals.
- Record security-relevant rejection telemetry without logging tokens, raw authorization headers, or private messages.

## Data And Migration Rules

- Prefer additive, reversible migrations.
- Reuse existing user and global gamification tables where their invariants fit.
- Add explicit uniqueness and foreign-key constraints for inventory, equipped slots, idempotency keys, active seat leases, and reward ledger source IDs.
- Store catalog prices and availability server-side.
- Document cleanup/expiry jobs for stale presence, seats, and sessions.
- Seed development data only in development fixtures; never silently seed production.

## Verification Gate

Do not report completion until tests prove:

- replaying a nonce cannot award twice
- replaying an idempotency key returns the same result or a stable conflict, never a duplicate purchase/reward
- concurrent seat claims produce exactly one winner
- insufficient balance cannot race into a negative balance
- unowned or incompatible wearables cannot be equipped
- disconnected-room and stair-skipping movement is rejected
- daily/session caps hold under concurrent heartbeat requests
- chat and point-affecting actions are rate-limited
- public presence payloads contain no secret/private fields
- existing RadioTEDU auth and non-Study gamification tests still pass

Write a final handoff containing migration order, environment variables, rollback steps, API examples, unresolved production-host questions, and exact test commands. Do not deploy until the server owner and target environment are confirmed.
