import { depthForTile, type TileXY } from './iso';

export type TileKind = 'walkable' | 'blocked' | 'seat';

export type RoomMap = {
  width: number;
  height: number;
  blockedTiles: TileXY[];
};

export type DepthSortable = {
  id: string;
  tile: TileXY;
  zBias?: number;
};

export const DEBUG_TINTS: Record<TileKind, number> = {
  walkable: 0x385d68,
  blocked: 0x7d4254,
  seat: 0xa88944,
};

export const ROOM_MAP: RoomMap = {
  width: 14,
  height: 12,
  blockedTiles: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 11, y: 1 },
    { x: 12, y: 1 },
    { x: 12, y: 2 },
  ],
};

export function getTileKind(map: RoomMap, tile: TileXY): TileKind {
  if (!isInRoom(map, tile)) {
    return 'blocked';
  }

  return tileKeySet(map.blockedTiles).has(tileKey(tile)) ? 'blocked' : 'walkable';
}

export function getAllTiles(map: RoomMap): TileXY[] {
  const tiles: TileXY[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

export function sortByIsoDepth<T extends DepthSortable>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    return depthForTile(left.tile, left.zBias ?? 0) - depthForTile(right.tile, right.zBias ?? 0);
  });
}

export function isInRoom(map: RoomMap, tile: TileXY): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height;
}

export function tileKey(tile: TileXY): string {
  return `${tile.x},${tile.y}`;
}

function tileKeySet(tiles: TileXY[]): Set<string> {
  return new Set(tiles.map(tileKey));
}
