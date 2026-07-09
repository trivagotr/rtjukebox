# Çim Alan Study Global Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Çim Alan as an app-only Study location with amphitheatre perspective, blockers, A* walking, points, clothes, Spark, Rock, and Android Auto-safe integration while leaving the existing ready Library untouched.

**Architecture:** Keep the existing ready Library implementation as-is, then add Çim Alan as a separate Study location. Rendering and visual interpolation stay local for responsiveness; logical position, room presence, seat ownership, rewards, wardrobe ownership, and spendable points reconcile with server-authoritative state. Both agents use the canonical `/api/v1/study` contract documented in the server and mobile Codex prompts.

**Tech Stack:** React Native mobile app, existing backend Express/TypeScript gamification routes, existing ready Library implementation, existing Android Auto media service.

## Global Constraints

- Treat Çim Alan as a second selectable Study location beside the existing ready Library.
- Do not rebuild, replace, delete, restyle, or “fix” the existing Library implementation as part of this phase.
- Use `prototypes/library-study/assets/chim-amfi-habbo.png` as the visual source of truth for Çim Alan.
- Do not modify `prototypes/library-study/`; it remains reference-only.
- Keep `prototypes/library-iso/` deleted and do not create a duplicate mobile app or Study prototype.
- Use the canonical location ID `chim-alan`; reject `cim-alan` and localized IDs in payloads.
- Keep Study access behind the existing mobile app login; no standalone public web access.
- Do not trust client-reported points, clothing ownership, elapsed time, path length, or seating state.
- Do not treat source-string assertions as proof of touch, movement, seating, animation, authentication, or visual behavior.
- Preserve Android Auto media behavior; do not expose interactive Study/game UI in car surfaces.
- Do not claim verification passes unless the command was run in the current session and the exit code was inspected.

---

## File Structure

- Modify `mobile/src/screens/study/studyMap.ts`: keep Çim Alan-specific map/model files for amphitheatre blockers, walkable rows, seats, stairs, lawns, benches, trees, buildings, pergola, Spark, and Rock anchors.
- Keep A* route generation in `mobile/src/screens/study/studyMap.ts`; add regression tests for stairs, terraces, blocked benches/buildings/trees, and seat approach tiles.
- Do not modify the ready Library scene for this phase unless the user explicitly asks later. Çim Alan should get its own scene/screen/module or be mounted through the app Study flow without changing Library behavior.
- Add Çim Alan verification in mobile Study tests without changing existing Library verification.
- Modify `mobile/src/navigation/RootNavigator.tsx`: keep Study stack under authenticated app navigation and route to Study home, location room, and closet.
- Modify `mobile/src/screens/study/StudyHomeScreen.tsx`: add Library/Çim Alan location picker and points/wardrobe entry points.
- Modify `mobile/src/screens/study/StudyRoomScreen.tsx`: pass authenticated app token/session into Study room; no second login.
- Modify `mobile/src/screens/study/AvatarClosetScreen.tsx`: connect clothing inventory/equip flow to backend-owned points and wardrobe items.
- Modify `mobile/src/services/gamificationService.ts`: add typed APIs for study state, session start/heartbeat/complete, wardrobe catalog, item purchase, and equip.
- Modify `backend/src/routes/gamification.ts`: add or harden study and wardrobe endpoints under existing auth middleware.
- Modify `backend/src/services/gamification.ts`: add point ledger helpers for study awards and wardrobe spends.
- Modify `backend/src/db/schema.sql`: add server-side tables or migrations for study sessions, study events, wardrobe items, wardrobe ownership, equipped outfit, and idempotency keys.
- Modify `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/app/src/main/java/com/radiotedumobile/car/RadioTeduCarService.kt`, `mobile/src/services/carBridge.ts`, and `mobile/src/services/androidReadinessService.ts` only if Study changes affect Android Auto metadata or app manifest requirements.
- Create `backend/CODEX_STUDY_GLOBAL_POINTS_PROMPT.md`: backend-server handoff prompt for radiotedu.com integration.

## Task 1: Çim Alan Block Map And A* Invariants

**Files:**
- Modify: `mobile/src/screens/study/studyMap.ts`
- Test: `mobile/__tests__/studyMap.test.ts`

**Interfaces:**
- Produces: `CHIM_ALAN_STUDY_MAP`, `findStudyPath(map, from, to)`, `getStudyTileKind(map, point)`, and `studyTileKey(point)`.

- [ ] Write tests that Çim Alan has blocked tiles for buildings, pergola posts, benches, trees, planters, walls, bollards, and amphitheatre seating blocks.
- [ ] Write tests that stair lanes and main paths are walkable.
- [ ] Write tests that A* routes around terrace blocks instead of crossing benches or walls.
- [ ] Write tests that each amphitheatre seat has a walkable approach tile on the correct row or stair landing.
- [ ] Implement the Çim Alan map as rows/terraces with explicit elevation/depth metadata so drawing order can represent amphitheatre stairs.
- [ ] Keep existing Library implementation untouched.

## Task 2: Çim Alan Perspective, Real Animation, Chair Sitting, Spark, And Rock

**Files:**
- Modify: `mobile/src/screens/study/StudyRoomScreen.tsx`
- Create or modify: the focused avatar renderer/animation module selected from the existing mobile architecture
- Modify: `mobile/src/screens/study/SparkAiLogo.tsx`
- Test: rendered Study interaction tests under `mobile/__tests__`

**Interfaces:**
- Consumes: `CHIM_ALAN_STUDY_MAP` and projection/path helpers from Task 1.
- Produces: rendered Çim Alan scene with deterministic depth, real avatar animation, visible-chair interaction, Spark, and Rock.

- [ ] Render Çim Alan with the `chim-amfi-habbo.png` composition: lower lawn/path foreground, central amphitheatre rows, side stairs, upper campus buildings, pergola seating, trees, benches, bollards, and planters.
- [ ] Use tile/elevation depth ordering so avatars appear in front of lower terrace edges and behind upper walls/benches when appropriate.
- [ ] Make bench blocks and stair lanes visually obvious; a user should understand why some tiles cannot be crossed.
- [ ] Replace the final `Y` marker with an approved avatar renderer that visibly animates directional walk, turn, sit, seated idle, and stand states.
- [ ] Make the projected geometry of every visible chair its touch target; remove detached seat dots, every-other-seat filtering, and arbitrary first-30 interaction limits.
- [ ] Implement the complete chair flow: tap visible chair, A* to entry tile, reserve server seat, turn, animate sit, align offset/depth, publish presence, and release on stand/leave/expiry.
- [ ] Add rendered behavior tests that tap a chair and observe movement/animation/reservation states over time; source-text checks are not sufficient.
- [ ] Add Spark near a host anchor with an AI-style logo mark and two-line label: `Spark` and small `rtAI - AI Host`.
- [ ] Add Rock as a second character/entity with a stable anchor and collision/standing footprint.
- [ ] Add verifier screenshots for `chim-alan-initial`, `chim-alan-walking`, `chim-alan-seated`, and `chim-alan-occupied-seat`.

## Task 3: Points, Clothes, And Menu UX

**Files:**
- Modify: `mobile/src/screens/study/StudyHomeScreen.tsx`
- Modify: `mobile/src/screens/study/StudyRoomScreen.tsx`
- Modify: `mobile/src/screens/study/AvatarClosetScreen.tsx`
- Modify: `mobile/src/services/studyService.ts`
- Test: related mobile Jest tests under `mobile/__tests__` or `mobile/src/**/__tests__`

**Interfaces:**
- Produces: canonical profile/session/room/presence/seat/avatar client functions under `/api/v1/study`.

- [ ] Add Study home cards for Library and Çim Alan; both use the existing logged-in app session.
- [ ] Add a points panel showing spendable points and study streak/status returned by the backend.
- [ ] Add a wardrobe menu for clothes with locked, owned, equipped, affordable, and unaffordable states.
- [ ] Render actual item and layered avatar previews; status icons alone do not count as clothes.
- [ ] Apply the equipped outfit to local and remote Study avatars.
- [ ] Seed a small clothing catalog: hoodie, jacket, campus tee, cap, glasses, and shoes, each with `cost_points`, `rarity`, and preview metadata.
- [ ] Make equip local UI optimistic only after backend success; failed purchases/equips must roll back visually.
- [ ] Add tests for authenticated API calls, insufficient points, owned item equip, and no second login prompt.

## Task 4: Backend Wire And Anti-Cheat

**Files:**
- Modify: `backend/src/routes/study.ts`
- Modify: `backend/src/services/gamification.ts`
- Modify: `backend/src/db/schema.sql`
- Test: `backend/src/routes/study.test.ts` plus real database integration tests
- Prompt: `backend/CODEX_STUDY_GLOBAL_POINTS_PROMPT.md`
- Mobile prompt: `mobile/CODEX_STUDY_APP_IMPLEMENTATION_PROMPT.md`

**Interfaces:**
- Produces canonical authenticated endpoints:
  - `GET /api/v1/study/profile`
  - `POST /api/v1/study/sessions/start`
  - `POST /api/v1/study/sessions/:id/heartbeat`
  - `POST /api/v1/study/sessions/:id/finish`
  - `GET /api/v1/study/rooms/:roomId`
  - `POST /api/v1/study/rooms/:roomId/presence/heartbeat`
  - `POST /api/v1/study/rooms/:roomId/seats/:seatId/reserve`
  - `DELETE /api/v1/study/rooms/:roomId/seats/:seatId/reservation`
  - avatar catalog/profile/purchase/equip under `/api/v1/study/avatar`

- [ ] Require existing app auth middleware for every endpoint; reject guests if wardrobe spending or global point awards require registered accounts.
- [ ] Store study sessions server-side with start time, last heartbeat, location id, nonce/idempotency key, app version, and authenticated user id.
- [ ] Store room presence and atomic expiring seat reservations server-side; two users must never reserve one seat.
- [ ] Award points server-side from elapsed validated time, capped per session and per Istanbul day.
- [ ] Ignore client-sent point totals, clothing ownership, and claimed final rewards.
- [ ] Reject impossible heartbeats: too frequent, stale, wrong session owner, invalid location, invalid seat id, impossible movement jump, duplicate idempotency key, or excessive daily earnings.
- [ ] Use a ledger row for each award/spend with reason, source, session id, idempotency key, and before/after balances.
- [ ] Add tests for replay, duplicate/concurrent completion, guest rejection, cross-user access, teleport/elevation abuse, daily cap, insufficient balance, purchase/equip races, and two-user seat reservation races.

## Task 5: App-Only Study Integration

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Modify: `mobile/src/screens/study/StudyHomeScreen.tsx`
- Modify: `mobile/src/screens/study/StudyRoomScreen.tsx`
- Modify: `mobile/src/services/api.ts` only if token propagation is missing

**Interfaces:**
- Consumes: existing `AuthContext` and API client auth token.
- Produces: Study menu entry inside the logged-in app; no public route.

- [ ] Ensure Study routes live under the authenticated stack guarded by `AuthGuard`.
- [ ] Ensure Study room loads profile/session data using existing API auth headers.
- [ ] Ensure movement heartbeats publish the actual current logical tile/elevation rather than always spawn or only the seated tile.
- [ ] Remove or disable any standalone Study web entry point for production app access unless it is development-only.
- [ ] Add tests that unauthenticated users are redirected to login and authenticated users enter Study without a second login.

## Task 6: Android Auto Readiness

**Files:**
- Inspect: `mobile/android/app/src/main/AndroidManifest.xml`
- Inspect: `mobile/android/app/src/main/java/com/radiotedumobile/car/RadioTeduCarService.kt`
- Inspect: `mobile/src/services/carBridge.ts`
- Inspect: `mobile/src/services/androidReadinessService.ts`
- Modify only if verification proves Study changed car-facing behavior.

**Interfaces:**
- Produces: app remains Android Auto media-ready; Study is not exposed as interactive car UI.

- [ ] Verify manifest still declares automotive support and media services correctly.
- [ ] Verify `RadioTeduCarService` exposes radio/media browse controls only, not Study gameplay or wardrobe UI.
- [ ] Ensure Study routes do not trigger car UI navigation, unsafe notifications, or foreground service changes.
- [ ] Add release checklist item: Study is phone-only; Android Auto remains media-only.

## Task 7: Final Verification

**Files:**
- Modify: `docs/verification-2026-06-24.md` or create a new dated verification report if this milestone is implemented.

**Commands:**
- `cd mobile && npm test -- --runTestsByPath __tests__/studyMap.test.ts __tests__/studyNavigation.test.ts __tests__/studyService.test.ts __tests__/avatarCloset.test.ts --runInBand`
- `cd backend && npm test`
- `cd mobile && npm test`
- Android build/readiness command documented in `docs/verification-2026-06-24.md` or `mobile/docs/RELEASE_CHECKLIST.md`

- [ ] Verify Çim Alan screenshot visually matches the amphitheatre reference.
- [ ] Verify Çim Alan A* routes use stairs/walkways and avoid blocked objects.
- [ ] Verify tapping each visible available chair completes walk/reserve/sit and occupied chairs produce a clear disabled/rejected state.
- [ ] Verify walk, turn, sit, seated idle, and stand visibly animate in rendered tests and inspected emulator screenshots.
- [ ] Verify points/wardrobe cannot be forged by client payloads.
- [ ] Verify equipped clothing visibly renders on local and remote avatars.
- [ ] Verify Study is accessible only through logged-in app navigation.
- [ ] Verify Spark label reads `rtAI - AI Host` and Rock appears.
- [ ] Verify Android Auto media behavior is unchanged.
