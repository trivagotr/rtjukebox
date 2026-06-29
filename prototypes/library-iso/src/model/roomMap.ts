import { depthForTile, type TileXY } from './iso';

export type TileKind = 'walkable' | 'blocked' | 'seat';

export type FurnitureKind = 'desk-long' | 'chair' | 'desk-lamp' | 'bookshelf' | 'plant' | 'sofa-green';

export type FurnitureObject = {
  id: string;
  kind: FurnitureKind;
  anchor: TileXY;
  footprint: TileXY[];
  depthBias: number;
  seatId?: string;
  blocksMovement?: boolean;
};

export type SeatDefinition = {
  id: string;
  label: string;
  tile: TileXY;
  entryTile: TileXY;
  deskTile: TileXY;
  sitDir: 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west';
};

export type RoomMap = {
  width: number;
  height: number;
  blockedTiles: TileXY[];
  furniture: FurnitureObject[];
  seats: SeatDefinition[];
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
  furniture: [
    {
      id: 'front-desk',
      kind: 'desk-long',
      anchor: { x: 6, y: 6 },
      footprint: [
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 7, y: 6 },
        { x: 8, y: 6 },
      ],
      depthBias: 240,
    },
    {
      id: 'front-left-chair',
      kind: 'chair',
      anchor: { x: 5, y: 5 },
      footprint: [{ x: 5, y: 5 }],
      depthBias: 170,
      seatId: 'front-left',
    },
    {
      id: 'front-right-chair',
      kind: 'chair',
      anchor: { x: 7, y: 5 },
      footprint: [{ x: 7, y: 5 }],
      depthBias: 170,
      seatId: 'front-right',
    },
    {
      id: 'front-lamp',
      kind: 'desk-lamp',
      anchor: { x: 6, y: 6 },
      footprint: [],
      depthBias: 380,
      blocksMovement: false,
    },
    {
      id: 'lower-desk',
      kind: 'desk-long',
      anchor: { x: 5, y: 9 },
      footprint: [
        { x: 3, y: 9 },
        { x: 4, y: 9 },
        { x: 5, y: 9 },
        { x: 6, y: 9 },
        { x: 7, y: 9 },
      ],
      depthBias: 240,
    },
    {
      id: 'lower-left-chair',
      kind: 'chair',
      anchor: { x: 4, y: 8 },
      footprint: [{ x: 4, y: 8 }],
      depthBias: 170,
      seatId: 'lower-left',
    },
    {
      id: 'back-bookshelf',
      kind: 'bookshelf',
      anchor: { x: 2, y: 1 },
      footprint: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ],
      depthBias: 210,
    },
    {
      id: 'reading-plant',
      kind: 'plant',
      anchor: { x: 12, y: 2 },
      footprint: [
        { x: 12, y: 1 },
        { x: 12, y: 2 },
      ],
      depthBias: 190,
    },
  ],
  seats: [
    {
      id: 'front-left',
      label: 'Front desk',
      tile: { x: 5, y: 5 },
      entryTile: { x: 5, y: 4 },
      deskTile: { x: 5, y: 6 },
      sitDir: 'south',
    },
    {
      id: 'front-right',
      label: 'Front desk',
      tile: { x: 7, y: 5 },
      entryTile: { x: 7, y: 4 },
      deskTile: { x: 7, y: 6 },
      sitDir: 'south',
    },
    {
      id: 'lower-left',
      label: 'Lower row',
      tile: { x: 4, y: 8 },
      entryTile: { x: 4, y: 7 },
      deskTile: { x: 4, y: 9 },
      sitDir: 'south',
    },
  ],
};

export function getTileKind(map: RoomMap, tile: TileXY): TileKind {
  if (!isInRoom(map, tile)) {
    return 'blocked';
  }

  if (tileKeySet(map.seats.map((seat) => seat.tile)).has(tileKey(tile))) {
    return 'seat';
  }

  return tileKeySet(getBlockedTiles(map)).has(tileKey(tile)) ? 'blocked' : 'walkable';
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

export function getBlockedTiles(map: RoomMap): TileXY[] {
  const blocked = new Map<string, TileXY>();
  for (const tile of map.blockedTiles) {
    blocked.set(tileKey(tile), tile);
  }
  for (const object of map.furniture) {
    if (object.blocksMovement === false) {
      continue;
    }
    for (const tile of object.footprint) {
      blocked.set(tileKey(tile), tile);
    }
  }

  return [...blocked.values()];
}

export function getFurnitureById(map: RoomMap, id: string): FurnitureObject | undefined {
  return map.furniture.find((object) => object.id === id);
}

export function getSeatById(map: RoomMap, id: string): SeatDefinition | undefined {
  return map.seats.find((seat) => seat.id === id);
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
