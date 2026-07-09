import type {StudyLocationId, StudyRoomParticipant} from '../../services/studyService';
import {resolveSeatSlot, type SeatFacing, type SeatSlot} from '../../../../shared/social/seatSlots';

export type StudyTile = {x: number; y: number};
export type StudyTileKind = 'walkable' | 'blocked' | 'seat' | 'stair';
export type StudyBlockKind =
  | 'boundary'
  | 'building'
  | 'pergola'
  | 'bench'
  | 'tree'
  | 'planter'
  | 'bollard'
  | 'stage'
  | 'lawn'
  | 'seat-row'
  | 'riser'
  | 'stair'
  | 'rock';

export type StudySeat = {
  id: string;
  rowId: string;
  tile: StudyTile;
  entryTile: StudyTile;
};

export type StudySeatSlot = StudySeat &
  SeatSlot & {
  posture: 'sitting';
  pose: 'sit-left' | 'sit-right';
  facing: Extract<SeatFacing, 'west' | 'east'>;
  occlusionLayer: 'front-edge';
};

export type StudyBlockTile = {
  tile: StudyTile;
  kind: StudyBlockKind;
  tier: number;
};

export type StudyMapActor = {
  id: 'spark' | 'rock';
  name: string;
  subtitle?: string;
  logoKind?: 'ai-spark' | 'stone';
  tile: StudyTile;
};

export type StudyMapRow = {
  id: string;
  y: number;
  label: string;
};

export type StudyMapDefinition = {
  id: StudyLocationId;
  title: string;
  width: number;
  height: number;
  spawnTile: StudyTile;
  rows: StudyMapRow[];
  seats: StudySeat[];
  stairTiles: StudyTile[];
  riserTiles: StudyTile[];
  blockTiles: StudyBlockTile[];
  blockedTiles: StudyTile[];
  actors: StudyMapActor[];
};

export type StudySeatOccupant = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarStyle: string;
  equippedOutfit: Record<string, string | null>;
};

export type StudySeatOccupancy = {
  seatId: string;
  state: 'free' | 'occupied';
  occupant: StudySeatOccupant | null;
  slot: StudySeatSlot;
};

export type StudySeatOccupancySnapshot = Record<string, StudySeatOccupancy>;

export type OccupiedStudySeatMarker = {
  seatId: string;
  label: string;
  tile: StudyTile;
  leftPercent: number;
  topPercent: number;
  occupant: StudySeatOccupant;
};

const WIDTH = 28;
const HEIGHT = 22;
const SEAT_XS = range(4, 22, 2);
const ROWS: StudyMapRow[] = [
  {id: 'upper', y: 4, label: 'Upper lawn'},
  {id: 'mid-upper', y: 8, label: 'Mid-upper lawn'},
  {id: 'middle', y: 11, label: 'Middle lawn'},
  {id: 'mid-lower', y: 14, label: 'Mid-lower lawn'},
  {id: 'lower', y: 17, label: 'Lower lawn'},
];
const RISER_YS = [7, 10, 13, 16];
const STAIR_XS = [6, 7, 20, 21];
const AISLE_XS = [2, 3, 24, 25];

const stairTiles = RISER_YS.flatMap(y => [...AISLE_XS, ...STAIR_XS].map(x => ({x, y})));
const riserTiles = RISER_YS.flatMap(y => range(4, 22).map(x => ({x, y}))).filter(
  tile => !new Set(stairTiles.map(studyTileKey)).has(studyTileKey(tile)),
);
const seats = ROWS.flatMap(row =>
  SEAT_XS.map(x => ({
    id: `chim-${row.id}-seat-${x}`,
    rowId: row.id,
    tile: {x, y: row.y},
    entryTile: {x, y: row.y + 1},
  })),
);
const campusBlockers: Array<{kind: StudyBlockKind; tiles: StudyTile[]}> = [
  {kind: 'building', tiles: rectTiles(9, 1, 18, 1)},
  {kind: 'pergola', tiles: [...rectTiles(22, 2, 25, 3), {x: 23, y: 4}, {x: 25, y: 4}]},
  {kind: 'bench', tiles: [{x: 5, y: 19}, {x: 6, y: 19}, {x: 20, y: 19}, {x: 21, y: 19}]},
  {kind: 'tree', tiles: [{x: 2, y: 6}, {x: 24, y: 5}, {x: 3, y: 18}, {x: 25, y: 17}]},
  {kind: 'planter', tiles: [{x: 4, y: 20}, {x: 5, y: 20}, {x: 23, y: 18}, {x: 24, y: 18}]},
  {kind: 'bollard', tiles: [{x: 10, y: 20}, {x: 16, y: 20}, {x: 3, y: 17}, {x: 26, y: 16}]},
];
const blockedTiles = [
  ...boundaryTiles(),
  ...campusBlockers.flatMap(blocker => blocker.tiles),
  ...stageBlockedTiles(),
  ...riserTiles,
  {x: 23, y: 6},
  {x: 24, y: 6},
];
const blockTiles = buildStudyBlockTiles(seats, blockedTiles);

export const CHIM_ALAN_STUDY_MAP: StudyMapDefinition = {
  id: 'chim-alan',
  title: 'Çim alan',
  width: WIDTH,
  height: HEIGHT,
  spawnTile: {x: 13, y: 20},
  rows: ROWS,
  seats,
  stairTiles,
  riserTiles,
  blockTiles,
  blockedTiles,
  actors: [
    {id: 'spark', name: 'Spark', subtitle: 'rtAI - AI Host', logoKind: 'ai-spark', tile: {x: 14, y: 3}},
    {id: 'rock', name: 'Rock', logoKind: 'stone', tile: {x: 23, y: 6}},
  ],
};

const LIBRARY_WIDTH = 32;
const LIBRARY_HEIGHT = 32;
const libraryOpenTileKeys = new Set(['14,18', '20,23', '8,17', '25,19']);
const libraryBlockedTiles = [
  ...boundaryTilesFor(LIBRARY_WIDTH, LIBRARY_HEIGHT),
  ...rectTiles(0, 0, 31, 2),
  ...rectTiles(5, 8, 28, 12),
  ...rectTiles(0, 20, 21, 23),
  ...rectTiles(19, 27, 31, 30),
].filter(tile => !libraryOpenTileKeys.has(studyTileKey(tile)));

export const LIBRARY_STUDY_MAP: StudyMapDefinition = {
  id: 'library',
  title: 'Library',
  width: LIBRARY_WIDTH,
  height: LIBRARY_HEIGHT,
  spawnTile: {x: 14, y: 18},
  rows: [],
  seats: [],
  stairTiles: [],
  riserTiles: [],
  blockTiles: [],
  blockedTiles: libraryBlockedTiles,
  actors: [],
};

export function getStudyTileKind(map: StudyMapDefinition, tile: StudyTile): StudyTileKind {
  if (!isInStudyMap(map, tile)) {
    return 'blocked';
  }
  if (map.seats.some(seat => studyTileKey(seat.tile) === studyTileKey(tile))) {
    return 'seat';
  }
  if (map.stairTiles.some(stair => studyTileKey(stair) === studyTileKey(tile))) {
    return 'stair';
  }
  if (isStudyMovementBlocked(map, tile)) {
    return 'blocked';
  }
  return 'walkable';
}

export function resolveStudySeatSlot(map: StudyMapDefinition, seatId: string): StudySeatSlot | undefined {
  const seat = map.seats.find(candidate => candidate.id === seatId);
  if (!seat) {
    return undefined;
  }

  const facesEast = seat.tile.x < map.width / 2;
  const slot = resolveSeatSlot(
    [
      {
        id: seat.id,
        entryTile: seat.entryTile,
        sitTile: seat.tile,
        pose: facesEast ? 'sit-right' : 'sit-left',
        facing: facesEast ? 'east' : 'west',
        occlusionLayer: 'front-edge',
      },
    ],
    seat.id,
  );
  if (
    !slot ||
    (slot.facing !== 'east' && slot.facing !== 'west') ||
    (slot.pose !== 'sit-left' && slot.pose !== 'sit-right') ||
    slot.occlusionLayer !== 'front-edge'
  ) {
    return undefined;
  }

  return {
    ...seat,
    id: slot.id,
    entryTile: slot.entryTile,
    sitTile: slot.sitTile,
    tile: slot.sitTile,
    posture: 'sitting',
    pose: slot.pose,
    facing: slot.facing,
    occlusionLayer: 'front-edge',
  };
}

export function buildStudySeatOccupancySnapshot(
  map: StudyMapDefinition,
  participants: StudyRoomParticipant[],
): StudySeatOccupancySnapshot {
  const snapshot = Object.fromEntries(
    map.seats.map(seat => {
      const slot = resolveStudySeatSlot(map, seat.id)!;
      return [
        seat.id,
        {
          seatId: seat.id,
          state: 'free' as const,
          occupant: null,
          slot,
        },
      ];
    }),
  ) as StudySeatOccupancySnapshot;

  for (const participant of participants) {
    const seatId = typeof participant.seat_id === 'string' ? participant.seat_id : null;
    if (!seatId || participant.presence_mode === 'break' || !snapshot[seatId]) {
      continue;
    }

    snapshot[seatId] = {
      ...snapshot[seatId],
      state: 'occupied',
      occupant: {
        userId: participant.user_id,
        displayName: participant.display_name || 'RadioTEDU student',
        avatarUrl: participant.avatar_url || null,
        avatarStyle: participant.avatar_style || 'classic-red',
        equippedOutfit: participant.equipped_outfit || {},
      },
    };
  }

  return snapshot;
}

export function buildOccupiedStudySeatMarkers(
  map: StudyMapDefinition,
  participants: StudyRoomParticipant[],
  localSeatId?: string | null,
): OccupiedStudySeatMarker[] {
  const snapshot = buildStudySeatOccupancySnapshot(map, participants);
  return Object.values(snapshot)
    .filter(occupancy => occupancy.state === 'occupied' && occupancy.occupant && occupancy.seatId !== localSeatId)
    .map(occupancy => ({
      seatId: occupancy.seatId,
      label: occupancy.occupant!.displayName,
      tile: occupancy.slot.tile,
      leftPercent: (occupancy.slot.tile.x / map.width) * 100,
      topPercent: (occupancy.slot.tile.y / map.height) * 100,
      occupant: occupancy.occupant!,
    }));
}

export function findStudyPath(map: StudyMapDefinition, start: StudyTile, target: StudyTile): StudyTile[] {
  if (isStudyMovementBlocked(map, start) || isStudyMovementBlocked(map, target)) {
    return [];
  }

  const startKey = studyTileKey(start);
  const targetKey = studyTileKey(target);
  const open = new Map<string, PathNode>([
    [startKey, {tile: start, key: startKey, g: 0, f: heuristic(start, target)}],
  ]);
  const closed = new Set<string>();
  const cameFrom = new Map<string, string>();

  while (open.size > 0) {
    const current = [...open.values()].sort((left, right) => left.f - right.f || left.g - right.g)[0];
    if (current.key === targetKey) {
      return reconstructPath(cameFrom, current.key, startKey);
    }
    open.delete(current.key);
    closed.add(current.key);

    for (const neighbor of studyNeighbors(map, current.tile)) {
      const key = studyTileKey(neighbor);
      if (closed.has(key)) {
        continue;
      }

      const g = current.g + (neighbor.x !== current.tile.x && neighbor.y !== current.tile.y ? 1.4 : 1);
      const previous = open.get(key);
      if (previous && g >= previous.g) {
        continue;
      }
      cameFrom.set(key, current.key);
      open.set(key, {tile: neighbor, key, g, f: g + heuristic(neighbor, target)});
    }
  }

  return [];
}

export function studyTileKey(tile: StudyTile): string {
  return `${tile.x},${tile.y}`;
}

export function getStudyTileTier(tile: StudyTile): number {
  if (tile.y <= 3) {
    return 0;
  }
  if (tile.y <= 6) {
    return 1;
  }
  if (tile.y <= 9) {
    return 2;
  }
  if (tile.y <= 12) {
    return 3;
  }
  if (tile.y <= 15) {
    return 4;
  }
  return 5;
}

function isInStudyMap(map: StudyMapDefinition, tile: StudyTile): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height;
}

function isStudyMovementBlocked(map: StudyMapDefinition, tile: StudyTile): boolean {
  const key = studyTileKey(tile);
  return !isInStudyMap(map, tile) || map.blockedTiles.some(blocked => studyTileKey(blocked) === key);
}

function studyNeighbors(map: StudyMapDefinition, tile: StudyTile): StudyTile[] {
  return [
    {x: 0, y: -1},
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: -1, y: 0},
    {x: 1, y: -1},
    {x: 1, y: 1},
    {x: -1, y: 1},
    {x: -1, y: -1},
  ]
    .map(delta => ({x: tile.x + delta.x, y: tile.y + delta.y}))
    .filter(candidate => {
      if (isStudyMovementBlocked(map, candidate)) {
        return false;
      }
      const dx = candidate.x - tile.x;
      const dy = candidate.y - tile.y;
      if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
        return !isStudyMovementBlocked(map, {x: tile.x + dx, y: tile.y}) && !isStudyMovementBlocked(map, {x: tile.x, y: tile.y + dy});
      }
      return true;
    });
}

type PathNode = {
  tile: StudyTile;
  key: string;
  g: number;
  f: number;
};

function heuristic(from: StudyTile, to: StudyTile): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function reconstructPath(cameFrom: Map<string, string>, currentKey: string, startKey: string): StudyTile[] {
  const path: StudyTile[] = [];
  let cursor: string | undefined = currentKey;
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(',').map(Number);
    path.unshift({x, y});
    cursor = cameFrom.get(cursor);
  }
  return path;
}

function boundaryTiles(): StudyTile[] {
  return boundaryTilesFor(WIDTH, HEIGHT);
}

function boundaryTilesFor(width: number, height: number): StudyTile[] {
  return [
    ...range(0, width - 1).map(x => ({x, y: 0})),
    ...range(0, width - 1).map(x => ({x, y: height - 1})),
    ...range(0, height - 1).map(y => ({x: 0, y})),
    ...range(0, height - 1).map(y => ({x: width - 1, y})),
  ];
}

function stageBlockedTiles(): StudyTile[] {
  return [
    ...range(9, 18).map(x => ({x, y: 2})),
    ...range(10, 17).map(x => ({x, y: 3})),
  ].filter(tile => studyTileKey(tile) !== '14,3');
}

function buildStudyBlockTiles(studySeats: StudySeat[], studyBlockedTiles: StudyTile[]): StudyBlockTile[] {
  const boundaryKeys = new Set(boundaryTiles().map(studyTileKey));
  const campusKeys = new Map<string, StudyBlockKind>();
  campusBlockers.forEach(blocker => {
    blocker.tiles.forEach(tile => campusKeys.set(studyTileKey(tile), blocker.kind));
  });
  const stageKeys = new Set(stageBlockedTiles().map(studyTileKey));
  const stairKeys = new Set(stairTiles.map(studyTileKey));
  const riserKeys = new Set(riserTiles.map(studyTileKey));
  const seatKeys = new Set(studySeats.map(seat => studyTileKey(seat.tile)));
  const rockKeys = new Set(studyBlockedTiles.filter(tile => tile.y === 6 && (tile.x === 23 || tile.x === 24)).map(studyTileKey));
  const blocks: StudyBlockTile[] = [];

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const tile = {x, y};
      const key = studyTileKey(tile);
      blocks.push({
        tile,
        kind: boundaryKeys.has(key)
          ? 'boundary'
          : campusKeys.has(key)
            ? campusKeys.get(key)!
            : stageKeys.has(key)
              ? 'stage'
              : stairKeys.has(key)
                ? 'stair'
                : riserKeys.has(key)
                  ? 'riser'
                  : seatKeys.has(key)
                    ? 'seat-row'
                    : rockKeys.has(key)
                      ? 'rock'
                      : 'lawn',
        tier: getStudyTileTier(tile),
      });
    }
  }

  return blocks;
}

function rectTiles(startX: number, startY: number, endX: number, endY: number): StudyTile[] {
  const tiles: StudyTile[] = [];
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      tiles.push({x, y});
    }
  }
  return tiles;
}

function range(start: number, endInclusive: number, step = 1): number[] {
  const values: number[] = [];
  for (let value = start; value <= endInclusive; value += step) {
    values.push(value);
  }
  return values;
}
