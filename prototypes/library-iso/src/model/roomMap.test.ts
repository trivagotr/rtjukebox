import { describe, expect, it } from 'vitest';
import {
  DEBUG_TINTS,
  ROOM_MAP,
  getBlockedTiles,
  getFurnitureById,
  getSeatById,
  getTileKind,
  sortByIsoDepth,
} from './roomMap';

describe('room map rendering contract', () => {
  it('classifies walkable and blocked floor tiles for the debug overlay', () => {
    expect(getTileKind(ROOM_MAP, { x: 2, y: 8 })).toBe('walkable');
    expect(getTileKind(ROOM_MAP, { x: 1, y: 1 })).toBe('blocked');
    expect(DEBUG_TINTS.walkable).toBe(0x385d68);
    expect(DEBUG_TINTS.blocked).toBe(0x7d4254);
  });

  it('sorts nearer objects above farther objects using iso depth', () => {
    const far = { id: 'far', tile: { x: 3, y: 3 }, zBias: 10 };
    const near = { id: 'near', tile: { x: 5, y: 5 }, zBias: 10 };

    expect(sortByIsoDepth([near, far]).map((item) => item.id)).toEqual(['far', 'near']);
  });

  it('derives blocker tiles from furniture footprints', () => {
    const desk = getFurnitureById(ROOM_MAP, 'front-desk');
    const blockedKeys = new Set(getBlockedTiles(ROOM_MAP).map((tile) => `${tile.x},${tile.y}`));

    expect(desk?.footprint).toContainEqual({ x: 5, y: 6 });
    expect(blockedKeys.has('5,6')).toBe(true);
    expect(blockedKeys.has('5,5')).toBe(true);
  });

  it('declares real seat metadata for chair tiles', () => {
    const seat = getSeatById(ROOM_MAP, 'front-left');

    expect(seat).toMatchObject({
      id: 'front-left',
      tile: { x: 5, y: 5 },
      entryTile: { x: 5, y: 4 },
      deskTile: { x: 5, y: 6 },
      sitDir: 'south',
    });
    expect(getTileKind(ROOM_MAP, { x: 5, y: 5 })).toBe('seat');
    expect(DEBUG_TINTS.seat).toBe(0xa88944);
  });
});
