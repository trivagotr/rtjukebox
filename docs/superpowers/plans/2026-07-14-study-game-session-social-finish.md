# Study Game Session And Social Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing two-room Study game with a game-like HUD, server-authoritative seated Study time, daily/monthly/all-time summaries, real room presence/chat, player interaction cards, and persisted avatar equipment.

**Architecture:** Keep Phaser and the existing image-room/A* engine. Extend the existing PostgreSQL-backed Study routes with summary, presence, and chat contracts, then add a browser adapter that owns session heartbeats and polling while the scene remains responsible for movement, sitting, wardrobe rendering, and player interaction UI. Local mode remains deterministic for tests and offline development; production mode activates only when an authenticated host bridge supplies an API base and access token.

**Tech Stack:** TypeScript, Phaser, Vite, Vitest, Playwright, Express, PostgreSQL.

## Global Constraints

- Work in `C:/Users/akgul/Downloads/rtjukebox/.worktrees/study-game-oss` on `codex/study-game-oss`.
- Do not build an APK in this task.
- Do not store or accept client-computed points or elapsed Study seconds.
- A Study session starts only after the avatar reaches a seat and ends when the avatar stands, changes rooms, hides the page, or unloads.
- Server heartbeats are nonce-rotated, authenticated, capped, and counted only while focused and foregrounded.
- Guests cannot create sessions, persist presence, chat, buy/equip server wardrobe items, or receive points.
- Library and Cim Alan keep their existing room art, navigation graphs, seats, occlusion, and camera behavior.
- Existing user changes and unrelated dirty files remain untouched.

---

### Task 1: Server Study Summary, Presence, And Chat

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/routes/study.ts`
- Modify: `backend/src/routes/study.test.ts`

**Interfaces:**
- Consumes: authenticated `AuthRequest.user.id`, `study_sessions`, `study_session_events`, `avatar_equipment`, and the global points ledger.
- Produces: `GET /summary`, `GET /presence`, `POST /presence/heartbeat`, `GET /chat`, and `POST /chat` under `/api/v1/study`.

- [ ] **Step 1: Write failing route tests**

```ts
it('returns server-computed daily monthly and all-time Study seconds', async () => {
  mockDbQuery.mockResolvedValueOnce({rows: [{today_seconds: '600', month_seconds: '3600', total_seconds: '7200'}]});
  await mockRouteHandlers.get['/summary']({user: {id: 'user-1'}}, {});
  expect(mockSendSuccess).toHaveBeenCalledWith({}, {
    todaySeconds: 600,
    monthSeconds: 3600,
    totalSeconds: 7200,
  });
});

it('upserts authenticated room presence without trusting elapsed seconds', async () => {
  await mockRouteHandlers.post['/presence/heartbeat']({
    body: {roomId: 'library', nodeId: 'front-left', seatId: 'front-left'},
    user: {id: 'user-1', role: 'user'},
  }, {});
  expect(mockDbQuery.mock.calls[0][0]).toContain('INSERT INTO study_room_presence');
  expect(mockDbQuery.mock.calls[0][0]).not.toContain('studied_seconds_today = $');
});

it('normalizes and stores registered-user chat with a server timestamp', async () => {
  mockDbQuery.mockResolvedValueOnce({rows: [{id: 'm1', user_id: 'user-1', display_name: 'Ada', text: 'Hello', created_at: new Date()}]});
  await mockRouteHandlers.post['/chat']({body: {roomId: 'library', text: '  Hello  '}, user: {id: 'user-1'}}, {});
  expect(mockDbQuery.mock.calls[0][1]).toEqual(['library', 'user-1', 'Hello']);
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run: `npm test -- src/routes/study.test.ts`

Expected: FAIL because the three new route handlers do not exist.

- [ ] **Step 3: Add schema and route implementation**

```sql
CREATE TABLE IF NOT EXISTS study_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(40) NOT NULL CHECK (room_id IN ('library', 'chim-alan')),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_chat_room_created
    ON study_chat_messages(room_id, created_at DESC);
```

Implement summary aggregation from `study_sessions.eligible_seconds`; expire presence after 35 seconds; derive avatar appearance from `avatar_equipment`; accept only normalized room/node/seat values; rate-limit chat per user in SQL to five messages per ten seconds; return standard `sendSuccess`/`sendError` wrappers.

- [ ] **Step 4: Run the route tests and verify GREEN**

Run: `npm test -- src/routes/study.test.ts`

Expected: PASS with zero failed tests.

### Task 2: Client Adapter And Seated Session Tracker

**Files:**
- Modify: `study-game/src/adapters/StudyAdapter.ts`
- Modify: `study-game/src/adapters/LocalStudyAdapter.ts`
- Create: `study-game/src/adapters/RadioTEDUStudyAdapter.ts`
- Create: `study-game/src/session/StudySessionTracker.ts`
- Create: `study-game/tests/study-session-tracker.test.ts`
- Create: `study-game/tests/radiotedu-study-adapter.test.ts`

**Interfaces:**
- Consumes: `window.RadioTEDUStudyBridge = {account, apiBase, accessToken}` in production and the existing local adapter in development.
- Produces: async seat lifecycle, timer snapshots, summary refresh, presence polling, chat polling, and wardrobe equip calls.

- [ ] **Step 1: Write failing tracker and API tests**

```ts
it('starts only after seating and stops on stand', async () => {
  const tracker = new StudySessionTracker(adapter, clock);
  await tracker.seated('library', 'front-left', {x: 4, y: 8});
  clock.advance(31_000);
  expect(tracker.snapshot().activeSeconds).toBe(31);
  await tracker.stood();
  expect(adapter.finishedSessions).toHaveLength(1);
});

it('rotates the server heartbeat nonce', async () => {
  fetchMock.mockResolvedValueOnce(success({session: {id: 's1'}, nonce: 'n1'}));
  fetchMock.mockResolvedValueOnce(success({session: {id: 's1'}, nonce: 'n2', acceptedSeconds: 10}));
  const adapter = new RadioTEDUStudyAdapter(config, fetchMock);
  await adapter.startStudySession('library', 'client-1');
  await adapter.heartbeat({focused: true, foreground: true, interaction: 'seated'});
  expect(fetchMock.mock.calls[1][1].body).toContain('n1');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/study-session-tracker.test.ts tests/radiotedu-study-adapter.test.ts`

Expected: FAIL because the tracker and production adapter do not exist.

- [ ] **Step 3: Implement the minimal adapter and tracker**

The production adapter sends `Authorization: Bearer <accessToken>`, never writes tokens to storage, rotates the session nonce after each accepted heartbeat, and exposes summaries returned by the server. The tracker sends heartbeats every ten seconds, pauses eligibility when hidden or unfocused, updates presence independently, and finishes idempotently on stand/room switch/unload.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/study-session-tracker.test.ts tests/radiotedu-study-adapter.test.ts`

Expected: PASS with zero failed tests.

### Task 3: Game HUD, Player Card, Timer, And Wardrobe

**Files:**
- Modify: `study-game/src/main.ts`
- Modify: `study-game/src/styles.css`
- Modify: `study-game/src/game/ImageRoomScene.ts`
- Modify: `study-game/e2e/study-rooms.spec.ts`

**Interfaces:**
- Consumes: adapter session summaries, presence/chat subscriptions, scene seat lifecycle, and existing wearable layer sprites.
- Produces: compact game HUD, `HH:MM:SS` seated timer, daily/monthly/all-time views, clickable player card with wave/mute controls, real chat log, and visible hat/equipment state.

- [ ] **Step 1: Add failing browser acceptance tests**

```ts
await page.getByTestId('library-seat-front-left').click();
await expect(page.getByTestId('study-timer')).toHaveAttribute('data-running', 'true');
await expect(page.getByTestId('study-summary')).toContainText('Today');

await page.getByTestId('presence-local-selin').click();
await expect(page.getByTestId('player-card')).toContainText('Selin');
await page.getByTestId('player-wave').click();

await page.getByTestId('wardrobe-toggle').click();
await page.getByTestId('wearable-beanie').click();
await expect(page.locator('html')).toHaveAttribute('data-hat-id', 'beanie');
```

- [ ] **Step 2: Run the E2E test and verify RED**

Run: `npm run test:e2e -- --grep "timer|player card|wardrobe"`

Expected: FAIL because timer/summary/player-card test IDs are absent.

- [ ] **Step 3: Implement the HUD and interactions**

Keep the room canvas visually dominant. Place status/timer/points in the top bar, room tabs at the left edge, chat as a bottom dock, wardrobe as one side panel, and the player card as one compact popover. Clicking a presence actor opens the card without moving the local avatar; clicking empty floor still follows the A* route; clicking a seat still walks to its approach before sitting. Render equipped hats for idle/walk/sit/stand using the existing manifest.

- [ ] **Step 4: Run E2E and verify GREEN**

Run: `npm run test:e2e -- --grep "timer|player card|wardrobe"`

Expected: PASS on desktop and mobile Chromium projects.

### Task 4: Build, Screenshot Verification, And WebView Package

**Files:**
- Modify only if packaging tests require it: `mobile/scripts/package-study-game.mjs`
- Output: `mobile/android/app/src/main/assets/study-game/`
- Output: `artifacts/study-game/final/`

**Interfaces:**
- Consumes: `study-game/dist`.
- Produces: packaged WebView assets and screenshot/video evidence; no APK.

- [ ] **Step 1: Run all Study and backend tests**

Run: `npm test` in `study-game`.

Run: `npm test -- src/routes/study.test.ts` in `backend`.

Expected: both exit 0 with zero failed tests.

- [ ] **Step 2: Build the game**

Run: `npm run build` in `study-game`.

Expected: TypeScript and Vite exit 0.

- [ ] **Step 3: Run complete browser acceptance and inspect screenshots**

Run: `npm run test:e2e` in `study-game`.

Expected: desktop/mobile room, route, sitting, timer, player-card, chat, and wardrobe tests pass; screenshots show the entire Library and Cim Alan with no overlapping HUD.

- [ ] **Step 4: Package only the WebView game**

Run: `npm run package:study` in `mobile`.

Expected: packaged Study files match `study-game/dist`; do not run Gradle or produce an APK.
