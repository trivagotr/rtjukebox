# Study Game Mobile Gameplay Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Study Habbo game feel like a polished touch-first mobile social room: reliable tap-to-move and tap-to-sit, collision-safe A* motion, natural eight-direction animation, compact HUD sheets, and coherent front/back/diagonal avatar clothing.

**Architecture:** Keep the existing Phaser scene, elevated-grid A*, adapter, Gold/account, and room data. Extract deterministic gameplay decisions into small pure TypeScript modules, cover them with Vitest before scene integration, then let `ImageRoomScene` translate those decisions into Phaser tweens and layered sprites. Keep all Study changes inside `study-game/` plus its Android mirror; do not alter Jukebox or Voting behavior.

**Tech Stack:** TypeScript, Phaser 3, Vite, Vitest, Node's test runner, Playwright mobile emulation, SVG/PNG asset generation, ImageGen canonical reference art.

## Global Constraints

- Study, Jukebox (`/juke-local`), and Voting remain separate products and data flows.
- Touch is the only gameplay input. Do not add keyboard movement, a virtual joystick, or desktop-only controls.
- Preserve the existing Study account, Gold, adapter, presence, chat, and room contracts unless a test proves a compatibility change is required.
- A new tap supersedes the previous movement intent. Old tween callbacks must not mutate the new intent.
- Path smoothing may remove redundant waypoints only when the full segment is walkable, remains on one elevation, does not cut a blocked corner, and does not skip a stair/portal boundary.
- A seat interaction is transactional: reserve, approach, align, sit, remain seated, stand, return to approach, release.
- Generated assets must have true front, rear, side, and diagonal silhouettes and share one canonical 64×96 registration system across body and wearables.
- Never stage or commit unrelated dirty QA artifacts, server-prompt edits, package locks outside Study, Jukebox files, or Voting files.
- Before every success claim, run the verification command in the current session and inspect the exit code.

---

## Task 1: Add a single cancellable avatar activity state machine

**Files:**

- Create: `study-game/src/game/AvatarActivityMachine.ts`
- Create: `study-game/tests/avatar-activity-machine.test.ts`
- Modify: `study-game/src/game/ImageRoomScene.ts`

- [ ] Write failing tests for the legal states `idle`, `walking`, `approaching-seat`, `aligning-seat`, `seated`, and `standing`.

- [ ] Test that every accepted touch intent receives a monotonically increasing token and makes all earlier tokens stale.

- [ ] Test legal transitions, including walking-to-walking retargeting, walking-to-seat approach, seated-to-standing, and standing-to-new-walk.

- [ ] Test that stale `arrive`, `sit`, and `stand` callbacks are ignored instead of changing state.

- [ ] Run `npm run test:unit -- avatar-activity-machine.test.ts` from `study-game/` and confirm the expected module-not-found failure.

- [ ] Implement `AvatarActivityMachine` as a Phaser-independent class with:

  - `beginWalk(): ActivityToken`
  - `beginSeatApproach(seatId: string): ActivityToken`
  - `beginStand(): ActivityToken`
  - `transition(token, nextState): boolean`
  - `isCurrent(token): boolean`
  - immutable `snapshot()` containing state, token, and active seat id

- [ ] Replace scene-local navigation request bookkeeping with the activity token. Stop current tweens before starting the next intent and gate all completion callbacks through `isCurrent`.

- [ ] Keep current external scene status events working by mapping the activity snapshot back to the existing status strings.

- [ ] Re-run the focused test and then `npm run test:unit -- avatar-controller.test.ts interaction-controller.test.ts`.

- [ ] Commit only these files with `feat(study): make avatar activity cancellable`.

---

## Task 2: Add collision-safe A* route simplification

**Files:**

- Create: `study-game/src/pathfinding/RouteSmoother.ts`
- Create: `study-game/tests/route-smoother.test.ts`
- Modify: `study-game/src/pathfinding/ElevatedAStar.ts`
- Modify: `study-game/src/game/ImageRoomScene.ts`

- [ ] Write failing tests for straight-line simplification, obstacle preservation, blocked-corner protection, elevation changes, and directed stair boundaries.

- [ ] Add a test proving a long zig-zag route is shortened without producing a segment that leaves declared walkable geometry.

- [ ] Add a test proving the smoother returns the original path when no safe shortcut exists and returns `[]`/singletons unchanged.

- [ ] Run `npm run test:unit -- route-smoother.test.ts elevated-a-star.test.ts` and confirm only the new behavior fails.

- [ ] Implement a pure `smoothElevatedRoute(path, options)` function. Use a deterministic supercover grid traversal for line-of-sight checks, not floating-point sampling alone.

- [ ] Treat every elevation change and every configured stair edge as a hard boundary that cannot be smoothed across.

- [ ] Reuse the same walkable/blocked/corner rules as `findElevatedAStarPath`; expose a small shared predicate only if that prevents rule drift.

- [ ] Apply the smoother after A* returns and before room coordinates become motion waypoints.

- [ ] Preserve the exact start and goal nodes so tap markers and seat approaches stay aligned.

- [ ] Re-run focused tests, then `npm run test:unit -- navigation-graph.test.ts image-room-definition.test.ts`.

- [ ] Commit only these files with `feat(study): smooth safe avatar routes`.

---

## Task 3: Make route following speed-based and visually stable

**Files:**

- Modify: `study-game/src/game/PathMotion.ts`
- Modify: `study-game/src/game/AvatarController.ts`
- Modify: `study-game/src/game/ImageRoomScene.ts`
- Modify: `study-game/tests/path-motion.test.ts`
- Modify: `study-game/tests/avatar-controller.test.ts`

- [ ] Add failing tests for sampling by elapsed time at a configured pixels-per-second speed.

- [ ] Add failing tests for stable eight-direction selection near angle boundaries: small input jitter must not flip the avatar between adjacent rows every frame.

- [ ] Add failing tests for distance-based walk frames that continue smoothly across waypoint boundaries.

- [ ] Add a failing cancellation test: a stale route sample cannot snap the avatar after a newer tap begins.

- [ ] Run `npm run test:unit -- path-motion.test.ts avatar-controller.test.ts` and inspect the intended failures.

- [ ] Extend `PathMotion` with a deterministic route follower/sample helper that returns position, segment index, cumulative distance, completion, and direction vector from `(path, elapsedMs, speed)`.

- [ ] Add direction hysteresis to `AvatarController`: retain the prior direction inside a small angular dead band, while exact cardinal/diagonal motion still resolves immediately.

- [ ] Drive sprite position and walk frame from cumulative travelled distance rather than tween percentage or frame time.

- [ ] Use one world-space walking speed and derive total duration from path length. Do not give each segment its own full tween duration.

- [ ] Keep camera tracking continuous during retargeting and avoid resetting the walk cycle on every waypoint.

- [ ] Re-run focused tests and `npm run build`.

- [ ] Commit only the path, controller, scene, and test files with `feat(study): improve touch walking motion`.

---

## Task 4: Resolve every touch into one explicit world intent

**Files:**

- Create: `study-game/src/game/TouchIntentResolver.ts`
- Create: `study-game/tests/touch-intent-resolver.test.ts`
- Modify: `study-game/src/game/ImageRoomScene.ts`

- [ ] Write failing tests for seat hit areas taking priority over floor movement, tap-to-stand while seated, UI-consumed taps doing nothing, and unwalkable targets returning a rejected intent.

- [ ] Test that a second tap replaces the first and that a double tap does not enqueue duplicate seat interactions.

- [ ] Run the focused test and confirm the missing resolver is the failure.

- [ ] Implement a pure resolver returning exactly one of `walk`, `sit`, `stand`, `interact-player`, `blocked`, or `ignored` with the resolved world/grid target.

- [ ] In the scene, route Phaser pointer events through the resolver once. Remove overlapping pointer branches that can start both walking and sitting.

- [ ] Add a subtle tap marker at the accepted floor target, a seat highlight for accepted sit intent, and a brief blocked marker for unreachable/occupied targets.

- [ ] Keep markers non-interactive and destroy/fade them when the activity token changes.

- [ ] Re-run the focused test and `npm run test:unit -- image-room-definition.test.ts interaction-controller.test.ts`.

- [ ] Commit only these files with `feat(study): resolve touch gameplay intents`.

---

## Task 5: Complete the seat reservation, approach, sit, and stand transaction

**Files:**

- Modify: `study-game/src/game/InteractionController.ts`
- Create: `study-game/src/game/SeatReservationBook.ts`
- Modify: `study-game/src/game/ImageRoomScene.ts`
- Modify: `study-game/src/session/StudySessionTracker.ts`
- Modify: `study-game/tests/interaction-controller.test.ts`
- Create: `study-game/tests/seat-reservation-book.test.ts`
- Modify: `study-game/tests/study-session-tracker.test.ts`

- [ ] Write failing tests for local reservation, remote occupancy, same-user idempotency, release on cancellation, release after standing, and release when leaving the room.

- [ ] Extend controller tests to cover `approach → align → sit`, including the seat's requested facing and anchor offset.

- [ ] Add tests that study-time eligibility begins only after the sit transition completes and ends as soon as standing begins.

- [ ] Run the three focused test files and inspect the expected failures.

- [ ] Implement `SeatReservationBook` as a pure occupancy map keyed by room and seat, with explicit owner and reservation state.

- [ ] Extend `InteractionController` without removing its existing public behavior: distinguish `aligning` from `sitting`, preserve exact approach validation, and expose the resolved facing/anchor plan.

- [ ] In the scene, perform the visual sequence: walk to approach, short alignment tween, seated pose at anchor, occluder ordering, stand pose, return to approach, release.

- [ ] If a seat becomes unavailable before arrival, cancel safely at the avatar's current location, release the reservation, and show a short Turkish/English-safe status message without closing the game.

- [ ] On room change, reconnect, visibility loss that ends presence, or scene shutdown, release all local reservations and cancel pending seat callbacks.

- [ ] Re-run focused tests and `npm run build`.

- [ ] Commit only these files with `feat(study): finish reliable seat interactions`.

---

## Task 6: Replace the oversized HUD with compact mobile sheets

**Files:**

- Create: `study-game/src/ui/HudPanelState.ts`
- Create: `study-game/tests/hud-panel-state.test.ts`
- Modify: `study-game/src/main.ts`
- Modify: `study-game/src/styles.css`

- [ ] Write failing pure-state tests proving only one sheet can be open, tapping its button toggles it, switching sheets preserves the game canvas, Escape/keyboard is not required, and room/status/Gold remain visible.

- [ ] Run the focused test and confirm the missing state module failure.

- [ ] Implement `HudPanelState` for `closed`, `people`, `wardrobe`, `chat`, and `profile`.

- [ ] Refactor `main.ts` so HUD buttons update one state and one accessible bottom-sheet container rather than independent full-screen panels.

- [ ] Keep the top safe-area strip compact: room tabs, concise activity status, timer, Gold, people, and wardrobe. Move secondary information into bottom sheets.

- [ ] Add 44px minimum touch targets, safe-area padding, visible focus styles, reduced-motion behavior, and `aria-expanded`/`aria-controls` wiring.

- [ ] Ensure the canvas remains visible above every sheet and no sheet intercepts touches after it closes.

- [ ] Verify CSS at 320×568, 390×844, and 430×932 viewport contracts using Playwright assertions.

- [ ] Run `npm run test:unit -- hud-panel-state.test.ts` and `npm run build`.

- [ ] Commit only these files with `feat(study): compact the mobile game hud`.

---

## Task 7: Generate canonical eight-angle avatar and wardrobe source art

**Files:**

- Create: `study-game/art-source/avatar-v2/README.md`
- Create: `study-game/art-source/avatar-v2/body-reference.png`
- Create: `study-game/art-source/avatar-v2/radio-hoodie-reference.png`
- Create: `study-game/art-source/avatar-v2/varsity-jacket-reference.png`
- Create: `study-game/art-source/avatar-v2/bucket-hat-reference.png`
- Create: `study-game/art-source/avatar-v2/beanie-reference.png`
- Create: `study-game/scripts/build-avatar-v2-assets.mjs`
- Create: `study-game/tests/avatar-v2-assets.test.mjs`
- Modify: `study-game/package.json`

- [ ] Write a failing Node test that validates the v2 canonical canvas, eight direction rows, alpha bounds, registration anchors, non-empty front/back silhouettes, and layer dimensions.

- [ ] Add `generate:avatar-v2` to `package.json` and run the focused Node test to confirm source/build assets are absent.

- [ ] Use ImageGen to create a neutral full-body character turnaround on a flat chroma-key background: north/rear, north-east, east, south-east, south/front, south-west, west, and north-west; consistent proportions, lighting, camera, and clothing registration; no text or scenery.

- [ ] Generate matching hoodie, varsity jacket, bucket hat, and beanie references using the body reference as the visual registration guide. Explicitly require visible rear hood/seams, front opening/details, side thickness, and diagonal foreshortening.

- [ ] Inspect every generated reference. Reject direction swaps, mirrored logos/text, missing rear details, inconsistent head scale, or perspective drift.

- [ ] Use the skill-provided chroma-key removal workflow to create clean alpha. Do not hand-wave transparent edges or use Python as an image generator.

- [ ] Implement a deterministic build script that crops/normalizes the references into the existing 64×96 registration system and emits layered idle/walk/sit/stand sheets in the expected direction order.

- [ ] Keep generated output reproducible from committed canonical references and script; document exact direction order, anchors, and layer ownership in the art README.

- [ ] Run `npm run generate:avatar-v2`, the focused asset test, and visually inspect representative front, rear, diagonal, walk, sit, hat, and hoodie sheets.

- [ ] Commit only canonical references, script, package change, tests, and generated Study avatar files with `feat(study): add eight-angle avatar art`.

---

## Task 8: Integrate v2 layered animation and wardrobe previews

**Files:**

- Modify: `study-game/src/avatar/AvatarAssetManifest.ts`
- Modify: `study-game/src/avatar/AvatarLayerComposer.ts`
- Modify: `study-game/src/inventory/WearableCatalog.ts`
- Modify: `study-game/src/game/AvatarController.ts`
- Modify: `study-game/src/game/ImageRoomScene.ts`
- Modify: `study-game/src/main.ts`
- Modify: `study-game/tests/avatar-assets.test.mjs`
- Modify: `study-game/tests/avatar-controller.test.ts`
- Modify: `study-game/tests/wardrobe-domain.test.ts`

- [ ] Add failing tests for all body/action/direction combinations, wearable compatibility, hat/hood layer order, preview paths, and absence of missing texture keys.

- [ ] Add tests that front and rear hoodie/hat frames use different source regions and that equipped items persist through walk/sit/stand.

- [ ] Run the focused test set and inspect failures before changing the manifest.

- [ ] Point the manifest to v2 sheets while keeping stable wearable IDs (`radio-hoodie`, `varsity-jacket`, `bucket-hat`, `beanie`) so existing saved account appearance remains valid.

- [ ] Update layer composition rules for direction-aware foreground/background ordering: rear hair/hood/hat behind the face where appropriate and front accessories above the torso.

- [ ] Keep avatar feet registered to the same world anchor in idle, walk, sit, and stand so changing actions never produces a vertical pop.

- [ ] Update wardrobe previews to show the correct v2 item and immediate on-avatar preview without covering the room.

- [ ] Run focused tests, `npm run generate:avatar-v2`, and `npm run build`.

- [ ] Commit only the integration files with `feat(study): integrate layered avatar wardrobe`.

---

## Task 9: Record and inspect mobile gameplay frame by frame

**Files:**

- Modify: `study-game/e2e/study-rooms.spec.ts`
- Modify: `study-game/e2e/engine-proof.spec.ts`
- Create: `study-game/scripts/extract-qa-frames.mjs`
- Create: `study-game/qa/mobile-journeys.md`
- Modify: `study-game/package.json`

- [ ] Add Playwright journeys for rapid retargeting, obstacle route, stair route, tap-to-sit, tap-to-stand, occupied seat, wardrobe equip, chat sheet, and room switching.

- [ ] Make each journey assert that the game canvas remains mounted and that no answer/touch action closes the WebView surface.

- [ ] Configure representative devices/viewports with touch enabled and video retained for the QA project.

- [ ] Add `qa:frames` to extract evenly spaced frames plus frames around tap timestamps from Playwright video using the workspace's available video tooling.

- [ ] Run the journeys, extract frames, and inspect sequences for foot sliding, direction flicker, wall clipping, seat snapping, layer pops, black occluders, HUD obstruction, and stale-callback snaps.

- [ ] Fix every reproducible issue in the smallest owning module and add/extend a deterministic regression test before the fix.

- [ ] Repeat recording and frame inspection until the documented journeys are clean at 320×568, 390×844, and 430×932.

- [ ] Record the exact commands, viewport matrix, inspected artifact paths, and any accepted visual limitations in `qa/mobile-journeys.md`. Do not commit bulky transient videos unless already required by repository policy.

- [ ] Commit only the E2E, QA script/document, and regression fixes with `test(study): cover mobile gameplay journeys`.

---

## Task 10: Package, verify, commit, and publish the Study build

**Files:**

- Modify generated mirror only: `mobile/android/app/src/main/assets/study-game/**`
- Modify generated mirror only if required by existing scripts: `docs/study-game/**`

- [ ] Run the current repository verification commands documented in `docs/verification-2026-06-24.md` for Study; inspect every exit code.

- [ ] From `study-game/`, run at minimum:

  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run build`
  - `npm run generate:avatar-v2`

- [ ] Run the existing packaging/mirroring command documented by the repository. Do not copy files manually if a checked-in script owns the mirror.

- [ ] Re-run the Study unit test and build after mirroring to prove generated assets match the manifest.

- [ ] Inspect `git status --short`, `git diff --check`, and `git diff --cached --name-only`. Stage only Study source, Study docs, and the required Study mirrors.

- [ ] Create the final packaging commit with `build(study): package polished mobile game` only if mirroring produced tracked changes.

- [ ] Push `codex/study-game-oss` to GitHub.

- [ ] Compare local `HEAD`, `origin/codex/study-game-oss`, and the remote repository SHA; report the exact matching commit.

- [ ] Prepare the web-server Codex deployment prompt only after the pushed Study SHA is confirmed. The prompt must tell the server to adapt its WebView route to this Study build, keep Jukebox `/juke-local` separate, keep Voting separate, preserve Music PC voting information flow when Music PC is reachable, and never delete/nuke RadioTEDU files, WordPress pages, or personal/@tedu.edu.tr accounts.

## Definition of Done

- Tap-to-move and tap-to-sit are the only movement controls and remain usable in the mobile WebView.
- Repeated taps cancel cleanly; no stale tween can close, snap, or override the game.
- A* routes respect walkability, obstacles, blocked corners, elevation, stairs, and portals.
- Walking speed, facing, and animation remain visually stable over long and rapidly retargeted routes.
- Sitting performs approach, alignment, pose, occlusion, standing, release, and study-time transitions correctly.
- HUD sheets leave the game readable and playable on all target mobile viewports.
- Body, hoodie, jacket, hats, pants, and shoes align across eight genuine viewing angles and all actions.
- Frame-by-frame recorded QA has no unresolved gameplay blocker or major visual defect.
- Study tests, E2E, build, and packaging pass in the final session.
- The committed branch is pushed and the remote SHA is explicitly verified.
