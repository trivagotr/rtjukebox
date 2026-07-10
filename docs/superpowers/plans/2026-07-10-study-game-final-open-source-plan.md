# RadioTEDU Study Game Final Open-Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 1. Goal

Build one authenticated, app-only, Habbo-style web game with two initial rooms:

- **Library:** the approved RadioTEDU Library visual identity, rebuilt as a real isometric room.
- **Chim Alan:** a real amphitheatre room with elevation, stairs, blocked tiles, A* movement, and valid sitting positions.

The same user and avatar must move between both rooms, walk with real animation frames, sit correctly, wear purchased clothing and hats, chat, see other room occupants, and retain account-owned appearance state.

## 2. Current State And Recovery Boundary

- Recovery branch: `codex/study-game-oss` in an isolated worktree.
- The worktree is heavily dirty and includes unrelated user work. Do not reset, restore, or delete broadly.
- `prototypes/` is currently untracked as one top-level path. Preserve it before any cleanup.
- The existing Library website is a useful visual and interaction reference, but its flat-image renderer is not the production engine.
- The current Chim HTML/CSS/JS implementation is rejected. It may be retained only as historical reference until the accepted engine replaces it.
- The secure packaged-WebView direction is still useful: direct Study entry, app authentication reuse, local asset navigation allowlist, and no token injection.
- No current APK is an accepted deliverable.
- Backend ownership is not settled. The client must be playable through a local adapter before server integration.

## 3. Final Technical Direction

### Production Core

- **Phaser 4.2.1** for the web game runtime.
- **Tiled** for isometric room authoring and object/collision metadata.
- **Rex Board 4.2.0** for isometric board occupancy, A*, movement, and action sequencing where its APIs fit.
- **Vite + TypeScript** for the game package.
- **Vitest** for domain/unit tests.
- **Playwright** for browser gameplay and screenshot verification.

### Open-Source Systems To Reuse Or Study

| Source | License posture | Approved use |
|---|---|---|
| Phaser | MIT | Direct production dependency |
| Rex Board / phaser4-rex-plugins | MIT | Direct production dependency after the passed API spike |
| Tiled | GPL application/tool | Author maps; commit only exported project/map data and owned/open assets |
| PixiJS | MIT | Indirect through Phaser or direct only for a proven missing renderer feature |
| Kenney asset packs | CC0 | Direct prototype and production use where visual style fits |
| PhaserQuest | MIT | Reuse small, attributable Socket.IO/client-server patterns if needed |
| Kaetram | MPL-2.0 | Study inventory, equipment, chat, presence, and account architecture; copy only isolated files after license review |
| Universal LPC | Mixed per-asset licenses | Prototype avatar pipeline or selected assets with generated credits and accepted obligations |
| Nitro Renderer | GPL-3.0 | Approved for production evaluation and reuse because the Study web client will be open source and GPL-compatible |
| OpenHabbo/Habbo assets | Unknown/proprietary unless proven otherwise | Do not scrape or import; use only public behavioral/visual reference |

### License Decision

The Study web client will be open source and may use GPLv3 code. Nitro Renderer is therefore a production candidate, not reference-only. The engine gate must compare Nitro reuse against Phaser/Rex on visual fit, custom-room cost, mobile/WebView performance, and asset independence. University status does not replace per-license compliance: retain notices, publish required source, generate asset credits, and perform legal review before distribution.

## 4. Required Repository Structure

Create a dedicated package instead of extending the rejected flat prototype:

```text
study-game/
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.ts
    game/
      StudyGame.ts
      RoomController.ts
      AvatarController.ts
      InteractionController.ts
      DepthController.ts
    avatar/
      AvatarAppearance.ts
      AvatarAssetManifest.ts
      AvatarLayerComposer.ts
      WardrobeController.ts
    rooms/
      RoomDefinition.ts
      library.room.ts
      chimAlan.room.ts
    pathfinding/
      ElevatedAStar.ts
    adapters/
      StudyAdapter.ts
      LocalStudyAdapter.ts
      RadioTEDUStudyAdapter.ts
    bridge/
      RadioTEDUBridge.ts
    ui/
      GameHud.ts
      WardrobeMenu.ts
    assets/
      avatars/
      rooms/library/
      rooms/chim-alan/
  public/
  tests/
  e2e/
  THIRD_PARTY.yml
  ATTRIBUTIONS.md
scripts/
  verify-third-party.mjs
docs/study-game/
  ENGINE-DECISION.md
  ASSET-PROVENANCE.md
  BASELINE.md
artifacts/study-game/
  engine-spike/
  library/
  chim-alan/
  android/
```

## 5. Core Contracts

Freeze these interfaces before room implementation:

```ts
type Direction8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type AvatarAction = 'idle' | 'walk' | 'sit' | 'stand';
type GridPoint = { x: number; y: number; z: number };

type AvatarAppearance = {
  bodyType: string;
  skinTone: string;
  hairId: string;
  hairColor: string;
  topId: string;
  bottomId: string;
  shoesId: string;
  hatId: string | null;
  accessoryId: string | null;
};

type WearableDefinition = {
  id: string;
  slot: 'hair' | 'top' | 'bottom' | 'shoes' | 'hat' | 'accessory';
  compatibleBodyTypes: string[];
  frames: Record<AvatarAction, Partial<Record<Direction8, string[]>>>;
  anchors: Record<AvatarAction, Partial<Record<Direction8, { x: number; y: number }>>>;
  layerByDirection: Partial<Record<Direction8, number>>;
};

type SeatDefinition = {
  id: string;
  tile: GridPoint;
  approach: GridPoint;
  facing: Direction8;
  sitAnchor: { x: number; y: number };
  foregroundObjectId?: string;
};

type RoomDefinition = {
  id: 'library' | 'chim-alan';
  spawn: GridPoint;
  tiles: TileDefinition[];
  objects: WorldObjectDefinition[];
  seats: SeatDefinition[];
  camera: RoomCameraDefinition;
};
```

## 6. Hard Acceptance Rules

- No visible seat circles, A* nodes, collision polygons, debug labels, or percentage-position hotspots in production mode.
- No CSS bobbing presented as walking. Walking uses sprite-sheet frames tied to movement distance/time.
- No fake sitting by merely swapping an image at an arbitrary screen percentage.
- No flat room bitmap as the sole render source. Furniture and foreground objects must participate in world depth.
- No APK before explicit website approval.
- No client-side point award, inventory ownership, clothing purchase, or seat-occupancy authority.
- DOM state is not proof of gameplay. Every major gate requires screenshots and a short recording.

## 7. Execution Plan

### Task 0: Preserve And Audit The Current Worktree

**Files:**
- Create: `docs/study-game/BASELINE.md`
- Create: `docs/study-game/ASSET-PROVENANCE.md`
- Inspect: `prototypes/library-study/`
- Inspect: `mobile/src/navigation/RootNavigator.tsx`
- Inspect: `mobile/src/screens/study/LibraryStudyWebView.tsx`
- Inspect: `mobile/src/services/studyWebViewService.ts`
- Inspect: `mobile/android/app/build.gradle`

- [x] Record all relevant modified/untracked files and identify their owner/purpose.
- [x] Copy no file from another branch over the dirty worktree.
- [x] Preserve the current Library prototype, screenshots, and generated assets.
- [x] Mark the rejected Chim prototype as `REJECTED_REFERENCE` in the baseline document; do not silently present it later.
- [x] Build an asset inventory with path, SHA-256, origin, author, license, derivative source, generator/script, and production eligibility.
- [x] Classify every asset as `approved`, `prototype-only`, `unknown-provenance`, or `rejected`.
- [x] Quarantine unknown-provenance Library/Chim/avatar assets so none enter production roots.

**Verification:** `git status --short` is recorded in `BASELINE.md`; no unrelated file is deleted or reverted.

### Task 1: Open-Source Acquisition And License Gate

**Files:**
- Create: `study-game/THIRD_PARTY.yml`
- Create: `study-game/ATTRIBUTIONS.md`
- Create: `scripts/verify-third-party.mjs`
- Create: `docs/study-game/ENGINE-DECISION.md`

- [x] Record exact repository URL, commit SHA, version, license, notice requirements, files copied, and modifications for every dependency/source.
- [x] Add Phaser, Rex, Tiled, Kenney, PhaserQuest, Kaetram, Universal LPC, and Nitro to the evaluation matrix.
- [x] Clone/run candidate demos only in a research workspace; do not copy them into product source during evaluation.
- [x] Build Nitro unmodified and refuse a visual launch without a lawful `.nitro` asset/server stack; no Habbo production assets were downloaded or scraped.
- [x] Run a Phaser/Rex isometric board spike with temporary project-authored shapes.
- [x] Generate an LPC avatar plus machine-readable credits to prove the wardrobe pipeline.
- [x] Make `verify-third-party.mjs` fail when an imported file has no license/origin/commit or archive-hash record.
- [x] Keep Kaetram reference-only; no MPL file is copied.
- [x] Record the explicit GPL-compatible Study client decision and the source-publication obligations for every GPL-derived module.

**Verification command:** `node scripts/verify-third-party.mjs`

**Gate:** `ENGINE-DECISION.md` names one production engine and one asset policy. No room work begins before this gate.

### Task 2: Engine Proof Before Real Rooms

**Files:**
- Create the `study-game/` package and engine/controller files listed above.
- Test: `study-game/tests/engine-proof.test.ts`
- E2E: `study-game/e2e/engine-proof.spec.ts`

- [x] Create a blank 12x12 isometric board with one raised platform, blocked objects, and a stair connection.
- [x] Add one layered avatar with idle, 8-direction walk, sit, and stand actions.
- [x] Add one top, one bottom, one pair of shoes, and one hat as independent layers.
- [x] Use A* to walk at least ten tiles and turn direction twice.
- [x] Reject routes through blocked tiles and elevation changes without stairs.
- [x] Sit at one seat using approach tile -> facing -> sit transition -> seat anchor -> foreground occlusion.
- [x] Stand and return to the approach tile before the next movement.
- [x] Prove the hat stays attached during walk, turns, sit, and stand.
- [x] Record initial, walking, stair, seated, and standing screenshots plus a short video.

**Commands:**
- `npm --prefix study-game test`
- `npm --prefix study-game run test:e2e -- engine-proof.spec.ts`

**Hard gate:** Present the visible browser proof to the user. If the movement or sitting does not look like a game, stop and fix the engine proof. Do not import Library.

### Task 3: Avatar, Wardrobe, And Inventory Domain

**Files:**
- Create the `study-game/src/avatar/` files listed above.
- Test: `study-game/tests/avatar-layer-composer.test.ts`
- Test: `study-game/tests/wardrobe-controller.test.ts`
- E2E: `study-game/e2e/wardrobe.spec.ts`

- [ ] Require every production wearable to supply valid frames and anchors for its supported actions/directions.
- [ ] Compose body, skin, hair, top, bottom, shoes, hat, and accessory as independently replaceable layers.
- [ ] Support direction-specific layer ordering, including hair/hat ordering and held accessories.
- [ ] Reject incompatible body types, unknown item IDs, unowned items, and incomplete animation metadata.
- [ ] Add wardrobe icon tabs, owned/locked/equipped states, preview, equip, and unequip.
- [ ] Keep ownership and purchase outside the renderer through `StudyAdapter`.
- [ ] Persist local adapter appearance across room switches and reload for development only.
- [ ] Verify two distinct outfits and two hats through all actions.

**Gate:** A wardrobe recording shows outfit/hat changes and no clipping or disappearing during walk/sit.

### Task 4: Convert Library Into A Real Room

**Files:**
- Create: `study-game/src/rooms/library.room.ts`
- Create: `study-game/src/assets/rooms/library/`
- Test: `study-game/tests/library-room.test.ts`
- E2E: `study-game/e2e/library-room.spec.ts`

- [ ] Use the accepted Library PNG only as visual reference during conversion.
- [ ] Produce separate floor, wall, furniture, chair, lamp, plant, sofa, and foreground assets or layers.
- [ ] Author the Library in Tiled with tile/object footprints, seats, spawn, and occlusion metadata.
- [ ] Derive blockers from placed world objects, not hand-typed percentage polygons.
- [ ] Define approach/facing/anchor/foreground data for each usable chair.
- [ ] Verify paths around at least three desk groups.
- [ ] Verify sitting in at least three chair types.
- [ ] Verify the avatar passes behind/in front of furniture according to world depth.
- [ ] Keep HUD separate from the world canvas.

**Gate:** User approves Library idle/walk/sit screenshots and recording.

### Task 5: Build Chim Alan As The Second Room

**Files:**
- Create: `study-game/src/rooms/chimAlan.room.ts`
- Create: `study-game/src/assets/rooms/chim-alan/`
- Test: `study-game/tests/chim-alan-room.test.ts`
- E2E: `study-game/e2e/chim-alan-room.spec.ts`

- [ ] Model path, grass, retaining walls, amphitheatre rows, landings, and stairs as world geometry.
- [ ] Assign real `z` elevation to each amphitheatre row.
- [ ] Permit elevation changes only through declared stair/step edges.
- [ ] Define world-space seats with invisible hit-testing and visible geometry only.
- [ ] Add seat edge occlusion so the avatar appears physically seated on the amphitheatre step.
- [ ] Add Spark as a world actor with an AI-style badge and small `rtAI - AI Host` label.
- [ ] Add Rock as a world object/actor with world depth, not a HUD card.
- [ ] Verify spawn -> path -> stairs -> seat -> stand -> Spark route.

**Gate:** User approves the complete Chim Alan browser recording. No mobile work begins before this approval.

### Task 6: One Client, Two Rooms, One Avatar

**Files:**
- Create/modify: `study-game/src/game/RoomController.ts`
- Test: `study-game/tests/room-controller.test.ts`
- E2E: `study-game/e2e/room-switching.spec.ts`

- [ ] Load Library and Chim Alan inside one running game client.
- [ ] Switch rooms through a game command/menu/door without opening a separate mock app.
- [ ] Preserve account identity, appearance, wardrobe state, and HUD account data.
- [ ] Clear route, seat, camera, and room occupancy state on transition.
- [ ] Verify Library -> Chim Alan -> Library with the same equipped hat/outfit.

### Task 7: Local Social Adapter First

**Files:**
- Create: `study-game/src/adapters/StudyAdapter.ts`
- Create: `study-game/src/adapters/LocalStudyAdapter.ts`
- Test: `study-game/tests/study-adapter.contract.test.ts`

Define adapter operations for:

- `joinRoom`, `leaveRoom`
- `publishMovement`, `claimSeat`, `releaseSeat`
- `sendChat`, `subscribeRoomState`
- `getInventory`, `previewItem`, `equipItem`, `unequipItem`, `purchaseItem`
- `getPointBalance`
- `startStudySession`, `heartbeatStudySession`, `finishStudySession`

- [ ] Implement deterministic local fake users, occupancy, chat, wardrobe, and point display for browser development.
- [ ] Do not award real points locally.
- [ ] Make seat conflicts and rejected equip/purchase operations testable.
- [ ] Run both rooms entirely against the local adapter.

### Task 8: Backend Contract And Anti-Cheat

**Files:**
- Use/update the detailed English backend handoff prompt under `backend/`.
- Create later: `study-game/src/adapters/RadioTEDUStudyAdapter.ts`
- Do not deploy until the backend repository/owner is confirmed.

- [ ] Server owns balances, inventory, purchases, equipped appearance, seat occupancy, and credited time.
- [ ] Use idempotency keys for purchase/equip/session finish.
- [ ] Use server clock, rotating session nonce, heartbeat limits, replay protection, and immutable reward ledger.
- [ ] Validate movement speed, room transitions, seat reachability, and elevation transitions without requiring every animation frame from the client.
- [ ] Rate-limit chat and point-affecting actions.
- [ ] Broadcast only public appearance/presence data.

### Task 9: Authenticated App Bridge And App-Only Access

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Modify: `mobile/src/screens/study/LibraryStudyWebView.tsx`
- Modify: `mobile/src/services/studyWebViewService.ts`
- Modify: `mobile/android/app/build.gradle`
- Test: `mobile/__tests__/studyNavigation.test.ts`
- Test: `mobile/__tests__/studyWebViewService.test.ts`

- [ ] Keep the Study tab routed directly to the packaged game.
- [ ] Reuse the app's authenticated user without a second login.
- [ ] Inject only public account presentation data; never access/refresh tokens.
- [ ] Keep navigation inside `file:///android_asset/study-game/`.
- [ ] Block external navigation, popups, universal file URL access, third-party cookies, and mixed content.
- [ ] Package `study-game/dist/` rather than hand-selecting source files.
- [ ] Preserve the signed-out/guest lock screen.

### Task 10: Website Acceptance

**Files:**
- E2E: `study-game/e2e/acceptance.spec.ts`
- Artifacts: `artifacts/study-game/library/`, `artifacts/study-game/chim-alan/`

- [ ] Run desktop and 390x844 viewports.
- [ ] Capture Library idle/walk/sit and wardrobe states.
- [ ] Capture Chim idle/stair-walk/sit/Spark interaction states.
- [ ] Capture room switch with persistent outfit/hat.
- [ ] Assert no console errors.
- [ ] Assert the canvas is nonblank and pixel output changes during walk animation.
- [ ] Assert HUD does not cover the avatar, chat, wardrobe, or room controls.
- [ ] Present the website visibly and obtain explicit user approval.

**Hard stop:** Do not build an APK without explicit approval.

### Task 11: Android Build And Device Proof

**Files:**
- Artifact: `artifacts/study-game/android/`

- [ ] Run focused mobile tests and lint.
- [ ] Build the web game and verify its complete dist manifest is inside generated Android assets.
- [ ] Build and install the debug APK.
- [ ] Open Study with an already authenticated account.
- [ ] Capture ADB screenshots for both rooms, one walking state, one seated state, and wardrobe state.
- [ ] Verify app restart preserves account appearance but clears stale movement/seat/session state.

**Commands:**
- `npm --prefix study-game run build`
- `npm --prefix mobile test -- --runInBand`
- `cd mobile/android; .\gradlew.bat assembleDebug --console=plain`

### Task 12: Android Auto

- [ ] Keep the Study game unavailable while driving.
- [ ] Limit Android Auto integration to safe audio browsing/playback and permitted controls.
- [ ] Treat Android Auto as a separate milestone after the Study game is accepted.

## 8. Test Matrix

### Unit/Domain

- Tile-to-screen and screen-to-tile conversion.
- A* blockers and deterministic routes.
- Elevated route requires stairs.
- Route cancellation token prevents stale movement completion.
- Seat approach/reachability/occupancy conflicts.
- Sit and stand state transitions.
- Direction-aware avatar frame selection.
- Wearable compatibility, ownership, anchors, and layer ordering.
- Room switching preserves appearance and clears room state.
- Adapter contract rejects unauthorized local actions.

### Browser E2E

- Ten-tile animated walk with two turns.
- Walk behind and in front of objects.
- Library chair sit/stand.
- Chim stair climb and amphitheatre sit/stand.
- Hat and outfit persist through every action.
- Clothes menu preview/equip/unequip.
- Two-room transition.
- Spark and Rock world interactions.
- Chat and deterministic fake participants.
- Mobile HUD fit and text containment.

### Security

- No credential value in game globals, DOM, storage, logs, or messages.
- File-only navigation allowlist.
- Server rejects replayed nonce/idempotency keys.
- Server rejects unowned clothing and client-supplied balances.
- Server rejects impossible seat/elevation transitions.

## 9. Orchestration And Usage Limits

- Sol is the only orchestrator.
- Use at most one implementation worker at a time until the engine proof is accepted.
- Give each worker a bounded write set and exact acceptance command.
- Use lower-cost agents for inventory, documentation, license manifest, and isolated tests.
- Keep engine, avatar, and visual acceptance decisions with Sol.
- Do not ask multiple agents to explore the same question.
- Stop at every visual gate; do not continue accumulating code after a failed screenshot.
- Commit after each accepted task and push the recovery branch regularly.

## 10. Final Definition Of Done

The project is complete only when:

1. The website visibly behaves like a game, not a static image with overlays.
2. Library and Chim Alan exist in one client.
3. The avatar has real 8-direction walking, turning, sitting, standing, and depth.
4. Purchased/owned tops, bottoms, shoes, hair, hats, and accessories render correctly through every action.
5. A* respects furniture, walls, grass, seats, stairs, elevation, and occupancy.
6. Spark and Rock are in-world entities.
7. Account identity and appearance persist across rooms and app restart.
8. Points, inventory, purchases, sessions, and occupancy are server-authoritative in production.
9. The website receives explicit visual approval before APK packaging.
10. Browser and device screenshots prove every critical state.
11. Every imported source and asset has a recorded origin, commit/version, license, attribution, and production eligibility.

## 11. Recommended Commit Sequence

1. `docs: preserve Study game recovery baseline`
2. `build: add third-party provenance gate`
3. `feat: prove isometric engine and layered avatar`
4. `feat: add wardrobe and wearable animation contracts`
5. `feat: rebuild Library as a playable room`
6. `feat: add playable Chim Alan amphitheatre`
7. `feat: preserve avatar across Study rooms`
8. `feat: add local social and inventory adapter`
9. `feat: bridge authenticated app account safely`
10. `test: add Study game visual acceptance suite`
11. `build: package approved Study game for Android`

## 12. Execution Handoff

This document is the canonical plan. The earlier recovery notes are historical context only. Start with Task 0 and Task 1; do not resume from the rejected Chim prototype.
