# Account, Gold, Study, and Server Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing RadioTEDU Account and points economy production-ready as one Account-owned Gold system, keep Juke-local, Voting, and Study strictly separate, deploy the completed Study game, and provide the web-server Codex with an exact checkbox deployment contract.

**Architecture:** The main backend remains the source of truth for accounts, refresh sessions, Gold balances, Gold ledger entries, Study rewards, catalog prices, inventory, and purchases. `spendable_points` remains the backward-compatible database/API field for the user-facing Gold balance; no second currency is introduced. The mobile app and authenticated Study WebView consume the same account and balance, while Juke-local and Voting retain independent routes, services, deployment ownership, and rollback boundaries.

**Tech Stack:** TypeScript, Express, PostgreSQL, Vitest, React Native, Jest, Vite, Phaser, Socket.IO, Markdown deployment runbook, Git/GitHub.

## Global Constraints

- Juke-local/Jukebox, Voting, and Study are three independent projects.
- Juke-local remains at `https://radiotedu.com/juke-local/controller/`; Voting must never be routed through or deployed as part of `/juke-local`.
- Voting keeps its mobile REST contract under `/jukebox/api/v1/next-song-voting/...` and live events at `/jukebox/socket.io` unless a separately approved versioned contract changes it.
- The web-server prompt must include verbatim: “Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.”
- Gold and points are the same economy. `spendable_points` is spendable Gold; `lifetime_points` is historical Gold earned and is not reduced by spending.
- Existing public JSON field names remain backward compatible. User-facing spendable-currency copy becomes `Gold`.
- Guests cannot persistently earn or spend Gold and cannot use registered-account-only Study mutations.
- The server owns identity, reward amounts, prices, balance mutations, inventory, daily caps, and authorization decisions.
- Every Gold mutation is transactional, idempotent, ledgered, and unable to make the spendable balance negative.
- Do not add dependencies; no package-lock change is required.
- Preserve and do not stage the pre-existing modified QA artifacts, generated Playwright output, `study-game/scripts/qa-random-walk.mjs`, or the already-modified `backend/package-lock.json`.
- Use TDD for every behavior change: failing focused test, minimal implementation, focused pass, then broader suite.

---

## File Structure

### Backend Account and Gold ownership

- Modify `backend/src/db/schema.sql`: add Gold idempotency/audit columns and database invariants.
- Modify `backend/src/db/migrate.test.ts`: lock the additive schema contract.
- Modify `backend/src/services/gamification.ts`: make award operations idempotent and add the canonical spend operation.
- Modify `backend/src/services/gamification.test.ts`: test Gold field/category helpers.
- Create `backend/src/services/goldTransactions.test.ts`: test award/spend transaction behavior against mocked database calls.
- Modify `backend/src/routes/auth.ts`: add logout, logout-all, and confirmed account deletion.
- Create `backend/src/routes/authLifecycle.test.ts`: test refresh-session revocation and deletion without leaking private fields.
- Modify `backend/src/routes/gamification.ts`: pass stable award keys and make market redemption an idempotent Gold spend.
- Modify `backend/src/routes/gamification.test.ts`: test duplicate reward/redemption behavior and returned Gold balance.
- Modify `backend/src/routes/study.ts`: make Study finishing and avatar purchase use the canonical Gold transaction service.
- Modify `backend/src/routes/study.test.ts`: test duplicate finish/purchase, insufficient Gold, and ledger consistency.

### Mobile Account and Gold consumers

- Modify `mobile/src/context/AuthContext.tsx`: call server logout, expose confirmed account deletion, and always clear credentials safely.
- Create `mobile/__tests__/accountLifecycle.test.ts`: test logout/delete request construction and local credential cleanup.
- Modify `mobile/src/services/gamificationService.ts`: send stable market-redemption idempotency keys and type authoritative Gold responses.
- Modify `mobile/__tests__/gamificationService.test.ts`: verify idempotency payloads and Gold response shapes.
- Modify `mobile/src/screens/ProfileScreen.tsx`: expose deliberate account deletion and retain normal logout.
- Modify `mobile/src/screens/HomeScreen.tsx`, `mobile/src/screens/MarketScreen.tsx`, `mobile/src/screens/EventsScreen.tsx`, `mobile/src/screens/GamesScreen.tsx`, and `mobile/src/screens/LeaderboardScreen.tsx`: use `Gold` for spendable/reward copy without renaming API fields.
- Create `mobile/__tests__/goldAccountContract.test.ts`: enforce user-facing Gold copy and prevent `PTS`/spendable `XP` regressions.

### Study consumer and deployment handoff

- Modify `study-game/src/main.ts`: label the authoritative balance as Gold.
- Modify `study-game/src/adapters/RadioTEDUStudyAdapter.ts`: preserve the same `spendable_points` mapping and consume authoritative mutation responses.
- Modify `study-game/tests/radiotedu-study-adapter.test.ts`: verify the same account-owned balance before and after purchase/session refresh.
- Create `study-game/tests/gold-account-contract.test.ts`: enforce Gold labeling and the single-balance contract.
- Rewrite `docs/study-game/WEB_SERVER_CODEX_PROMPT.md`: detailed checkbox runbook for three independent projects, Account, Gold, Study deployment, verification, and rollback.
- Create `docs/study-game/verify-web-server-prompt.mjs`: deterministic contract checker for the handoff prompt.

---

### Task 0: Repair the Pre-existing Mobile Baseline

**Files:**
- Modify: `mobile/__tests__/config.test.ts`
- Modify: `mobile/src/services/playbackQueue.ts`
- Modify: `mobile/src/screens/next-song-vote/NextSongVoteScreen.tsx`
- Create: `mobile/src/services/notificationService.ts`
- Create: `mobile/src/services/networkQualityPolicy.ts`

**Interfaces:**
- Preserves the Focus and Social URL fields already consumed from `resolveApiConfig`.
- Makes channel playback resolve unavailable quality before constructing a track.
- Keeps Voting independent from Juke-local while requiring a registered Account.
- Restores the tested notification and network-quality service contracts omitted during branch consolidation.

- [x] **Step 1: Verify the five baseline failures**

Run the five suites independently and record the exact expected failures:
`config.test.ts`, `radioChannels.test.ts`, `nextSongVoteNavigation.test.ts`,
`notificationService.test.ts`, and `languageAndFlacReadiness.test.ts`.

- [x] **Step 2: Confirm root causes against history and working patterns**

- Config expectations predate the consumed Focus/Social return fields.
- `buildChannelTrack` bypasses `resolveStreamQuality`, and generic RadioTEDU
  matching wins before Spark/Rock aliases.
- Voting lost the registered-account `AuthGuard` used by the independent Social
  screen.
- Notification and network-quality tests were consolidated without the small
  production service files already implemented on the source branch.

- [x] **Step 3: Apply one minimal fix per root cause**

Update only the files listed above. Restore the two omitted services from their
last complete implementations, use the existing AuthGuard pattern, resolve
track quality before URL selection, and match specific mount aliases before
the generic main-channel fallback.

- [x] **Step 4: Run the five focused suites**

Run: `npm test -- --runInBand __tests__/config.test.ts __tests__/radioChannels.test.ts __tests__/nextSongVoteNavigation.test.ts __tests__/notificationService.test.ts __tests__/languageAndFlacReadiness.test.ts`

Working directory: `mobile`

Expected: 5 suites PASS.

- [x] **Step 5: Run the complete mobile baseline**

Run: `npm test -- --runInBand`

Working directory: `mobile`

Expected: all mobile suites PASS before Account/Gold implementation starts.

- [x] **Step 6: Commit the baseline repair**

```bash
git add mobile/__tests__/config.test.ts mobile/src/services/playbackQueue.ts mobile/src/screens/next-song-vote/NextSongVoteScreen.tsx mobile/src/services/notificationService.ts mobile/src/services/networkQualityPolicy.ts docs/superpowers/plans/2026-07-15-account-gold-study-deployment-handoff.md
git commit -m "fix(mobile): restore verified readiness baseline"
```

---

### Task 1: Add Gold Ledger Idempotency and Balance Invariants

**Files:**
- Modify: `backend/src/db/schema.sql:464`
- Modify: `backend/src/db/migrate.test.ts`
- Modify: `backend/src/services/gamification.ts`
- Modify: `backend/src/services/gamification.test.ts`
- Create: `backend/src/services/goldTransactions.test.ts`

**Interfaces:**
- Consumes: PostgreSQL `user_points` and `points_ledger` tables.
- Produces: `awardUserPoints(params, client?): Promise<GoldMutationResult>` and `spendUserPoints(params, client?): Promise<GoldMutationResult>`.
- Produces type:

```ts
export interface GoldMutationResult {
  applied: boolean;
  amount: number;
  spendablePoints: number;
  ledgerId: string;
}

export interface AwardUserPointsParams {
  userId: string;
  amount: number;
  category: LedgerCategory;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface SpendUserPointsParams {
  userId: string;
  amount: number;
  category: LedgerCategory | 'market' | 'study';
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}
```

Both functions accept an optional PostgreSQL `PoolClient`. Without one they
own `BEGIN`/`COMMIT`/`ROLLBACK`; with one they participate in the caller's
transaction and never commit or roll back it themselves. This is required so
balance, ledger, inventory, stock, and redemption writes can be atomic.

- [x] **Step 1: Write failing schema-contract tests**

Add assertions to `backend/src/db/migrate.test.ts`:

```ts
expect(schemaSql).toContain('ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS idempotency_key');
expect(schemaSql).toContain('ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS balance_after');
expect(schemaSql).toContain('idx_points_ledger_user_idempotency');
expect(schemaSql).toContain('user_points_spendable_nonnegative');
```

- [x] **Step 2: Run the schema test and verify RED**

Run: `npm test -- --run src/db/migrate.test.ts`

Working directory: `backend`

Expected: FAIL because the Gold columns, unique index, and non-negative constraint do not exist.

- [x] **Step 3: Add the additive schema**

Append immediately after the existing `points_ledger` indexes in `backend/src/db/schema.sql`:

```sql
ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS balance_after INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_user_idempotency
ON points_ledger(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_points_spendable_nonnegative'
    ) THEN
        ALTER TABLE user_points
        ADD CONSTRAINT user_points_spendable_nonnegative
        CHECK (spendable_points >= 0);
    END IF;
END $$;
```

- [x] **Step 4: Write failing transaction tests**

Create `backend/src/services/goldTransactions.test.ts` with mocked pool-client behavior covering:

```ts
it('awards Gold once for the same account idempotency key', async () => {
  const first = await awardUserPoints({
    userId: 'user-1', amount: 10, category: 'games',
    sourceType: 'arcade_game', sourceId: 'submission-1',
    idempotencyKey: 'game:submission-1',
  });
  const replay = await awardUserPoints({
    userId: 'user-1', amount: 10, category: 'games',
    sourceType: 'arcade_game', sourceId: 'submission-1',
    idempotencyKey: 'game:submission-1',
  });
  expect(first).toMatchObject({applied: true, amount: 10});
  expect(replay).toMatchObject({applied: false, amount: 10});
});

it('spends only spendable Gold and records a negative ledger amount', async () => {
  const result = await spendUserPoints({
    userId: 'user-1', amount: 40, category: 'study',
    sourceType: 'avatar_purchase', sourceId: 'bucket-hat',
    idempotencyKey: 'avatar:purchase-1',
  });
  expect(result).toMatchObject({applied: true, amount: -40, spendablePoints: 60});
});

it('rejects a spend that would make Gold negative', async () => {
  await expect(spendUserPoints({
    userId: 'user-1', amount: 101, category: 'market',
    sourceType: 'market_redemption', sourceId: 'reward-1',
    idempotencyKey: 'market:redeem-1',
  })).rejects.toThrow('INSUFFICIENT_GOLD');
});
```

- [x] **Step 5: Run the Gold transaction test and verify RED**

Run: `npm test -- --run src/services/goldTransactions.test.ts`

Working directory: `backend`

Expected: FAIL because `GoldMutationResult`, required idempotency, and `spendUserPoints` are not implemented.

- [x] **Step 6: Implement the canonical transaction behavior**

In `backend/src/services/gamification.ts`:

- Acquire one client with `await db.connect()` when the caller did not provide
  a client; otherwise use the caller's client.
- Use `BEGIN`, `SELECT ... FOR UPDATE`, `COMMIT`, and `ROLLBACK` on that same client.
- Query an existing ledger row by `(user_id, idempotency_key)` before mutation.
- On replay, return its signed `amount`, `balance_after`, and ledger ID with `applied: false`.
- On award, increment lifetime, spendable, monthly, and category totals, then insert a positive ledger row with `balance_after`.
- On spend, lock `user_points`, reject when balance is insufficient, decrement only `spendable_points`, then insert a negative ledger row with `balance_after`.
- Validate `amount` as a positive safe integer and normalize the idempotency key to 180 characters.
- Commit, roll back, and release only an internally acquired client in
  `finally`; never end a caller-owned transaction.

The ledger insert shape is:

```sql
INSERT INTO points_ledger (
  user_id, amount, category, source_type, source_id,
  idempotency_key, balance_after, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, amount, balance_after
```

- [x] **Step 7: Run focused and schema tests and verify GREEN**

Run: `npm test -- --run src/services/gamification.test.ts src/services/goldTransactions.test.ts src/db/migrate.test.ts`

Working directory: `backend`

Expected: PASS with zero failed tests.

- [x] **Step 8: Commit the Gold foundation**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.test.ts backend/src/services/gamification.ts backend/src/services/gamification.test.ts backend/src/services/goldTransactions.test.ts
git commit -m "feat(gold): add idempotent account ledger"
```

Do not stage `backend/package-lock.json`.

---

### Task 2: Complete Server-Side Account Lifecycle

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Create: `backend/src/routes/authLifecycle.test.ts`
- Modify: `mobile/src/context/AuthContext.tsx`
- Create: `mobile/__tests__/accountLifecycle.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/auth/logout` with `{refresh_token}`.
- Produces: `POST /api/v1/auth/logout-all` with bearer authentication.
- Produces: `DELETE /api/v1/auth/account` with `{confirmation: 'DELETE', password?: string}`.
- Produces mobile context methods `logout(): Promise<void>` and `deleteAccount(password?: string): Promise<void>`.

- [x] **Step 1: Write failing backend lifecycle tests**

Create `backend/src/routes/authLifecycle.test.ts` using the router/db mocking pattern from `authRegister.test.ts` and assert:

```ts
expect(mockRouteHandlers.post['/logout']).toBeTypeOf('function');
expect(mockRouteHandlers.post['/logout-all']).toBeTypeOf('function');
expect(mockRouteHandlers.delete['/account']).toBeTypeOf('function');
```

Add cases proving:

- `/logout` compares the supplied refresh token only against the authenticated token owner’s unexpired hashes and deletes at most the matched row.
- Repeating `/logout` returns success without leaking whether a token existed.
- `/logout-all` deletes all refresh rows for `req.user.id` only.
- `/account` rejects a missing `DELETE` confirmation.
- A registered account must pass password verification.
- Successful deletion removes refresh sessions and then the `users` row inside one transaction.
- Responses never include `password_hash`, `token_hash`, access tokens, or internal guest email.

- [x] **Step 2: Run backend lifecycle tests and verify RED**

Run: `npm test -- --run src/routes/authLifecycle.test.ts`

Working directory: `backend`

Expected: FAIL because the lifecycle routes do not exist.

- [x] **Step 3: Implement idempotent logout and deletion**

In `backend/src/routes/auth.ts`:

```ts
router.post('/logout', async (req, res) => {
  const refreshToken = String(req.body?.refresh_token ?? '');
  if (refreshToken) await revokeMatchingRefreshToken(refreshToken);
  return sendSuccess(res, {revoked: true}, 'Logged out');
});

router.post('/logout-all', authMiddleware, async (req: AuthRequest, res) => {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user!.id]);
  return sendSuccess(res, {revoked: true}, 'All sessions revoked');
});
```

Implement `DELETE /account` with a single checked-out database client:

1. Require bearer authentication and body confirmation exactly `DELETE`.
2. Lock and load `id`, `password_hash`, `is_guest` for `req.user.id`.
3. For registered users, compare the supplied password with `password_hash`.
4. Delete refresh tokens, then delete the user; rely only on reviewed ownership cascades.
5. Commit and return `{deleted: true}`.
6. Roll back and redact database details on error.

- [x] **Step 4: Write failing mobile lifecycle tests**

Create `mobile/__tests__/accountLifecycle.test.ts` and verify that:

```ts
expect(logoutRequest(refreshToken)).toEqual({
  method: 'POST', path: '/auth/logout', body: {refresh_token: refreshToken},
});
expect(deleteAccountRequest('secret')).toEqual({
  method: 'DELETE', path: '/auth/account',
  body: {confirmation: 'DELETE', password: 'secret'},
});
```

Also assert that local token removal runs in `finally` when logout returns a network error.

- [x] **Step 5: Run mobile lifecycle tests and verify RED**

Run: `npm test -- --runInBand __tests__/accountLifecycle.test.ts`

Working directory: `mobile`

Expected: FAIL because server-aware lifecycle helpers/context methods do not exist.

- [x] **Step 6: Implement the mobile account lifecycle**

In `AuthContext.tsx`:

- Read `refresh_token` before logout.
- Attempt `POST ${API_URL}/auth/logout` with the refresh token.
- Clear access/refresh tokens and the default authorization header in `finally`.
- Add `deleteAccount(password?)`, call `DELETE ${API_URL}/auth/account` with confirmation and password, then clear local state only after a successful deletion.
- Keep refresh-token values out of logs and thrown user messages.

- [x] **Step 7: Run focused Account tests and verify GREEN**

Run backend: `npm test -- --run src/routes/authRegister.test.ts src/routes/authLifecycle.test.ts`

Run mobile: `npm test -- --runInBand __tests__/accountLifecycle.test.ts`

Expected: both commands PASS.

- [x] **Step 8: Commit Account lifecycle changes**

```bash
git add backend/src/routes/auth.ts backend/src/routes/authLifecycle.test.ts mobile/src/context/AuthContext.tsx mobile/__tests__/accountLifecycle.test.ts
git commit -m "feat(account): complete session and deletion lifecycle"
```

---

### Task 3: Make Every Gold Award Idempotent

**Files:**
- Modify: `backend/src/routes/study.ts`
- Modify: `backend/src/routes/study.test.ts`
- Modify: `backend/src/routes/gamification.ts`
- Modify: `backend/src/routes/gamification.test.ts`

**Interfaces:**
- Consumes: `awardUserPoints` with required `idempotencyKey`.
- Produces stable keys for Study, QR, arcade, and listening awards.

- [x] **Step 1: Add failing Study finish replay tests**

In `backend/src/routes/study.test.ts`, assert two finishes of the same session produce one award call with:

```ts
expect(awardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
  sourceType: 'study_session',
  sourceId: 'session-1',
  idempotencyKey: 'study:finish:session-1',
}));
```

The replay response must return the original `awarded_points` and current `spendable_points` without a second mutation.

- [x] **Step 2: Add failing gamification award-key tests**

In `backend/src/routes/gamification.test.ts`, assert these exact key shapes:

```ts
'qr:' + rewardId + ':' + userId
'game:' + clientRoundId
'listening:' + sessionId + ':' + cumulativeAward
```

Use the existing validated mobile `client_round_id` for arcade score
submission. For listening, award only
`max(0, newCumulativeAward - storedPointsAwarded)` and key the mutation by the
new cumulative total.

- [x] **Step 3: Run route tests and verify RED**

Run: `npm test -- --run src/routes/study.test.ts src/routes/gamification.test.ts`

Working directory: `backend`

Expected: FAIL because award callers do not yet supply stable idempotency keys and listening currently does not award only the delta.

- [x] **Step 4: Implement stable award identities**

Update callers:

```ts
await awardUserPoints({
  userId: req.user!.id,
  amount: pointsToAward,
  category: 'social',
  sourceType,
  sourceId: session.id,
  idempotencyKey: `study:finish:${session.id}`,
  metadata: {location: session.location},
});
```

- QR key: `qr:${reward.id}:${req.user!.id}`.
- Arcade key: `game:${client_round_id}` after validating the existing submission identifier.
- Listening key: `listening:${session.id}:${newCumulativeAward}` and award only the delta from stored `points_awarded`.
- Ensure the route returns the authoritative `spendable_points` from the Gold mutation result.

- [x] **Step 5: Run focused backend route tests and verify GREEN**

Run: `npm test -- --run src/routes/study.test.ts src/routes/gamification.test.ts src/services/goldTransactions.test.ts`

Working directory: `backend`

Expected: PASS.

- [x] **Step 6: Commit award idempotency**

```bash
git add backend/src/routes/study.ts backend/src/routes/study.test.ts backend/src/routes/gamification.ts backend/src/routes/gamification.test.ts
git commit -m "fix(gold): make reward awards idempotent"
```

---

### Task 4: Make Market and Avatar Spending Atomic and Replay-Safe

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/migrate.test.ts`
- Modify: `backend/src/routes/gamification.ts`
- Modify: `backend/src/routes/gamification.test.ts`
- Modify: `backend/src/routes/study.ts`
- Modify: `backend/src/routes/study.test.ts`
- Modify: `mobile/src/services/gamificationService.ts`
- Modify: `mobile/src/screens/MarketScreen.tsx`
- Modify: `mobile/__tests__/gamificationService.test.ts`

**Interfaces:**
- Produces: `redeemMarketItem(itemId, idempotencyKey)`.
- Consumes: Study body `{itemId, idempotencyKey}`.
- Produces authoritative `{spendable_points, replayed, ...}` responses.

- [ ] **Step 1: Add failing schema assertions for market replay**

```ts
expect(schemaSql).toContain('ALTER TABLE market_redemptions ADD COLUMN IF NOT EXISTS idempotency_key');
expect(schemaSql).toContain('idx_market_redemptions_user_idempotency');
```

- [ ] **Step 2: Add the additive market idempotency schema**

```sql
ALTER TABLE market_redemptions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_redemptions_user_idempotency
ON market_redemptions(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

- [ ] **Step 3: Write failing route tests**

Add tests proving:

- Market requires a non-empty `idempotency_key`.
- Duplicate market requests return the original redemption without reducing stock or Gold again.
- Avatar purchase passes the existing `idempotencyKey` into `spendUserPoints`.
- An already-owned avatar returns success without a second spend.
- Insufficient Gold changes no inventory, redemption, stock, or ledger state.
- Two concurrent avatar purchases cannot reduce the balance below zero.

- [ ] **Step 4: Run spending route tests and verify RED**

Run: `npm test -- --run src/routes/gamification.test.ts src/routes/study.test.ts src/db/migrate.test.ts`

Working directory: `backend`

Expected: FAIL on missing market idempotency and canonical spend integration.

- [ ] **Step 5: Implement market and avatar transactions**

- Market: validate the key, look up replay first, lock catalog/stock and balance, call `spendUserPoints` on the same transaction client, insert redemption with the key, decrement stock, and return authoritative balance.
- Avatar: normalize `idempotencyKey`, lock item and inventory, return owned replay before spending, call `spendUserPoints`, insert inventory, and return authoritative balance plus owned item IDs.
- Use one checked-out client per logical operation. Do not call pool-level `BEGIN`/`COMMIT`.
- Record negative ledger metadata with item ID and server-owned price.

- [ ] **Step 6: Write failing mobile redemption tests**

In `mobile/__tests__/gamificationService.test.ts`:

```ts
await redeemMarketItem('reward-1', 'market-mobile-1');
expect(api.post).toHaveBeenCalledWith('/gamification/market/reward-1/redeem', {
  idempotency_key: 'market-mobile-1',
});
```

- [ ] **Step 7: Implement mobile idempotency payload**

Change the service signature:

```ts
export async function redeemMarketItem(itemId: string, idempotencyKey: string) {
  const response = await api.post(`/gamification/market/${itemId}/redeem`, {
    idempotency_key: idempotencyKey,
  });
  return unwrapData<{spendable_points: number; replayed?: boolean}>(response);
}
```

Generate one stable key when the user starts a redemption and reuse it for retries until the request succeeds or the user abandons it.

- [ ] **Step 8: Run backend and mobile spending tests and verify GREEN**

Run backend: `npm test -- --run src/routes/gamification.test.ts src/routes/study.test.ts src/services/goldTransactions.test.ts src/db/migrate.test.ts`

Run mobile: `npm test -- --runInBand __tests__/gamificationService.test.ts`

Expected: both commands PASS.

- [ ] **Step 9: Commit atomic spending**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.test.ts backend/src/routes/gamification.ts backend/src/routes/gamification.test.ts backend/src/routes/study.ts backend/src/routes/study.test.ts mobile/src/services/gamificationService.ts mobile/src/screens/MarketScreen.tsx mobile/__tests__/gamificationService.test.ts
git commit -m "feat(gold): make purchases atomic and replay-safe"
```

---

### Task 5: Finish Mobile Account Controls and Gold Product Copy

**Files:**
- Modify: `mobile/src/screens/ProfileScreen.tsx`
- Modify: `mobile/src/screens/HomeScreen.tsx`
- Modify: `mobile/src/screens/MarketScreen.tsx`
- Modify: `mobile/src/screens/EventsScreen.tsx`
- Modify: `mobile/src/screens/GamesScreen.tsx`
- Modify: `mobile/src/screens/LeaderboardScreen.tsx`
- Create: `mobile/__tests__/goldAccountContract.test.ts`

**Interfaces:**
- Consumes: `useAuth().deleteAccount(password?)`.
- Displays: `Gold` for all spendable/reward amounts while keeping ranking totals semantically historical.

- [ ] **Step 1: Write failing mobile contract tests**

Create `mobile/__tests__/goldAccountContract.test.ts` to assert source-level product contracts:

```ts
expect(marketSource).toContain('Gold balance');
expect(marketSource).not.toContain('Harcanabilir XP');
expect(eventsSource).toContain('Gold');
expect(profileSource).toContain('deleteAccount');
expect(profileSource).toContain("confirmation: 'DELETE'");
```

Also assert that the account deletion action requires a destructive confirmation and does not call ordinary `logout` as a substitute for server deletion.

- [ ] **Step 2: Run the mobile contract test and verify RED**

Run: `npm test -- --runInBand __tests__/goldAccountContract.test.ts`

Working directory: `mobile`

Expected: FAIL on old PTS/XP/puan copy and missing deletion flow.

- [ ] **Step 3: Implement deliberate account deletion UI**

In `ProfileScreen.tsx`:

- Keep the existing logout button.
- Add a separate destructive `Delete account` action.
- Show a confirmation explaining that Account-owned Gold, Study inventory, and personal profile data are deleted according to server policy.
- For registered users, collect the password in a secure text input before calling `deleteAccount(password)`.
- Disable the action while the request is pending.
- On failure, keep the user signed in and show the sanitized server error.

- [ ] **Step 4: Normalize product-facing Gold copy**

Use these concepts consistently:

- `Gold balance` for `spendable_points`.
- `Gold earned` for award notifications.
- `Lifetime Gold` for `lifetime_points` leaderboard/rank text.
- Item costs formatted as `${cost_points} Gold`.

Do not rename TypeScript fields or JSON keys.

- [ ] **Step 5: Run focused and neighboring mobile tests and verify GREEN**

Run: `npm test -- --runInBand __tests__/goldAccountContract.test.ts __tests__/gamificationService.test.ts __tests__/profileReadiness.test.ts __tests__/App.test.tsx`

Working directory: `mobile`

Expected: PASS.

- [ ] **Step 6: Commit mobile Account/Gold UX**

```bash
git add mobile/src/screens/ProfileScreen.tsx mobile/src/screens/HomeScreen.tsx mobile/src/screens/MarketScreen.tsx mobile/src/screens/EventsScreen.tsx mobile/src/screens/GamesScreen.tsx mobile/src/screens/LeaderboardScreen.tsx mobile/__tests__/goldAccountContract.test.ts
git commit -m "feat(mobile): expose account controls and Gold economy"
```

---

### Task 6: Bind Study to the Same Account-Owned Gold Balance

**Files:**
- Modify: `study-game/src/main.ts`
- Modify: `study-game/src/adapters/RadioTEDUStudyAdapter.ts`
- Modify: `study-game/tests/radiotedu-study-adapter.test.ts`
- Create: `study-game/tests/gold-account-contract.test.ts`

**Interfaces:**
- Consumes: `/study/summary` and avatar purchase responses containing `points.spendable_points`.
- Displays: `Gold` while keeping the bridge field `globalPoints` and backend field `spendable_points` backward compatible.

- [ ] **Step 1: Write failing Study Gold contract tests**

Create `study-game/tests/gold-account-contract.test.ts`:

```ts
expect(mainSource).toContain('aria-label="Gold balance"');
expect(mainSource).toContain('<span>Gold</span>');
expect(mainSource).not.toContain('<span>PTS</span>');
expect(adapterSource).toContain('profile.points?.spendable_points');
expect(adapterSource).toContain('data.points?.spendable_points');
```

Extend `radiotedu-study-adapter.test.ts` so a purchase response changing `spendable_points` from 100 to 65 changes `adapter.session().points.global` to 65.

- [ ] **Step 2: Run Study tests and verify RED**

Run: `npm test -- --run tests/gold-account-contract.test.ts tests/radiotedu-study-adapter.test.ts`

Working directory: `study-game`

Expected: FAIL because the UI says PTS and the mutation refresh contract is incomplete.

- [ ] **Step 3: Implement Study Gold labeling and authoritative refresh**

- Change only user-facing labels from PTS/points to Gold.
- Keep account identity from `RadioTEDUStudyBridge.account`.
- Keep the backend balance mapping from `spendable_points`.
- After session finish or avatar purchase, replace local presentation with the authoritative returned/refetched balance.
- Never award, spend, or persist production Gold in `LocalStudyAdapter` or browser storage.

- [ ] **Step 4: Run the complete Study unit suite and build**

Run: `npm test`

Run: `npm run build`

Working directory: `study-game`

Expected: both commands PASS; production files are generated in `study-game/dist`.

- [ ] **Step 5: Commit Study Gold integration**

```bash
git add study-game/src/main.ts study-game/src/adapters/RadioTEDUStudyAdapter.ts study-game/tests/radiotedu-study-adapter.test.ts study-game/tests/gold-account-contract.test.ts
git commit -m "feat(study): use the account Gold balance"
```

---

### Task 7: Replace the Web-Server Prompt with the Detailed Checkbox Contract

**Files:**
- Modify: `docs/study-game/WEB_SERVER_CODEX_PROMPT.md`
- Create: `docs/study-game/verify-web-server-prompt.mjs`
- Reference: `docs/superpowers/specs/2026-07-15-web-server-mobile-contract-design.md`

**Interfaces:**
- Produces: a copy/paste prompt for Codex running on the production web server.
- Consumes: branch `codex/study-game-oss`; the server resolves and records the exact fetched commit instead of relying on a self-referential SHA placeholder.

- [ ] **Step 1: Write the failing prompt verifier**

Create `docs/study-game/verify-web-server-prompt.mjs` that reads the Markdown and exits non-zero unless it finds:

```js
const required = [
  '- [ ]',
  'Juke-local / Jukebox project',
  'Voting project',
  'Study project',
  'Account platform',
  'Gold economy',
  'https://radiotedu.com/juke-local/controller/',
  '/jukebox/api/v1/next-song-voting/rounds/active',
  '/jukebox/socket.io',
  'https://radiotedu.com/study/',
  '/jukebox/api/v1/study',
  'spendable_points',
  'lifetime_points',
  'points_ledger',
  'idempotency',
  'account deletion',
  'rollback',
  'Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.',
];

for (const text of required) {
  if (!prompt.includes(text)) throw new Error(`Missing prompt contract: ${text}`);
}
if (/<STUDY_COMMIT_SHA>|\bTBD\b|\bTODO\b/.test(prompt)) {
  throw new Error('Prompt contains an unresolved placeholder');
}
```

- [ ] **Step 2: Run the verifier and verify RED**

Run: `node docs/study-game/verify-web-server-prompt.mjs`

Working directory: repository root.

Expected: FAIL because the current 114-line prompt lacks the full three-project, Account, and Gold checklist and still has a SHA placeholder.

- [ ] **Step 3: Rewrite the prompt as ordered checkboxes**

The prompt must contain these top-level sections, with every executable action written as `- [ ]`:

1. Authority, secrets, no-assumption rule, and stop conditions.
2. Resolve `origin/codex/study-game-oss`, record the exact commit, and use an isolated release directory.
3. Discover and back up live reverse-proxy, process-manager, environment, database, static-root, and service ownership.
4. Record the three independent projects and forbid cross-project rewrites/restarts.
5. Juke-local baseline and preservation checks only.
6. Voting mobile REST/socket checks, the verbatim Music PC freeze rule, and mobile-adapter-only corrections.
7. Account migration, registration/login/guest/refresh/me/logout/delete checks.
8. Gold migration, positive/negative ledger, idempotency, concurrency, and reconciliation checks.
9. Study tests/build, backend tests/build, database backup/migration, backend release, and atomic `/study/` static release.
10. Authenticated app-only Study bridge checks with no token logging.
11. One disposable registered-account flow covering login, Gold award, avatar purchase, cross-surface balance, logout revocation, and deletion cleanup.
12. Independent smoke checks and independent rollback decisions for Juke-local, Voting, Account/Gold, and Study.
13. Final report with exact deployed commit, status codes, service names, config paths, backup paths, rollback paths, and redacted errors.

The prompt must tell the server Codex to adapt server routes to the existing mobile contract and never modify mobile code on the server.

- [ ] **Step 4: Run prompt verification and inspect the contract**

Run: `node docs/study-game/verify-web-server-prompt.mjs`

Run: `git diff --check -- docs/study-game/WEB_SERVER_CODEX_PROMPT.md docs/study-game/verify-web-server-prompt.mjs`

Expected: both commands exit 0.

- [ ] **Step 5: Commit the deployment prompt**

```bash
git add docs/study-game/WEB_SERVER_CODEX_PROMPT.md docs/study-game/verify-web-server-prompt.mjs
git commit -m "docs: add production server adaptation checklist"
```

---

### Task 8: Run Full Verification, Fix Failures, and Push the Handoff

**Files:**
- Modify only if verification identifies a scoped defect in the files above.
- Do not stage unrelated dirty artifacts or `backend/package-lock.json`.

**Interfaces:**
- Produces: a verified and pushed `codex/study-game-oss` commit deployable by the server prompt.

- [ ] **Step 1: Verify the working tree scope before tests**

Run a filtered status report and confirm only planned source/docs changes are staged or committed. Preserve all pre-existing generated QA files and lockfile changes.

- [ ] **Step 2: Run complete backend verification**

Working directory: `backend`

Run: `npm test`

Run: `npm run build`

Expected: both commands exit 0 with zero failed tests and zero TypeScript errors.

- [ ] **Step 3: Run complete Study verification**

Working directory: `study-game`

Run: `npm test`

Run: `npm run build`

Expected: both commands exit 0 and `dist/index.html` plus hashed assets exist.

- [ ] **Step 4: Run complete mobile verification**

Working directory: `mobile`

Run: `npm test -- --runInBand`

Run: `npm run lint`

Run: `npm run package:study`

Expected: tests and packaging exit 0; lint has no errors. Existing warning-only inline-style debt may be reported but must not be called an error-free lint if warnings remain.

- [ ] **Step 5: Run prompt and whitespace verification**

Working directory: repository root.

Run: `node docs/study-game/verify-web-server-prompt.mjs`

Run: `git diff --check origin/codex/study-game-oss...HEAD`

Expected: both commands exit 0.

- [ ] **Step 6: Run database-backed Account/Gold/Study smoke tests**

Use the repository’s existing disposable Docker PostgreSQL/Redis procedure from `docs/verification-2026-06-24.md`.

Verify with a disposable registered account:

- register → `/auth/me` → refresh rotation;
- Study session start/heartbeat/finish → one Gold award;
- identical finish retry → no second award;
- avatar purchase → one negative ledger entry and authoritative remaining Gold;
- identical purchase retry → no second spend;
- mobile/Study balance equality;
- logout token revocation;
- confirmed account deletion and dependent-data cleanup.

Redact passwords, bearer tokens, refresh tokens, database URLs, and token hashes from captured output.

- [ ] **Step 7: Fix only observed scoped failures and rerun the proving command**

For each failure, add or correct the focused regression test, implement the minimal fix, rerun the focused test, then rerun the full package command affected by the fix.

- [ ] **Step 8: Confirm commit contents and branch history**

Verify no generated artifacts, videos, screenshots, random-walk output, secrets, `.env` files, or the pre-existing `backend/package-lock.json` change are included in planned commits.

- [ ] **Step 9: Push the branch**

```bash
git push origin codex/study-game-oss
```

- [ ] **Step 10: Verify the remote commit**

Fetch the remote and confirm `origin/codex/study-game-oss` equals local `HEAD`. Record the exact SHA for the user and for the server operator’s deployment report.

- [ ] **Step 11: Deliver the final handoff**

Provide:

- exact pushed commit SHA;
- clickable path to `docs/study-game/WEB_SERVER_CODEX_PROMPT.md`;
- backend, Study, mobile, prompt, and database-smoke command results;
- any warning-only debt;
- explicit statement that Juke-local, Voting, and Study remain separate;
- explicit statement that the Music PC integration was not changed;
- the server Codex prompt ready to copy from the committed file.
