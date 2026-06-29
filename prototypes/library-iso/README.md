# RadioTEDU Library Iso Prototype

Phaser 3 + Vite + TypeScript rebuild of the living-library room under `prototypes/library-iso/`.

## Tooling

- Required: `phaser`, `phaser3-rex-plugins`, `playwright`, `vite`, `typescript`, `vitest`.
- Context7 MCP is configured at the repo root in `.mcp.json`.
- Optional Phaser Editor MCP, Tiled, and Kenney assets were not used for Milestones 1-5.

## Rendering Model

The room is a 64x32 isometric tile grid. Every avatar and furniture object is a separate Phaser object with depth:

```ts
depth = (tileX + tileY) * 1000 + zBias;
```

Furniture footprints in `src/model/roomMap.ts` derive blocker tiles. The scene mirrors those blockers onto Rex Board chess data with `setBlocker()`, and movement uses Rex PathFinder with `pathMode: 'A*'`, `blockerTest: true`, and MoveTo.

## Art Pipeline

The original `prototypes/library-study/assets/library-habbo.png` is reference art only. Milestones 3-5 use generated Habbo-style transparent PNG cutouts in `src/assets/generated/`, produced via chroma-key removal and cropped into individual sprites. No fake duplicate chair prop is used.

## Verification

```bash
npm test
npm run build
node verify-runtime.mjs
```

`verify-runtime.mjs` boots Vite, proves Rex sees desk blockers, taps a chair, asserts seated state/timer start, taps the floor, asserts stand/walk, and writes:

- `screenshots/m5-initial.png`
- `screenshots/m5-walking-to-seat.png`
- `screenshots/m5-seated.png`
