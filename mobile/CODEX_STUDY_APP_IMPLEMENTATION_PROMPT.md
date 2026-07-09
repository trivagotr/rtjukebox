/goal Complete and verify the RadioTEDU authenticated Study experience in the existing mobile app. Maintain a live checkbox to-do list, implement every requirement below, and do not mark the goal complete until real interaction, animation, visual, API, authentication, and Android verification evidence satisfies every acceptance criterion.

# RadioTEDU Study Mobile App Codex Prompt

You are working in the existing RadioTEDU mobile application repository. Finish the Study experience inside that app. The work includes a production-quality Çim Alan amphitheatre, A* movement, actual character animation, reliable chair sitting, global points HUD, avatar clothes, Spark, Rock, existing-login access, and Android Auto boundaries.

This prompt is authoritative. Do not create another app, standalone Study website, replacement Library, or throwaway prototype.

## Operating Rules

1. Read all repository instructions and inspect the existing navigation, auth context, API client, Study files, image assets, Android media service, tests, and release scripts before editing.
2. Create a checkbox task plan in the Codex task. Keep one item in progress and update statuses as verified work lands.
3. Work test-first. Replace source-string assertions with behavior tests where interaction is required.
4. Use the current app's design system, safe areas, navigation, auth token, error handling, analytics policy, and icon libraries.
5. Make small commits and do not include unrelated dirty-worktree changes.
6. Do not stop after mockups, static screenshots, interfaces, or tests that merely find function names. Build and exercise the real app.

## Protected Scope

- The approved Library is already complete. Do not redesign, regenerate, restyle, or replace Library.
- Do not modify `prototypes/library-study/` or approved Library assets unless a failing integration test proves a narrowly scoped app-shell fix is required.
- `prototypes/library-iso/` is intentionally deleted. Do not restore it.
- Work in the existing `mobile/` application. Do not create or ship a duplicate app such as `mobile-gamification/`.
- Study is available only after normal RadioTEDU app authentication. Do not add a second login or public web URL.
- Guests may see a locked Study entry that routes to the existing login, but may not enter rooms, earn points, reserve seats, buy clothes, or persist equipment.
- Use `library` and `chim-alan` exactly. Remove `cim-alan` and localized IDs from code and API payloads.

## Shared Canonical Server Contract

Use the same contract as `backend/CODEX_STUDY_GLOBAL_POINTS_PROMPT.md`:

- `GET /api/v1/study/profile`
- `POST /api/v1/study/sessions/start`
- `POST /api/v1/study/sessions/:sessionId/heartbeat`
- `POST /api/v1/study/sessions/:sessionId/finish`
- `GET /api/v1/study/rooms/:roomId`
- `POST /api/v1/study/rooms/:roomId/presence/heartbeat`
- `POST /api/v1/study/rooms/:roomId/seats/:seatId/reserve`
- `DELETE /api/v1/study/rooms/:roomId/seats/:seatId/reservation`
- `GET /api/v1/study/avatar/catalog`
- `GET /api/v1/study/avatar/me`
- `POST /api/v1/study/avatar/purchase`
- `POST /api/v1/study/avatar/equip`

Use the existing API client so the normal app bearer/session token is attached. Centralize parsing and error mapping in `mobile/src/services/studyService.ts`. Do not keep permanent split logic between `/study` and `/gamification/study-room`.

While the server's temporary legacy adapters exist, the app must use canonical endpoints. Handle stable error codes for expired session, nonce replay, occupied seat, reservation expiry, insufficient points, unowned item, and rate limiting.

## Initial To-Do Plan

Create these items in the task and refine them with exact repository paths:

- [ ] Establish failing behavior tests and baseline screenshots.
- [ ] Consolidate the Study API client on the canonical contract.
- [ ] Build the semantic Çim Alan amphitheatre and A* elevation graph.
- [ ] Implement the isometric/elevated renderer and deterministic depth sorting.
- [ ] Implement real directional walk, turn, sit, seated-idle, and stand animations.
- [ ] Connect every visible chair to its semantic seat and server reservation flow.
- [ ] Synchronize live movement, presence, occupancy, and equipped outfit.
- [ ] Build the global points HUD and complete clothes/closet menu.
- [ ] Add Spark with the AI mark and `rtAI - AI Host`; add Rock.
- [ ] Verify existing-login-only navigation and remove standalone access.
- [ ] Preserve Android Auto as media-only while keeping Spark/Rock audio discoverable.
- [ ] Run unit, integration, visual, Android build, and emulator verification.
- [ ] Audit the final diff for Library changes, duplicate apps, dead prototypes, and unrelated files.

## Çim Alan Semantic Map

Model Çim Alan as data, not as a decorative collection of rectangles.

Each tile/node must carry:

- `x`, `y`, and integer `elevation`,
- semantic kind: walkable, grass, path, stair, landing, riser, stage, seat, building, pergola, bench, tree, planter, wall, bollard, rock, or boundary,
- movement cost and blocked state,
- render layer/depth bias,
- optional interaction target.

Required composition:

- lower lawn and main entrance in the foreground,
- central amphitheatre terraces with clearly readable risers,
- left and right stair lanes with landings,
- upper campus building edge,
- pergola seating,
- benches, trees, planters, walls, and bollards,
- stage/host area,
- Spark and Rock anchors.

Only stairs and explicit ramps may change elevation. A* must never cross a riser, bench, wall, building, tree, planter, bollard, Rock footprint, occupied seat, or out-of-bounds tile.

Use deterministic A* with reproducible tie-breaking. Recompute when occupancy or map revision changes. If a destination becomes invalid, stop safely at the last valid tile and show a concise error state.

## Amphitheatre Projection and Depth

Implement a real isometric/elevated projection, equivalent to:

```ts
screenX = originX + (tile.x - tile.y) * (tileWidth / 2);
screenY =
  originY +
  (tile.x + tile.y) * (tileHeight / 2) -
  tile.elevation * elevationStep;
depth =
  (tile.x + tile.y) * 100 +
  tile.elevation * 10 +
  layerBias;
```

Adapt constants to the app's renderer, but keep one projection function for terrain, seats, hit targets, actors, and occupancy markers.

Do not simulate perspective by merely applying `skewX` to top-down blocks. Avatars must render behind upper walls/benches when appropriate and in front of lower terrace edges after descending.

The map must fit supported phone widths without fixed 390px or 340px assumptions. Preserve aspect ratio, safe-area clearance, readable HUD space, and stable touch coordinates on small and large Android screens.

## Character Renderer and Actual Animation

Replace the final `Y`/text marker with the app's real avatar renderer.

Required visible states:

- standing idle,
- directional walk cycle with multiple distinct frames,
- direction/turn update before movement,
- sit transition,
- seated idle aligned to chair facing,
- stand transition,
- temporary blocked/rejected feedback.

A function named `playAnimation` or a state named `sitting` is not proof. The rendered pixels must change over time.

Animation requirements:

- use at least four movement directions unless approved assets already provide eight,
- use a real frame sequence or an established animation facility in the current app,
- target a readable walk cadence around 6-10 fps,
- interpolate movement between tile centers without changing logical occupancy mid-step,
- cancel stale routes and animations using a route token,
- keep the avatar aligned with projection and depth each frame,
- use a visible 180-300ms sit/stand transition or the closest polished sequence supported by approved assets,
- never stretch or pulse one static image and call it a complete walk/sit animation.

If suitable wardrobe sprites already exist elsewhere in the workspace, verify provenance and integrate only the needed assets into the existing mobile asset structure. Do not ship a duplicate application folder.

## Chair Sitting: Required End-to-End Flow

Every visible chair must be the actual interaction target for its semantic seat. Do not render a separate floating `seatCloud` of anonymous dots.

For each seat define:

- stable `seatId`,
- chair tile and elevation,
- walkable entry tile and elevation,
- facing,
- avatar sit offset,
- occlusion layer,
- touch target derived from the same projected chair geometry.

Interaction sequence:

1. User taps the visible unoccupied chair.
2. Resolve the chair hit target to its semantic seat.
3. Run A* from the current logical tile to the seat entry tile.
4. Walk and animate to the entry tile.
5. Request the server seat reservation.
6. If accepted, turn toward the chair, play the sit transition, move to the exact seat offset, switch depth/occlusion, and start seated idle.
7. Update room presence with the authoritative seat ID and position.
8. On stand, room leave, logout, reservation expiry, or another destination, release the reservation and play the stand transition.
9. If reservation is rejected, remain or return to the entry tile, clear pending state, refresh occupancy, and tell the user the seat was taken.

Occupied chairs remain visible but have an occupied/disabled state. They must not silently ignore a tap.

Do not filter out every second seat or arbitrarily limit interaction to the first 30 seats. If performance requires virtualization, visual and semantic seat identity must remain one-to-one.

## Presence and Movement Synchronization

Lift logical avatar position out of a private preview component so the parent session/presence heartbeat sends the actual current tile and elevation, not always the spawn tile or only the seated tile.

Keep separate state for:

- logical current tile,
- visual interpolated position,
- current route,
- posture and direction,
- pending seat reservation,
- authoritative active seat,
- presence sequence and lease,
- server session and heartbeat nonce.

Presence heartbeats do not award points. Reward heartbeats use server-issued nonces and sequences from the active session. Never retry a consumed nonce blindly; refresh/reconcile using the server response.

Render other participants from server presence with their equipped outfit and authoritative seat. Expire stale participants according to server time/lease data.

## Points HUD and Session UX

Add a restrained, responsive Study HUD that shows:

- current spendable global points,
- today's Study points and daily cap,
- active mode: free or Pomodoro,
- server-synchronized elapsed eligible time,
- connection/reconnecting state,
- clear start/finish control,
- icon button to open the closet.

The Study home screen must provide a clear points summary and closet/menu entry for authenticated users. Do not hide all point information inside the closet or show only the most recent award.

The client may optimistically animate a server-confirmed award, but it must never calculate or persist its own balance.

## Clothes and Avatar Closet

Build a complete clothes menu using backend catalog/profile data:

- slot tabs for hair, top, bottom, shoes, and accessory,
- actual item preview, not only lock/hanger/check icons,
- current avatar preview with layered equipped items,
- owned, equipped, locked, unavailable, busy, insufficient-points, empty, loading, and error states,
- server-owned prices and wallet,
- purchase confirmation for point spending,
- equip after ownership confirmation,
- refresh/reconciliation after errors.

Apply the equipped outfit to the local Study avatar and remote participant avatars. Use stable asset keys from the server catalog; do not allow arbitrary remote URLs unless the app's existing trusted asset policy supports them.

## Spark and Rock

In Çim Alan:

- Add Spark near the host/stage anchor.
- Use an AI-style Spark mark consistent with the app's visual language.
- Display `Spark` with smaller secondary text exactly `rtAI - AI Host`.
- Add Rock as a distinct character/entity with a stable anchor, footprint, depth, and occupancy behavior.
- Spark/Rock interactions may open existing approved media/AI surfaces, but taps must not create unlimited point rewards.

Do not expose Study NPC interactions through Android Auto. Spark and Rock audio streams may remain available through the existing media browse/search contract.

## Authentication and Navigation

- Keep Study in the existing app navigation under `Study`.
- Authenticated users enter directly with their current session.
- Guests see a locked state and use the existing login route.
- Deep links or navigation actions to Study must pass through the existing auth guard.
- Do not add a Study WebView URL reachable outside the app.
- Do not log auth headers, nonces, precise private movement history, or sensitive profile data.

## Android Auto / Automotive

Verify, do not merely document:

- the manifest still declares the existing media browser correctly,
- radio, podcasts, Spark audio, and Rock audio remain browse/search/playable where already supported,
- Study, Çim Alan, points, wardrobe, seats, presence, and gameplay never appear in car browse roots, search results, queues, notifications, or templates,
- Study screens do not start an unsafe car-facing foreground service,
- phone Study changes do not regress media buttons, voice search, or playback.

Run the existing Android Auto source/contract tests and the applicable Android build. Record that real Google review/head-unit validation remains external if it cannot be performed.

## Required Tests and Visual Evidence

Add or strengthen:

1. Pure map tests for blockers, stairs, elevation transitions, deterministic A*, seat entry reachability, and projection/depth ordering.
2. React Native behavior tests that render the screen, tap a visible chair, advance animation timers, verify reservation calls, and observe walking/sitting/standing UI states.
3. Tests for occupied and race-rejected seats.
4. Animation tests that prove frame/style/position changes over time; source-string checks are not enough.
5. Service contract tests for every canonical endpoint, auth reuse, nonce rotation, stable errors, and `chim-alan`.
6. HUD and closet tests for real points, purchase/equip, insufficient balance, preview layering, loading/error/retry, and outfit application.
7. Navigation tests for authenticated entry, guest lock, and no second login.
8. Android Auto tests proving Study remains absent while approved media remains present.
9. Typecheck, lint, and package-local unit/integration suites.

Capture emulator/device screenshots at minimum:

- `chim-alan-initial`,
- `chim-alan-walking`,
- `chim-alan-seated`,
- `chim-alan-occupied-seat`,
- `study-points-hud`,
- `avatar-closet-equipped`,
- a small supported Android viewport,
- a large supported Android viewport.

Inspect screenshots, touch alignment, clipping, safe areas, text fit, depth/occlusion, and nonblank assets. Do not accept a screenshot with a large dead canvas, detached HUD, hidden room, floating seat controls, or overlapping labels.

## Completion Checklist

Do not close the goal until all are true:

- [ ] No approved Library implementation or asset was redesigned.
- [ ] `prototypes/library-iso/` remains deleted and no duplicate app/prototype was created.
- [ ] One canonical `/api/v1/study` client contract uses `chim-alan`.
- [ ] Çim Alan visibly reads as an elevated amphitheatre with stairs and deterministic depth.
- [ ] A* uses walkways/stairs and rejects blockers/elevation shortcuts.
- [ ] Tapping every visible available chair completes the full walk/reserve/sit flow.
- [ ] Walk, turn, sit, seated idle, and stand are real visible animations.
- [ ] Live heartbeat position follows actual movement and authoritative seating.
- [ ] Points HUD and closet/menu are complete and backend-owned.
- [ ] Equipped clothes visibly render on local and remote avatars.
- [ ] Spark, `rtAI - AI Host`, and Rock are present and correctly layered.
- [ ] Existing app auth grants access without a second login; guests are blocked.
- [ ] Study has no public standalone access.
- [ ] Android Auto remains media-only and relevant builds/tests pass.
- [ ] Behavior tests and inspected screenshots prove the user-facing flows.
- [ ] Final diff contains no unrelated files and all verification exit codes are reported honestly.
