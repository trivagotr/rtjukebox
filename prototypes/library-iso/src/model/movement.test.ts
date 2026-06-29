import { describe, expect, it } from 'vitest';
import { ROOM_MAP } from './roomMap';
import {
  AVATAR_DIRECTIONS,
  directionBetweenTiles,
  isMovementBlocked,
} from './movement';

describe('avatar movement model', () => {
  it('rejects furniture blocker tiles and allows walkable entry tiles', () => {
    expect(isMovementBlocked(ROOM_MAP, { x: 5, y: 6 })).toBe(true);
    expect(isMovementBlocked(ROOM_MAP, { x: 5, y: 4 })).toBe(false);
  });

  it('maps tile deltas to all eight distinct isometric directions', () => {
    expect(AVATAR_DIRECTIONS).toEqual([
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ]);
    expect(directionBetweenTiles({ x: 4, y: 4 }, { x: 5, y: 4 })).toBe('east');
    expect(directionBetweenTiles({ x: 4, y: 4 }, { x: 4, y: 5 })).toBe('south');
    expect(directionBetweenTiles({ x: 4, y: 4 }, { x: 3, y: 3 })).toBe('north-west');
  });
});
