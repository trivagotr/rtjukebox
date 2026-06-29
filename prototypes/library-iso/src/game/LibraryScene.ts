import Phaser from 'phaser';
import {
  DEBUG_TINTS,
  ROOM_MAP,
  type FurnitureObject,
  type FurnitureKind,
  type SeatDefinition,
  getAllTiles,
  getBlockedTiles,
  getSeatById,
  getSeatByTile,
  getTileKind,
  isInRoom,
  sortByIsoDepth,
} from '../model/roomMap';
import {
  ISO_CELL,
  depthForTile,
  screenToTile,
  type ScreenXY,
  type TileXY,
  tileToScreen,
} from '../model/iso';
import {
  AVATAR_DIRECTIONS,
  type AvatarDirection,
  type AvatarState,
  avatarStateForSeat,
  directionBetweenTiles,
  isMovementBlocked,
} from '../model/movement';

const generatedAssets = import.meta.glob(['../assets/generated/*.png', '!../assets/generated/*sheet*.png'], {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

type RexBoardPlugin = {
  add: {
    board(config: unknown): unknown;
    pathFinder(config: unknown): RexPathFinder;
    moveTo(chess: Phaser.GameObjects.GameObject, config: unknown): RexMoveTo;
  };
};

type RexBoard = {
  addChess(chess: Phaser.GameObjects.GameObject, tileX: number, tileY: number, tileZ: string | number, align?: boolean): void;
  contains(tileX: number, tileY: number, tileZ?: string | number): boolean;
  getChessData(chess: Phaser.GameObjects.GameObject): { setBlocker(value?: boolean): void };
  hasBlocker(tileX: number, tileY: number, tileZ?: string | number): boolean;
  worldXYToTileXY(x: number, y: number): TileXY;
};

type RexPathNode = TileXY & {
  pathCost?: number;
};

type RexPathFinder = {
  setChess(chess: Phaser.GameObjects.GameObject): RexPathFinder;
  findPath(endTileXY: TileXY): RexPathNode[];
};

type RexMoveTo = {
  moveTo(tileXY: TileXY): RexMoveTo;
  once(event: 'complete', callback: () => void): RexMoveTo;
};

declare global {
  interface Window {
    __libraryIsoDebug?: {
      avatar?: AvatarState;
      lastPath?: TileXY[];
      lastPathCrossedBlocker?: boolean;
      lastPathTargetBlocked?: boolean;
      rexBlockers?: Array<TileXY & { contains: boolean; hasBlocker: boolean }>;
      isSeated?: boolean;
      lastClickedTile?: TileXY;
      sceneReady?: boolean;
      studySeconds?: number;
      tileToScreen?: (tile: TileXY) => ScreenXY;
    };
  }
}

const BOARD_ORIGIN = {
  x: 195,
  y: 120,
};

const FURNITURE_TEXTURES: Record<FurnitureKind, string> = {
  'desk-long': 'desk-long.png',
  chair: 'chair.png',
  'desk-lamp': 'desk-lamp.png',
  bookshelf: 'bookshelf.png',
  plant: 'plant.png',
  'sofa-green': 'sofa-green.png',
};

const FURNITURE_SCALES: Record<FurnitureKind, number> = {
  'desk-long': 0.74,
  chair: 0.31,
  'desk-lamp': 0.34,
  bookshelf: 0.42,
  plant: 0.34,
  'sofa-green': 0.46,
};

const AVATAR_SCALE = 0.32;

export class LibraryScene extends Phaser.Scene {
  private board?: RexBoard;
  private debugOverlay?: Phaser.GameObjects.Graphics;
  private debugOverlayVisible = true;
  private avatar?: Phaser.GameObjects.Sprite;
  private avatarState: AvatarState = {
    tile: { x: 2, y: 10 },
    dir: 'north-east',
    pose: 'idle',
    seatId: null,
  };
  private pathFinder?: RexPathFinder;
  private moveTo?: RexMoveTo;
  private routeToken = 0;
  private timerText?: Phaser.GameObjects.Text;
  private studyStartedAtMs = 0;
  private studiedBeforeMs = 0;

  rexBoard!: RexBoardPlugin;

  constructor() {
    super('library-scene');
  }

  preload(): void {
    for (const [kind, filename] of Object.entries(FURNITURE_TEXTURES)) {
      this.load.image(`furniture-${kind}`, assetUrl(filename));
    }
    this.load.image('furniture-desk-long-occluder', assetUrl('desk-long-occluder.png'));
    this.load.image('room-window', assetUrl('window.png'));
    this.load.image('room-wall-left', assetUrl('wall-left.png'));
    this.load.image('room-stair', assetUrl('stair.png'));

    for (const direction of AVATAR_DIRECTIONS) {
      for (const pose of ['idle', 'walk', 'sit'] as const) {
        this.load.image(`avatar-${direction}-${pose}`, assetUrl(`avatar-${direction}-${pose}.png`));
      }
    }
  }

  create(): void {
    window.__libraryIsoDebug = {
      sceneReady: true,
      avatar: this.avatarState,
      tileToScreen: (tile: TileXY) => tileToScreen(tile, BOARD_ORIGIN),
    };

    this.board = this.rexBoard.add.board({
      grid: {
        gridType: 'quadGrid',
        x: BOARD_ORIGIN.x,
        y: BOARD_ORIGIN.y,
        cellWidth: ISO_CELL.width,
        cellHeight: ISO_CELL.height,
        type: 'isometric',
      },
      width: ROOM_MAP.width,
      height: ROOM_MAP.height,
    }) as RexBoard;

    this.createAvatarAnimations();
    this.drawWalls();
    this.drawFloor();
    this.placeFurnitureBlockers();
    this.drawDebugOverlay();
    this.drawFurniture();
    this.createAvatar();
    this.createHud();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer.worldX, pointer.worldY);
    });
    this.input.keyboard?.on('keydown-D', () => {
      this.debugOverlayVisible = !this.debugOverlayVisible;
      this.debugOverlay?.setVisible(this.debugOverlayVisible);
    });
  }

  update(): void {
    if (!this.avatar) {
      return;
    }

    const tile = screenToTile({ x: this.avatar.x, y: this.avatar.y }, BOARD_ORIGIN);
    this.avatar.setDepth(depthForTile(tile, this.avatarDepthBias()));
    this.updateStudyTimer();
  }

  private handlePointerDown(worldX: number, worldY: number): void {
    if (!this.board) {
      return;
    }

    const tile = this.board.worldXYToTileXY(worldX, worldY);
    if (!isInRoom(ROOM_MAP, tile)) {
      return;
    }

    window.__libraryIsoDebug = {
      ...window.__libraryIsoDebug,
      lastClickedTile: tile,
    };
    console.log(`tile ${tile.x},${tile.y}`);
    const seat = getSeatByTile(ROOM_MAP, tile);
    if (seat) {
      this.sitAtSeat(seat);
      return;
    }

    if (this.avatarState.pose === 'sit') {
      this.standUpFromSeat();
    }
    this.walkTo(tile);
  }

  private drawFloor(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x5f8794, 0.72);
    graphics.fillStyle(0x243a47, 0.9);

    for (const tile of getAllTiles(ROOM_MAP)) {
      drawIsoDiamond(graphics, tileToScreen(tile, BOARD_ORIGIN));
    }
    graphics.setDepth(-10);
  }

  private drawDebugOverlay(): void {
    this.debugOverlay = this.add.graphics();
    for (const tile of getAllTiles(ROOM_MAP)) {
      const kind = getTileKind(ROOM_MAP, tile);
      this.debugOverlay.fillStyle(DEBUG_TINTS[kind], kind === 'blocked' ? 0.48 : 0.2);
      this.debugOverlay.lineStyle(1, DEBUG_TINTS[kind], 0.38);
      drawIsoDiamond(this.debugOverlay, tileToScreen(tile, BOARD_ORIGIN));
    }
    this.debugOverlay.setDepth(1);
    this.debugOverlay.setVisible(this.debugOverlayVisible);
  }

  private drawWalls(): void {
    const graphics = this.add.graphics();
    const top = tileToScreen({ x: 0, y: 0 }, BOARD_ORIGIN);
    const right = tileToScreen({ x: ROOM_MAP.width - 1, y: 0 }, BOARD_ORIGIN);
    const left = tileToScreen({ x: 0, y: ROOM_MAP.height - 1 }, BOARD_ORIGIN);
    drawWallPanel(graphics, [top, right], 0x263542, 0x182631);
    drawWallPanel(graphics, [top, left], 0x1f3140, 0x16222d);
    graphics.setDepth(-30);

    const windowSprite = this.add.image(236, 78, 'room-window');
    windowSprite.setOrigin(0.5, 0.9);
    windowSprite.setScale(0.44);
    windowSprite.setDepth(-28);

    const wallSprite = this.add.image(102, 98, 'room-wall-left');
    wallSprite.setOrigin(0.5, 0.9);
    wallSprite.setScale(0.4);
    wallSprite.setDepth(-27);
  }

  private placeFurnitureBlockers(): void {
    if (!this.board) {
      return;
    }

    const rexBlockers: Array<TileXY & { contains: boolean; hasBlocker: boolean }> = [];
    for (const tile of getBlockedTiles(ROOM_MAP)) {
      const screen = tileToScreen(tile, BOARD_ORIGIN);
      const blocker = this.add.zone(screen.x, screen.y, ISO_CELL.width, ISO_CELL.height);
      blocker.setVisible(false);
      this.board.addChess(blocker, tile.x, tile.y, `blocker-${tile.x}-${tile.y}`, false);
      this.board.getChessData(blocker).setBlocker();
      rexBlockers.push({
        ...tile,
        contains: this.board.contains(tile.x, tile.y),
        hasBlocker: this.board.hasBlocker(tile.x, tile.y),
      });
    }
    window.__libraryIsoDebug = {
      ...window.__libraryIsoDebug,
      rexBlockers,
    };
  }

  private drawFurniture(): void {
    if (!this.board) {
      return;
    }

    for (const object of sortByIsoDepth(ROOM_MAP.furniture.map((item) => ({ ...item, tile: item.anchor, zBias: item.depthBias })))) {
      const screen = tileToScreen(object.anchor, BOARD_ORIGIN);
      const sprite = this.add.image(screen.x, screen.y + ISO_CELL.height / 2, textureKeyFor(object));
      sprite.setOrigin(0.5, 1);
      sprite.setScale(FURNITURE_SCALES[object.kind]);
      sprite.setDepth(depthForTile(object.anchor, object.depthBias));
      sprite.setData('roomObjectId', object.id);
      sprite.setData('kind', object.kind);
      this.board.addChess(sprite, object.anchor.x, object.anchor.y, `visual-${object.id}`, false);

      if (object.kind === 'desk-long') {
        const occluder = this.add.image(screen.x, screen.y + ISO_CELL.height / 2, 'furniture-desk-long-occluder');
        occluder.setOrigin(0.5, 1);
        occluder.setScale(FURNITURE_SCALES[object.kind]);
        occluder.setDepth(depthForTile(object.anchor, object.depthBias + 120));
        occluder.setData('roomObjectId', `${object.id}-occluder`);
      }
    }
  }

  private createAvatar(): void {
    if (!this.board) {
      return;
    }

    const start = tileToScreen(this.avatarState.tile, BOARD_ORIGIN);
    this.avatar = this.add.sprite(start.x, start.y, 'avatar-north-east-idle');
    this.avatar.setOrigin(0.5, 1);
    this.avatar.setScale(AVATAR_SCALE);
    this.avatar.setDepth(depthForTile(this.avatarState.tile, this.avatarDepthBias()));
    this.board.addChess(this.avatar, this.avatarState.tile.x, this.avatarState.tile.y, 'avatar-local', false);
    this.pathFinder = this.rexBoard.add.pathFinder({
      pathMode: 'A*',
      blockerTest: true,
      occupiedTest: true,
      cost: 1,
    }).setChess(this.avatar);
    this.moveTo = this.rexBoard.add.moveTo(this.avatar, {
      speed: 190,
      rotateToTarget: false,
      blockerTest: true,
      occupiedTest: true,
    });
    this.playAvatarAnimation('idle', this.avatarState.dir);
    this.syncDebugState();
  }

  private walkTo(target: TileXY, onArrive?: (token: number) => void): void {
    if (!this.avatar || !this.pathFinder || !this.moveTo || !this.board) {
      return;
    }

    const token = this.routeToken + 1;
    this.routeToken = token;
    if (sameTile(this.avatarState.tile, target)) {
      onArrive?.(token);
      return;
    }

    const path = this.pathFinder.findPath(target).map((node) => ({ x: node.x, y: node.y }));
    const pathCrossedBlocker = path.some((tile) => this.board?.hasBlocker(tile.x, tile.y) ?? false);
    const targetBlocked = isMovementBlocked(ROOM_MAP, target);
    window.__libraryIsoDebug = {
      ...window.__libraryIsoDebug,
      lastPath: path,
      lastPathCrossedBlocker: pathCrossedBlocker,
      lastPathTargetBlocked: targetBlocked,
    };

    if (targetBlocked || path.length === 0 || pathCrossedBlocker) {
      this.avatarState = {
        ...this.avatarState,
        pose: 'idle',
      };
      this.playAvatarAnimation('idle', this.avatarState.dir);
      this.syncDebugState();
      return;
    }

    this.followPath(path, token, onArrive);
  }

  private followPath(path: TileXY[], token: number, onArrive?: (token: number) => void): void {
    if (!this.moveTo || path.length === 0 || token !== this.routeToken) {
      this.avatarState = {
        ...this.avatarState,
        pose: 'idle',
      };
      this.playAvatarAnimation('idle', this.avatarState.dir);
      this.syncDebugState();
      if (token === this.routeToken) {
        onArrive?.(token);
      }
      return;
    }

    const [next, ...rest] = path;
    const dir = directionBetweenTiles(this.avatarState.tile, next);
    this.avatarState = {
      ...this.avatarState,
      tile: next,
      dir,
      pose: 'walk',
      seatId: null,
    };
    this.playAvatarAnimation('walk', dir);
    this.syncDebugState();
    this.moveTo.moveTo(next).once('complete', () => {
      if (token !== this.routeToken) {
        return;
      }
      this.followPath(rest, token, onArrive);
    });
  }

  private sitAtSeat(seat: SeatDefinition): void {
    this.walkTo(seat.entryTile, (token) => {
      if (token !== this.routeToken) {
        return;
      }
      this.placeAvatarAt(seat.tile, seat.sitOffset);
      this.avatarState = avatarStateForSeat(seat);
      this.playAvatarAnimation('sit', seat.sitDir);
      this.startStudyTimer();
      this.syncDebugState();
    });
  }

  private standUpFromSeat(): void {
    const seat = this.avatarState.seatId ? getSeatById(ROOM_MAP, this.avatarState.seatId) : undefined;
    if (!seat) {
      return;
    }

    this.stopStudyTimer();
    this.placeAvatarAt(seat.entryTile);
    this.avatarState = {
      ...this.avatarState,
      tile: seat.entryTile,
      pose: 'idle',
      seatId: null,
    };
    this.playAvatarAnimation('idle', this.avatarState.dir);
    this.syncDebugState();
  }

  private placeAvatarAt(tile: TileXY, offset: ScreenXY = { x: 0, y: 0 }): void {
    if (!this.avatar || !this.board) {
      return;
    }

    const screen = tileToScreen(tile, BOARD_ORIGIN);
    this.avatar.setPosition(screen.x + offset.x, screen.y + offset.y);
    this.board.addChess(this.avatar, tile.x, tile.y, 'avatar-local', false);
  }

  private playAvatarAnimation(pose: 'idle' | 'walk' | 'sit', dir: AvatarDirection): void {
    this.avatar?.play(`avatar-${pose}-${dir}`, true);
  }

  private syncDebugState(): void {
    window.__libraryIsoDebug = {
      ...window.__libraryIsoDebug,
      avatar: { ...this.avatarState, tile: { ...this.avatarState.tile } },
      isSeated: this.avatarState.pose === 'sit',
      studySeconds: Math.floor(this.getStudyElapsedMs() / 1000),
    };
  }

  private createHud(): void {
    this.timerText = this.add.text(14, 12, 'NOW 00:00', {
      color: '#edf5f3',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: '700',
      backgroundColor: 'rgba(14, 21, 28, 0.72)',
      padding: { x: 8, y: 5 },
    });
    this.timerText.setDepth(100000);
  }

  private startStudyTimer(): void {
    if (this.studyStartedAtMs === 0) {
      this.studyStartedAtMs = Date.now();
    }
  }

  private stopStudyTimer(): void {
    if (this.studyStartedAtMs !== 0) {
      this.studiedBeforeMs += Date.now() - this.studyStartedAtMs;
      this.studyStartedAtMs = 0;
    }
  }

  private updateStudyTimer(): void {
    const elapsedSeconds = Math.floor(this.getStudyElapsedMs() / 1000);
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
    this.timerText?.setText(`NOW ${minutes}:${seconds}`);
    if (window.__libraryIsoDebug) {
      window.__libraryIsoDebug.studySeconds = elapsedSeconds;
    }
  }

  private getStudyElapsedMs(): number {
    const activeMs = this.studyStartedAtMs === 0 ? 0 : Date.now() - this.studyStartedAtMs;
    return this.studiedBeforeMs + activeMs;
  }

  private avatarDepthBias(): number {
    return this.avatarState.pose === 'sit' ? 2300 : 180;
  }

  private createAvatarAnimations(): void {
    for (const direction of AVATAR_DIRECTIONS) {
      this.anims.create({
        key: `avatar-idle-${direction}`,
        frames: [{ key: `avatar-${direction}-idle` }],
        frameRate: 1,
        repeat: -1,
      });
      this.anims.create({
        key: `avatar-walk-${direction}`,
        frames: [{ key: `avatar-${direction}-walk` }, { key: `avatar-${direction}-idle` }],
        frameRate: 5,
        repeat: -1,
      });
      this.anims.create({
        key: `avatar-sit-${direction}`,
        frames: [{ key: `avatar-${direction}-sit` }],
        frameRate: 1,
        repeat: -1,
      });
    }
  }
}

function textureKeyFor(object: FurnitureObject): string {
  return `furniture-${object.kind}`;
}

function assetUrl(filename: string): string {
  const url = generatedAssets[`../assets/generated/${filename}`];
  if (!url) {
    throw new Error(`Missing generated asset: ${filename}`);
  }
  return url;
}

function sameTile(left: TileXY, right: TileXY): boolean {
  return left.x === right.x && left.y === right.y;
}

function drawIsoDiamond(graphics: Phaser.GameObjects.Graphics, center: ScreenXY): void {
  const halfWidth = ISO_CELL.width / 2;
  const halfHeight = ISO_CELL.height / 2;

  graphics.beginPath();
  graphics.moveTo(center.x, center.y - halfHeight);
  graphics.lineTo(center.x + halfWidth, center.y);
  graphics.lineTo(center.x, center.y + halfHeight);
  graphics.lineTo(center.x - halfWidth, center.y);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

function drawWallPanel(
  graphics: Phaser.GameObjects.Graphics,
  floorEdge: [ScreenXY, ScreenXY],
  topColor: number,
  sideColor: number,
): void {
  const [start, end] = floorEdge;
  const wallHeight = 94;

  graphics.fillStyle(sideColor, 1);
  graphics.beginPath();
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(end.x, end.y);
  graphics.lineTo(end.x, end.y - wallHeight);
  graphics.lineTo(start.x, start.y - wallHeight);
  graphics.closePath();
  graphics.fillPath();

  graphics.lineStyle(1, 0x547282, 0.45);
  graphics.strokePath();
  graphics.fillStyle(topColor, 0.58);
  graphics.fillRect(Math.min(start.x, end.x), Math.min(start.y, end.y) - wallHeight, Math.abs(end.x - start.x) || 2, 8);
}
