import { describe, expect, it } from 'vitest';
import {
  ISO_CELL,
  depthForTile,
  screenToTile,
  tileToScreen,
} from './iso';

describe('isometric tile math', () => {
  it('round-trips tile coordinates through screen coordinates', () => {
    for (const tile of [
      { x: 0, y: 0 },
      { x: 4, y: 2 },
      { x: 9, y: 6 },
      { x: 13, y: 10 },
    ]) {
      const screen = tileToScreen(tile);

      expect(screenToTile(screen)).toEqual(tile);
    }
  });

  it('uses the required 64x32 cell and tile depth rule', () => {
    expect(ISO_CELL).toEqual({ width: 64, height: 32 });
    expect(depthForTile({ x: 5, y: 8 })).toBe(13_000);
    expect(depthForTile({ x: 5, y: 8 }, 37)).toBe(13_037);
  });
});
