# Ranking And Guest Limits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Jukebox puanlama modelini iki eksene ayırmak, guest günlük şarkı limitini server-side uygulamak ve web/mobile yüzeylerini yeni puan sözleşmesine geçirmek.

**Architecture:** Backend vote ve queue akışındaki eski puan kuralları kaldırılacak; queue item song score ile user rank score helper tabanlı tek bir kural setine indirilecek. Guest limiti ve aylık leaderboard için iki küçük tablo eklenecek. Web ve mobile istemciler `song_score`, `monthly leaderboard` ve `guest fingerprint` sözleşmesine geçirilecek.

**Tech Stack:** Express, PostgreSQL, Vitest, React/Vite, React Native, AsyncStorage/localStorage

---

### Task 1: Schema For Monthly Rank And Guest Limits

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/migrate.js`
- Test: `backend/src/db/migrate.test.ts`

**Step 1: Write the failing migration tests**

Add assertions in `backend/src/db/migrate.test.ts` for:
- `user_monthly_rank_scores` table creation
- `guest_daily_song_limits` table creation
- any required index/unique constraints

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/migrate.test.ts`

Expected: FAIL because new tables/constraints are not in schema.

**Step 3: Update schema**

In `backend/src/db/schema.sql`:
- create `user_monthly_rank_scores`
- create `guest_daily_song_limits`
- keep `users.rank_score` as total score
- add any missing index or unique constraint comments clearly

**Step 4: Update migration flow**

In `backend/src/db/migrate.js`:
- ensure new tables are created in existing migration bootstrap path
- keep migration idempotent

**Step 5: Run targeted migration test**

Run: `npx vitest run src/db/migrate.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.js backend/src/db/migrate.test.ts
git commit -m "feat: add monthly rank and guest limit schema"
```

### Task 2: Scoring Helpers And Istanbul Day Keys

**Files:**
- Create: `backend/src/services/jukeboxScoring.ts`
- Test: `backend/src/services/jukeboxScoring.test.ts`

**Step 1: Write the failing tests**

Cover:
- `queue item starts at 0`
- `song delta`: up `+1`, down `-1`, super `+3`
- `requester rank delta`: up `+1`, down `-1`, super `+2`
- transitions: `up -> down`, `down -> super`, `super -> none`
- Istanbul `day_key` and `year_month` generation

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/jukeboxScoring.test.ts`

Expected: FAIL because helper file does not exist.

**Step 3: Implement minimal helpers**

Add pure helpers for:
- vote kind normalization
- score delta calculation
- rank delta calculation
- Istanbul day/month key derivation

**Step 4: Run targeted test**

Run: `npx vitest run src/services/jukeboxScoring.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/jukeboxScoring.ts backend/src/services/jukeboxScoring.test.ts
git commit -m "feat: add jukebox scoring helpers"
```

### Task 3: Guest Fingerprint And Daily Add Limit

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Test: `backend/src/routes/jukeboxQueueContract.test.ts`
- Test: `backend/src/routes/jukeboxGuestLimit.test.ts`

**Step 1: Write failing tests**

Add/extend tests for:
- guest can add first song of the Istanbul day
- same fingerprint cannot add second song that day, even on another device
- logged-in non-guest user is not blocked by guest limit
- queue insert still starts with `song_score = 0`
- requester gets `+2 total rank` and `+2 monthly rank` on successful add

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/jukeboxQueueContract.test.ts src/routes/jukeboxGuestLimit.test.ts`

Expected: FAIL because guest limit and rank add behavior are not implemented.

**Step 3: Implement backend limit**

In `backend/src/routes/jukebox.ts`:
- read guest fingerprint from request header
- enforce daily limit using `guest_daily_song_limits`
- remove old `rank_score +5` add rule
- apply new requester add rule: `+2 total`, `+2 monthly`
- ensure queue item score remains `0`

**Step 4: Run targeted tests**

Run: `npx vitest run src/routes/jukeboxQueueContract.test.ts src/routes/jukeboxGuestLimit.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/routes/jukeboxQueueContract.test.ts backend/src/routes/jukeboxGuestLimit.test.ts
git commit -m "feat: enforce guest daily song limit and add rank reward"
```

### Task 4: Rewrite Vote And Supervote Rules

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Possibly modify: `backend/src/db/schema.sql` comment around `votes`
- Test: `backend/src/routes/jukeboxVoteScoring.test.ts`

**Step 1: Write failing vote regression tests**

Cover:
- `none -> upvote`
- `upvote -> downvote`
- `downvote -> supervote`
- `supervote -> none`
- supervote blocked for guests
- supervote blocked after one Istanbul-day use
- queue item `song_score` changes by `+1/-1/+3`
- requester rank changes by `+1/-1/+2`
- no extra voter bonus
- no play/skip hidden bonus remains in vote path

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/jukeboxVoteScoring.test.ts`

Expected: FAIL against existing `+4/+10/-10` logic.

**Step 3: Implement minimal vote rewrite**

In `backend/src/routes/jukebox.ts`:
- replace current supervote value model
- derive song delta and requester rank delta via helper
- store a consistent semantic vote state
- update queue item score field
- keep queue broadcast behavior intact
- change daily supervote check from “once per UTC day” to Istanbul day

**Step 4: Remove obsolete hidden score rules**

Delete or neutralize:
- requester `+10` on playback start/finish
- voter `+10` for supervote use
- requester `-10` skip penalty
- time/rank-based `calculatePriorityScore` use in jukebox vote path

**Step 5: Run targeted tests**

Run: `npx vitest run src/routes/jukeboxVoteScoring.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/routes/jukeboxVoteScoring.test.ts
git commit -m "feat: simplify jukebox vote scoring rules"
```

### Task 5: Leaderboard Total And Monthly

**Files:**
- Modify: `backend/src/routes/users.ts`
- Modify: `backend/src/routes/auth.ts`
- Test: `backend/src/routes/usersLeaderboard.test.ts`

**Step 1: Write failing tests**

Cover:
- `/users/leaderboard?period=total`
- `/users/leaderboard?period=monthly`
- guests and admins excluded
- `/auth/me` returns current `monthly_rank_score`

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/usersLeaderboard.test.ts`

Expected: FAIL because only total leaderboard exists.

**Step 3: Implement leaderboard query changes**

In `backend/src/routes/users.ts`:
- add `period` query parsing
- join monthly table when `period=monthly`
- return consistent payload shape for both views

In `backend/src/routes/auth.ts`:
- return `monthly_rank_score`
- return supervote availability metadata if useful to clients

**Step 4: Run targeted tests**

Run: `npx vitest run src/routes/usersLeaderboard.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/users.ts backend/src/routes/auth.ts backend/src/routes/usersLeaderboard.test.ts
git commit -m "feat: add monthly and total leaderboard views"
```

### Task 6: Web Client Scoring Contract

**Files:**
- Modify: `jukebox-web-controller/src/App.tsx`
- Create: `jukebox-web-controller/src/guestFingerprint.ts`
- Test: `jukebox-web-controller/src/guestFingerprint.test.ts`

**Step 1: Write failing helper tests**

Cover:
- persistent web fingerprint generation
- same browser gets same value

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/guestFingerprint.test.ts`

Expected: FAIL because helper does not exist.

**Step 3: Implement minimal web helper**

Create `guestFingerprint.ts`:
- read/write persistent fingerprint in `localStorage`
- provide request helper for guest queue actions

**Step 4: Update App UI**

In `App.tsx`:
- send guest fingerprint on queue add
- show `song_score` instead of derived vote count
- supervote button text and tooltip reflect new rule
- leaderboard modal gains `Total / Aylik` toggle and fetch mode
- guest limit error message nudges signup/login

**Step 5: Run tests and build**

Run:
- `npx vitest run src/guestFingerprint.test.ts`
- `npm run build`

Expected: PASS

**Step 6: Commit**

```bash
git add jukebox-web-controller/src/App.tsx jukebox-web-controller/src/guestFingerprint.ts jukebox-web-controller/src/guestFingerprint.test.ts
git commit -m "feat: update web scoring and guest limit UX"
```

### Task 7: Mobile Client Scoring Contract

**Files:**
- Modify: `mobile/src/screens/jukebox/JukeboxScreen.tsx`
- Modify: `mobile/src/screens/LeaderboardScreen.tsx`
- Modify: `mobile/src/context/AuthContext.tsx`
- Create: `mobile/src/services/guestFingerprint.ts`
- Possibly modify: `mobile/src/services/api.ts`

**Step 1: Write minimal helper tests if mobile test harness exists**

If there is no mobile test harness, skip new automated tests and rely on focused manual verification. Do not invent a new framework here.

**Step 2: Implement persistent mobile fingerprint**

Create `mobile/src/services/guestFingerprint.ts`:
- use `AsyncStorage`
- generate once and reuse

**Step 3: Update mobile jukebox flow**

In `JukeboxScreen.tsx`:
- remove old `guest_request_used` client-only lock
- send guest fingerprint with queue add request
- show server-driven guest limit message
- hide or disable supervote for guests
- show `song_score` rather than `(upvotes - downvotes)` where applicable

**Step 4: Update mobile leaderboard**

In `LeaderboardScreen.tsx`:
- add total/monthly toggle
- fetch with `period` query
- label score clearly

**Step 5: Run manual verification**

Verify on device/emulator:
- guest first add works
- second same-day add fails across kiosks
- member add still works
- total/monthly leaderboard switches correctly

**Step 6: Commit**

```bash
git add mobile/src/screens/jukebox/JukeboxScreen.tsx mobile/src/screens/LeaderboardScreen.tsx mobile/src/context/AuthContext.tsx mobile/src/services/guestFingerprint.ts mobile/src/services/api.ts
git commit -m "feat: update mobile scoring and leaderboard flows"
```

### Task 8: Full Verification

**Files:**
- Verify touched backend, web, and mobile files

**Step 1: Run backend tests**

Run: `npx vitest run`

Expected: PASS

**Step 2: Run backend build**

Run: `npm run build`

Expected: PASS

**Step 3: Run web build**

Run: `npm run build`

Workdir: `E:\\rtmusicbox\\jukebox-web-controller`

Expected: PASS

**Step 4: Run kiosk/web smoke**

Verify:
- guest add first song succeeds
- second same-day guest add fails
- member supervote works once, second time fails same Istanbul day
- queue `song_score` updates correctly
- total/monthly leaderboard both render

**Step 5: Commit verification-only follow-up if needed**

```bash
git add <any final touched files>
git commit -m "test: finalize ranking and guest limit verification"
```
