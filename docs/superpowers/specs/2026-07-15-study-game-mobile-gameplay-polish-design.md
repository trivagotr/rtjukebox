# Study Game Mobile Gameplay Polish Design

## Purpose

Turn the existing Study “Habbo” room into a polished mobile game without
rewriting its Phaser engine, room data, authenticated Study adapter, Gold
economy, or social backend. The experience remains touch-only:

- tap a reachable floor position to walk there;
- tap a seat to walk to it and sit;
- tap a floor position while seated to stand and walk;
- no keyboard controls, joystick, or desktop-first interaction model.

## Current-state findings

The project already has the correct foundation:

- an elevated A* graph with room-specific walk nodes and portals;
- eight direction labels (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`);
- explicit approach and sit anchors for seats;
- layered avatar slots for body, skin, hair, top, bottom, shoes, hat, and
  accessory;
- authenticated presence, chat, Study-session tracking, wardrobe ownership,
  and Gold purchases;
- mobile Playwright recordings and exact-room screenshots.

The weak points are coordination and presentation. The route follower uses a
single distance tween, the procedural 64×96 sprites barely distinguish angles,
walking has four minimal frames, sitting has one frame, the avatar is visually
small against the room art, and mobile panels obscure too much of the playfield.

## Goals

1. Make tap-to-move predictable, interruptible, collision-safe, and visually
   smooth across long routes, turns, stairs, and elevation portals.
2. Make tap-to-sit a complete physical sequence rather than a teleport to a
   seated sprite.
3. Give every state one explicit owner so rapid taps cannot corrupt movement,
   seating, Study tracking, or presence.
4. Replace placeholder-like avatar artwork with a coherent eight-angle avatar
   and aligned wardrobe layers generated from identity-locked ImageGen source
   turnarounds.
5. Make the mobile HUD compact, contextual, and usable with one hand while
   keeping the room visible.
6. Prove quality with deterministic tests plus recorded, frame-sampled mobile
   journeys.

## Non-goals

- No engine rewrite, 3D conversion, new room, keyboard input, virtual joystick,
  combat, quests, or unrelated social features.
- No changes to Juke-local, Voting, Music PC integration, or their routes.
- No weakening of the authenticated Study bridge, Account system, or Gold
  transaction invariants.
- No runtime AI image generation. All avatar artwork is generated and validated
  at development time, then shipped as ordinary static assets.

## Gameplay architecture

### Single avatar activity state machine

`ImageRoomScene` remains the orchestration boundary, but route planning,
movement progression, and seat transitions use one activity state:

```text
ready
  -> pathfinding
  -> walking
  -> aligning
  -> sitting
  -> seated
  -> standing
  -> ready

pathfinding | walking | aligning -> blocked -> ready
seated -> standing -> pathfinding (when the user taps a destination)
```

Each accepted touch receives a monotonically increasing intent ID. An async
transition may mutate the avatar only while its intent ID is still current.
This makes retapping cancellation explicit and prevents an older route or seat
promise from completing after a newer touch.

### Touch intent resolution

One resolver classifies each mobile tap in priority order:

1. interactive player;
2. seat hit area;
3. reachable room floor;
4. blocked or out-of-room point.

Seat hit areas are larger than their visible chair sprites, but the resulting
movement still targets the exact configured approach and sit anchors. A floor
tap snaps to the nearest reachable graph point inside a bounded radius. Invalid
touches show a short, non-blocking marker and do not disturb a valid seated
state.

### A* planning and path smoothing

The existing elevated A* solver remains authoritative for reachability. A new
route service returns a typed plan containing graph nodes, elevation segments,
world-space waypoints, and total length. Its smoothing pass may remove a middle
waypoint only when a room collision probe confirms the direct segment stays
inside walkable space and does not cross a stair/elevation portal boundary.

The planner therefore removes visible zigzags on open aisles while preserving
furniture avoidance, stair traversal, and correct portal order. A new tap
cancels the active intent and plans from the avatar's current interpolated
position rather than from the previous route's original node.

### Route following and animation

Movement advances by elapsed time and world distance, not by one monolithic
tween. The follower exposes current segment, position, normalized velocity,
distance travelled, and remaining distance.

- speed is constant in room space, with short ease-in/ease-out windows;
- direction derives from filtered velocity and changes only after a small
  hysteresis threshold to prevent diagonal flicker;
- walk frames derive from cumulative distance, so animation cadence remains
  stable across route segment lengths and device frame rates;
- the avatar decelerates into its destination instead of snapping;
- shadow, depth, presence position, and camera-visible position update from the
  same sample;
- stairs use the route's elevation segment while preserving screen-space foot
  contact.

### Sitting and standing

Seat interaction is transactional at the game-state level:

1. resolve and locally reserve the seat;
2. plan and follow A* to its approach node;
3. turn toward the seat's configured facing;
4. align feet to the approach anchor;
5. play the multi-frame sit transition into the sit anchor;
6. hide the standing shadow, apply seated depth/occlusion, and publish seated
   presence/Study state;
7. remain in a subtle seated-idle animation.

If the seat becomes occupied, the route is cancelled and the avatar stops at a
safe reachable point with `SEAT OCCUPIED` feedback. Standing reverses the
transition, restores the shadow at the approach point, and only then begins a
new route. Failed or cancelled transitions never publish a false seated state.

## Mobile HUD design

The playfield must remain the dominant surface. The HUD uses safe-area-aware,
pointer-transparent overlays and three compact layers:

1. A top status strip with the selected room, Study timer/state, and Gold.
2. Two small edge buttons for People and Wardrobe, each with a count or state
   badge.
3. A bottom chat pill that expands only while composing or reading messages.

People, wardrobe, and player details open as bottom sheets with a maximum
mobile height, a visible close affordance, and a dimming layer that never turns
the room fully black. Only one sheet may be open. Tapping the room closes the
sheet before issuing a movement intent, preventing accidental movement through
UI. A small world-space marker communicates destination, unreachable, occupied,
and selected-seat states without persistent status banners.

Wardrobe rows use an actual avatar preview for each owned or purchasable item,
show ownership, equipped state, Gold price, and pending purchase state. A failed
purchase preserves the current outfit and authoritative balance.

## Avatar and ImageGen asset design

### Canonical geometry

The runtime keeps the existing layered wardrobe model. A canonical source
avatar defines fixed canvas bounds, foot anchor, head anchor, body proportions,
and eight view angles. Runtime cell size is chosen after on-device comparison,
but all source renders are produced at higher resolution and downsampled with a
pixel-art-safe process.

Required action coverage per direction:

- idle: 2 frames;
- walk: 6 frames;
- sit transition: 4 frames;
- seated idle: 2 frames;
- stand transition: the validated reverse of sit, or four dedicated frames
  when reversal produces visible clothing errors.

### ImageGen workflow

Use the built-in ImageGen tool. First create one identity-locked eight-angle
turnaround on a perfectly flat chroma-key background. Front, rear, side, and
diagonal views must share face, body proportions, pixel density, outline,
lighting direction, and foot position. Rear views must show the true back of
the head and clothing rather than a front face pasted onto a rotated body.

Subsequent generations are constrained edits of that approved turnaround:

- base body/skin and short hair;
- Radio Hoodie and varsity jacket;
- jeans and black cargos;
- sneakers and boots;
- beanie and bucket hat.

Each garment is generated against the same pose grid and anchors. Chroma-key
sources are converted to alpha with the installed removal helper, visually
checked for fringe, then sliced into direction/action cells. The asset build
rejects wrong dimensions, opaque corners, missing directions, inconsistent
anchors, and incomplete action coverage.

Hair and hat layer order is direction-aware: rear directions can place parts
behind the head or torso, while front directions keep brims and hair in front.
Wardrobe assets may not change the avatar's identity, body geometry, or foot
anchor.

### Runtime integration

The manifest remains the source of truth for frame dimensions, actions,
directions, files, hashes, anchors, and layer offsets. The composer receives the
new action coverage without introducing outfit-specific gameplay logic. The
game preloads only the equipped set plus wardrobe preview thumbnails, then
loads an unequipped item when the wardrobe first needs it.

## Performance and accessibility budgets

- Target 60 FPS during normal movement on a representative mobile viewport;
  never fall below 30 FPS for sustained intervals during wardrobe or presence
  updates.
- Route planning for current room graphs should finish within one animation
  frame under ordinary conditions.
- No HUD panel may make the game canvas unavailable to screen readers or leave
  focus trapped after close.
- Interactive touch targets are at least 44 CSS pixels even when their visible
  art is smaller.
- Reduced-motion mode shortens UI transitions but preserves gameplay state
  sequencing.

## Error handling

- Unreachable floor: keep the current valid state and show an unreachable
  marker.
- Route invalidation: replan once from the current position; if still invalid,
  stop safely and report blocked.
- Occupied seat: release the local reservation and do not publish seated
  presence.
- Asset load failure: fall back to the last complete built-in outfit, never a
  partially layered avatar.
- ImageGen/source validation failure: reject that generated variant and retain
  the prior committed asset.
- Wardrobe API failure: keep the equipped outfit and restore the authoritative
  Gold balance returned by the adapter.

## Verification design

### Deterministic tests

- A* smoothing preserves portal/stair nodes and never crosses blocked polygons.
- A newer intent cancels all mutations from an older walk or seat intent.
- Route sampling is frame-rate independent and walk frames advance by distance.
- Direction hysteresis prevents single-sample diagonal flicker.
- Sit and stand publish presence only at the correct completed transition.
- Occupied, unreachable, and cancelled seat flows leave a recoverable state.
- Every wearable covers all required directions/actions and validates alpha,
  dimensions, anchors, and hashes.
- HUD sheets are mutually exclusive and taps inside UI never reach the room.

### Mobile recorded journeys

Playwright records the following at the production mobile viewport:

1. long aisle route with several direction changes;
2. rapid destination replacement while walking;
3. stair ascent and descent;
4. reachable seat approach, sit, seated idle, stand, and walk away;
5. occupied and unreachable seat attempts;
6. hoodie, jacket, trousers, shoes, and hat changes from front and rear views;
7. People, player card, wardrobe, chat, and Study timer interactions.

Frame sampling at regular intervals checks for teleport distance, foot sliding,
direction popping, clothing drift, depth/occlusion errors, black overlays, and
HUD obstruction. Representative front, rear, diagonal, walking, sitting, and
wardrobe frames are retained as QA evidence; rejected ImageGen variants and
temporary chroma-key files are not committed.

## Release boundaries

This phase changes only Study-game source, Study assets, Study tests, Study QA
scripts/configuration, and the mobile Study packaging output when intentionally
rebuilt. It does not alter Juke-local or Voting. Production deployment remains
the web server's separate, guarded release process.
