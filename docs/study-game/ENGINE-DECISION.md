# Study Game Engine Decision

**Status:** Accepted for the engine-proof phase on 2026-07-10.

## Selected Stack

- Phaser `4.2.1` as the browser game runtime and renderer.
- `phaser4-rex-plugins` / Rex Board `4.2.0` for isometric grid conversion, occupancy, pathfinding, and movement helpers where its API remains useful.
- Tiled `1.12.2` as an optional authoring tool for project-owned room data.
- Original RadioTEDU-owned layered avatar and room art for the hard engine proof.

## Why This Stack

The Phaser/Rex spike built and rendered a 12x12 isometric board with a raised platform, blocked objects, and a visible stair route in a standalone browser client. It is independent of a hotel server and external asset conversion pipeline, and it can be embedded in the existing authenticated mobile WebView without adopting a legacy hotel protocol.

Nitro Renderer is visually closer to Habbo and its GPL-3.0 license is compatible with the intended open-source Study client. It was still rejected for v1 because the renderer alone is not a runnable game: Nitro React expects converted `.nitro` furniture/avatar assets, game-data JSON files, image libraries, camera endpoints, and a Morningstar-compatible WebSocket server. The research checkout contains no lawful demo room/avatar asset set. Nitro React also has no root license file at the pinned commit, and the Nitro Renderer dependency tree reported 16 vulnerabilities during the clean research install.

Selecting Phaser/Rex does not mean re-creating an engine from scratch. It keeps the proven renderer, grid, input, camera, animation, and board/pathfinding libraries while allowing RadioTEDU to own the avatar states, seat anchors, stair rules, rooms, UI, and social protocol.

## Asset Decision

The hard engine proof will use original RadioTEDU-owned pixel layers or CC0 assets with exact provenance. Universal LPC proved that a wardrobe pipeline can produce body, hair, top, pants, shoes, hat, walk, and sit layers with machine-readable credits, but the generated research avatar is not automatically approved for production. No Habbo production assets are allowed.

## Measured Evidence

| Check | Result |
| --- | --- |
| Phaser/Rex build | Passed; 405 modules transformed |
| Phaser/Rex browser marker | Passed; `data-engine-spike="ready"` |
| Phaser/Rex canvas | Passed; one 960x680 canvas |
| Phaser/Rex visible board | Passed by screenshot inspection |
| Nitro Renderer build | Passed; 2,716 modules transformed |
| Nitro lawful visual demo | Not possible without a separately licensed `.nitro` asset/server stack |
| Nitro clean-install audit | 8 moderate and 8 high vulnerabilities |
| LPC hosted wardrobe pipeline | Passed by browser screenshot and exact credit export |
| LPC pinned local build on Windows | Failed on unresolved generated metadata/Bulma files; recorded as upstream risk |
| Third-party verifier tests | Passed; 8 tests |
| Real third-party manifest | Passed |

Evidence images:

- `docs/study-game/evidence/task-1/phaser-rex-isometric-spike.jpg`
- `docs/study-game/evidence/task-1/lpc-generator-dressed-avatar.jpg`

## Hard Constraints For Task 2

1. Build only the blank engine-proof room before importing Library or Chim.
2. The avatar must show distinct animation frames, eight directions, layered top/bottom/shoes/hat, A* movement, legal stairs, blocked-route rejection, and sit/stand transitions.
3. A seat is a stateful interaction with approach tile, facing, anchor, pose, and occlusion. It is not a teleport or a hidden click hotspot.
4. Browser screenshots must visibly prove idle, walking, turning, stair traversal, sitting, standing, and hat attachment.
5. If the proof does not look and move like a game, stop and repair it before room production begins.
