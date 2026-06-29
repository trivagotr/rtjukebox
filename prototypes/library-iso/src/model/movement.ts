import type { TileXY } from './iso';
import { getBlockedTiles, isInRoom, tileKey, type RoomMap, type SeatDefinition } from './roomMap';

export const AVATAR_DIRECTIONS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

export type AvatarDirection = (typeof AVATAR_DIRECTIONS)[number];
export type AvatarPose = 'idle' | 'walk' | 'sit';

export type AvatarState = {
  tile: TileXY;
  dir: AvatarDirection;
  pose: AvatarPose;
  seatId: string | null;
};

export function isMovementBlocked(map: RoomMap, tile: TileXY): boolean {
  if (!isInRoom(map, tile)) {
    return true;
  }

  return new Set(getBlockedTiles(map).map(tileKey)).has(tileKey(tile));
}

export function directionBetweenTiles(from: TileXY, to: TileXY): AvatarDirection {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const key = `${dx},${dy}`;
  const directions: Record<string, AvatarDirection> = {
    '0,-1': 'north',
    '1,-1': 'north-east',
    '1,0': 'east',
    '1,1': 'south-east',
    '0,1': 'south',
    '-1,1': 'south-west',
    '-1,0': 'west',
    '-1,-1': 'north-west',
    '0,0': 'south',
  };

  return directions[key] ?? 'south';
}

export function avatarStateForSeat(seat: SeatDefinition): AvatarState {
  return {
    tile: seat.tile,
    dir: seat.sitDir,
    pose: 'sit',
    seatId: seat.id,
  };
}
