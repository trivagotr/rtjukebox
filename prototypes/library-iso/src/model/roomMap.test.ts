import { describe, expect, it } from 'vitest';
import {
  DEBUG_TINTS,
  ROOM_MAP,
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
});
