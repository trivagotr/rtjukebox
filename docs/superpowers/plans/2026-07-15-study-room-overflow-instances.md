# Study Room Overflow Instances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add atomic, seat-count-limited Study room instances so overflow users enter another logical room without splitting account, Gold, wardrobe, or Study-time state.

**Architecture:** The existing backend remains a single service and atomically assigns `library-N` or `chim-alan-N` instances under a PostgreSQL advisory lock. The Study adapter owns the current assignment and attaches it to presence and chat operations; the HUD exposes the assigned room number while gameplay remains physical-room based.

**Tech Stack:** TypeScript, Express, PostgreSQL, Phaser 3, Vitest, Playwright, Vite.

## Global Constraints

- Library capacity is exactly 51; Çim Alan capacity is exactly 9.
- Presence and chat are instance-scoped; account, Gold, wardrobe, rewards, and Study summaries remain global.
- Instance allocation is server-authoritative and concurrency-safe.
- Schema changes are additive and backward-compatible during rollout.
- Do not modify Jukebox `/juke-local`, Voting, Music PC ingestion, WordPress, unrelated IIS routes, personal accounts, or university accounts.
- NEVER AND NEVER DELETE AND NUKE RADIOTEDU.COM FILES, PERSONAL ACCOUNTS (WHERE RADIOTEDU STUFF DETAILS ARE THERE, most @tedu.edu.tr accounts) AND WORDPRESS PAGES.

---

### Task 1: Pure room-instance contract and allocator

**Files:**
- Create: `backend/src/services/studyRoomInstances.ts`
- Create: `backend/src/services/studyRoomInstances.test.ts`

**Interfaces:**
- Produces: `StudyPhysicalRoomId`, `StudyRoomInstance`, `STUDY_ROOM_CAPACITIES`, `parseStudyRoomInstanceId(value, roomId)`, and `selectStudyRoomInstance(roomId, occupancies, preferredInstanceId)`.

- [ ] **Step 1: Write failing allocator tests**

Cover empty rooms, the 51/52 Library boundary, the 9/10 Çim Alan boundary, sparse lower-number reuse, a non-full preferred instance, a full preferred instance, and invalid cross-room preferences.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/services/studyRoomInstances.test.ts`

Expected: FAIL because `studyRoomInstances.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure allocator**

The selection result must use this shape:

```ts
export interface StudyRoomInstance {
  id: string
  roomId: StudyPhysicalRoomId
  number: number
  occupancy: number
  capacity: number
  preferredInstanceFull: boolean
}
```

It must select the preferred instance when valid and non-full; otherwise the lowest-numbered instance with capacity; otherwise the first missing/new positive number.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/services/studyRoomInstances.test.ts`

Expected: all allocator tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/studyRoomInstances.ts backend/src/services/studyRoomInstances.test.ts
git commit -m "feat(study): define overflow room allocator"
```

### Task 2: Additive schema and atomic join endpoint

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/routes/study.ts`
- Modify: `backend/src/routes/study.test.ts`

**Interfaces:**
- Consumes: Task 1 allocator.
- Produces: `POST /api/v1/study/instances/join` and instance-aware presence rows.

- [ ] **Step 1: Write failing route tests**

Tests must prove:

```ts
expect(mockRouteHandlers.post['/instances/join']).toBeTypeOf('function')
expect(mockClientQuery).toHaveBeenCalledWith('BEGIN')
expect(mockClientQuery.mock.calls.some(([sql]) => String(sql).includes('pg_advisory_xact_lock'))).toBe(true)
expect(mockClientQuery).toHaveBeenCalledWith('COMMIT')
```

Also cover sticky assignment, preferred-full fallback, invalid `instanceId`, rollback, and the exact 51/9 capacities.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/routes/study.test.ts`

Expected: the join route is undefined.

- [ ] **Step 3: Add schema columns and indexes**

Add/backfill `instance_id` and `client_session_id` on `study_room_presence`; add/backfill `instance_id` on `study_chat_messages`. Add `(room_id, instance_id, last_heartbeat_at DESC)` and `(room_id, instance_id, created_at DESC)` indexes. Use only `ADD COLUMN IF NOT EXISTS`, bounded `UPDATE ... WHERE instance_id IS NULL`, and `ALTER COLUMN SET NOT NULL` after backfill.

- [ ] **Step 4: Implement atomic join**

Validate room, node, position, client session, and optional preferred instance. Under a transaction-scoped room advisory lock, reuse a live assignment or count live occupancies, call `selectStudyRoomInstance`, upsert initial presence with the selected instance, and return the assignment. Roll back on every error and release the client.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- src/routes/study.test.ts`

Expected: route suite passes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.sql backend/src/routes/study.ts backend/src/routes/study.test.ts
git commit -m "feat(study): assign atomic overflow instances"
```

### Task 3: Scope presence and chat by assigned instance

**Files:**
- Modify: `backend/src/routes/study.ts`
- Modify: `backend/src/routes/study.test.ts`

**Interfaces:**
- Consumes: `instance_id` assignment from Task 2.
- Produces: instance-scoped presence heartbeat/read and chat read/write behavior.

- [ ] **Step 1: Write failing isolation tests**

Assert SQL predicates contain both `room_id` and `instance_id`, mapped responses expose `instanceId`, an explicit heartbeat cannot create or change an assignment, and mismatched/expired writes return `409` with `Study instance rejoin required`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/routes/study.test.ts`

Expected: instance isolation assertions fail against the physical-room-only SQL.

- [ ] **Step 3: Implement instance isolation**

Add instance parsing and assignment validation. Preserve the temporary missing-instance fallback to `<roomId>-1`, but never allow an explicit instance heartbeat to bypass `/instances/join`. Filter presence and chat by `room_id + instance_id`; map `instanceId` into responses.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/routes/study.test.ts`

Expected: all Study backend route tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/study.ts backend/src/routes/study.test.ts
git commit -m "feat(study): isolate presence and chat instances"
```

### Task 4: Make the Study adapters instance-aware

**Files:**
- Modify: `study-game/src/adapters/StudyAdapter.ts`
- Modify: `study-game/src/adapters/RadioTEDUStudyAdapter.ts`
- Modify: `study-game/src/adapters/LocalStudyAdapter.ts`
- Modify: `study-game/tests/radiotedu-study-adapter.test.ts`
- Modify: `study-game/tests/local-study-adapter.test.ts`

**Interfaces:**
- Produces: `StudyRoomInstance`, `roomInstance(roomId)`, and `enterRoom(roomId, nodeId): Awaitable<StudyRoomInstance>`.

- [ ] **Step 1: Write failing adapter tests**

Prove one join request is deduplicated across concurrent `enterRoom`, presence refresh, heartbeat, and chat; every instance-scoped URL/body carries `instanceId`; switching physical rooms obtains a separate assignment; the local adapter exposes instance 1 with the physical capacity.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/radiotedu-study-adapter.test.ts tests/local-study-adapter.test.ts`

Expected: missing instance APIs and request fields fail.

- [ ] **Step 3: Implement adapter assignment ownership**

Store one assignment and one in-flight join promise per physical room. `enterRoom` starts/deduplicates the join, and `refreshPresence`, `heartbeatPresence`, `refreshChat`, and `sendChat` await it. Do not silently fall back to instance 1 after a failed authoritative join.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/radiotedu-study-adapter.test.ts tests/local-study-adapter.test.ts`

Expected: adapter tests pass.

- [ ] **Step 5: Commit**

```bash
git add study-game/src/adapters study-game/tests/radiotedu-study-adapter.test.ts study-game/tests/local-study-adapter.test.ts
git commit -m "feat(study): carry room instance assignments"
```

### Task 5: Expose the instance in the mobile HUD and debug state

**Files:**
- Modify: `study-game/src/main.ts`
- Modify: `study-game/src/styles.css`
- Modify: `study-game/src/game/ImageRoomScene.ts`
- Modify: `study-game/tests/engine-proof-room.test.ts`
- Modify: `study-game/e2e/study-game.spec.ts`

**Interfaces:**
- Consumes: adapter `roomInstance(roomId)`.
- Produces: accessible `#room-instance` label and `snapshot().instanceId/instanceNumber`.

- [ ] **Step 1: Write failing HUD and browser assertions**

Assert the shell contains an accessible `Room 1` label, changing the adapter assignment updates it, and the debug snapshot contains the same instance ID/number.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/engine-proof-room.test.ts`

Expected: no room-instance label/snapshot fields exist.

- [ ] **Step 3: Implement the compact label**

Add the label beside the room title/status without enlarging the mobile top bar. Resync after the asynchronous `enterRoom` resolves. On assignment failure, display a retryable `ROOM CONNECTION` state and do not start shared presence/chat.

- [ ] **Step 4: Verify GREEN and mobile behavior**

Run: `npm test -- tests/engine-proof-room.test.ts`

Run: `npm run test:e2e -- --grep "room instance"`

Expected: unit and mobile Playwright assertions pass.

- [ ] **Step 5: Commit**

```bash
git add study-game/src/main.ts study-game/src/styles.css study-game/src/game/ImageRoomScene.ts study-game/tests/engine-proof-room.test.ts study-game/e2e/study-game.spec.ts
git commit -m "feat(study): show assigned room instance"
```

### Task 6: Update the canonical production web-server prompt

**Files:**
- Modify: `docs/study-game/WEB_SERVER_CODEX_PROMPT.md`
- Modify: `docs/study-game/verify-web-server-prompt.mjs`

**Interfaces:**
- Produces: paste-ready server instructions for additive migration, atomic allocation, capacity verification, deployment ordering, rollback, and non-destruction.

- [ ] **Step 1: Write failing prompt-verifier assertions**

Require the exact preservation sentence, `/api/v1/study/instances/join`, `library-1`, `chim-alan-2`, capacities 51/9, advisory locking, sticky reconnect, instance-scoped presence/chat, 52/10-user tests, and explicit Jukebox/Voting/Music PC exclusions.

- [ ] **Step 2: Verify RED**

Run: `node docs/study-game/verify-web-server-prompt.mjs`

Expected: missing overflow requirements fail.

- [ ] **Step 3: Update the canonical prompt**

Add a non-negotiable overflow section, additive SQL guardrails, server-first/client-second rollout, health checks, multi-client capacity proof, and rollback that changes only the narrowly owned Study release pointer. Include this exact sentence:

> NEVER AND NEVER DELETE AND NUKE RADIOTEDU.COM FILES, PERSONAL ACCOUNTS (WHERE RADIOTEDU STUFF DETAILS ARE THERE, most @tedu.edu.tr accounts) AND WORDPRESS PAGES.

- [ ] **Step 4: Verify GREEN**

Run: `node docs/study-game/verify-web-server-prompt.mjs`

Expected: prompt verification passes.

- [ ] **Step 5: Commit**

```bash
git add docs/study-game/WEB_SERVER_CODEX_PROMPT.md docs/study-game/verify-web-server-prompt.mjs
git commit -m "docs(study): hand off overflow deployment"
```

### Task 7: Full verification, stress evidence, and push

**Files:**
- Modify only if a confirmed regression requires a focused fix and failing test.

- [ ] **Step 1: Run backend checks**

Run: `npm test`

Run: `npm run build`

Working directory: `backend`.

- [ ] **Step 2: Run Study checks**

Run: `npm test`

Run: `npm run build`

Run: `npm run test:e2e`

Working directory: `study-game`.

- [ ] **Step 3: Run capacity simulation**

Exercise 52 Library and 10 Çim Alan joins with concurrent batches. Expected distributions are `library-1: 51`, `library-2: 1`, `chim-alan-1: 9`, and `chim-alan-2: 1`, with no duplicate user assignment and no instance over capacity.

- [ ] **Step 4: Verify repository scope**

Confirm no application source outside Study/backend and no Jukebox, Voting, Music PC, WordPress, personal-account, or university-account file is staged.

- [ ] **Step 5: Commit any final focused verification artifact and push**

```bash
git push origin codex/study-game-oss
```

Expected: remote branch contains every overflow implementation and prompt commit.
