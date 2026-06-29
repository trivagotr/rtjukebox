import Phaser from 'phaser';
import {
  DEBUG_TINTS,
  ROOM_MAP,
  type FurnitureObject,
  getAllTiles,
  getBlockedTiles,
  getTileKind,
  isInRoom,
  sortByIsoDepth,
} from '../model/roomMap';
import { ISO_CELL, depthForTile, type ScreenXY, type TileXY, tileToScreen } from '../model/iso';

type RexBoardPlugin = {
  add: {
    board(config: unknown): unknown;
  };
};

type RexBoard = {
  addChess(chess: Phaser.GameObjects.GameObject, tileX: number, tileY: number, tileZ: string | number, align?: boolean): void;
  worldXYToTileXY(x: number, y: number): TileXY;
};

declare global {
  interface Window {
    __libraryIsoDebug?: {
      lastClickedTile?: TileXY;
      sceneReady?: boolean;
    };
  }
}

const BOARD_ORIGIN = {
  x: 195,
  y: 120,
};

export class LibraryScene extends Phaser.Scene {
  private board?: RexBoard;
  private debugOverlay?: Phaser.GameObjects.Graphics;
  private debugOverlayVisible = true;

  rexBoard!: RexBoardPlugin;

  constructor() {
    super('library-scene');
  }

  create(): void {
    window.__libraryIsoDebug = {
      sceneReady: true,
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

    this.createFurnitureTextures();
    this.drawWalls();
    this.drawFloor();
    this.placeFurnitureBlockers();
    this.drawDebugOverlay();
    this.drawFurniture();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer.worldX, pointer.worldY);
    });
    this.input.keyboard?.on('keydown-D', () => {
      this.debugOverlayVisible = !this.debugOverlayVisible;
      this.debugOverlay?.setVisible(this.debugOverlayVisible);
    });
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
  }

  private placeFurnitureBlockers(): void {
    if (!this.board) {
      return;
    }

    for (const tile of getBlockedTiles(ROOM_MAP)) {
      const screen = tileToScreen(tile, BOARD_ORIGIN);
      const blocker = this.add.zone(screen.x, screen.y, ISO_CELL.width, ISO_CELL.height);
      blocker.setVisible(false);
      this.board.addChess(blocker, tile.x, tile.y, `blocker-${tile.x}-${tile.y}`, false);
      const rexChess = (blocker as Phaser.GameObjects.Zone & { rexChess?: { setBlocker(value?: boolean): void } }).rexChess;
      rexChess?.setBlocker();
    }
  }

  private drawFurniture(): void {
    if (!this.board) {
      return;
    }

    for (const object of sortByIsoDepth(ROOM_MAP.furniture.map((item) => ({ ...item, tile: item.anchor, zBias: item.depthBias })))) {
      const screen = tileToScreen(object.anchor, BOARD_ORIGIN);
      const sprite = this.add.image(screen.x, screen.y + ISO_CELL.height / 2, textureKeyFor(object));
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(depthForTile(object.anchor, object.depthBias));
      sprite.setData('roomObjectId', object.id);
      sprite.setData('kind', object.kind);
      this.board.addChess(sprite, object.anchor.x, object.anchor.y, `visual-${object.id}`, false);
    }
  }

  private createFurnitureTextures(): void {
    this.createDeskTexture();
    this.createChairTexture();
    this.createLampTexture();
    this.createBookshelfTexture();
    this.createPlantTexture();
  }

  private createDeskTexture(): void {
    if (this.textures.exists('furniture-desk-long')) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x3f2b22, 1);
    graphics.fillRect(28, 42, 168, 26);
    graphics.fillStyle(0x7b5738, 1);
    graphics.fillTriangle(20, 42, 112, 10, 204, 42);
    graphics.fillStyle(0x936a42, 1);
    graphics.fillTriangle(20, 42, 204, 42, 112, 68);
    graphics.fillStyle(0x231814, 0.7);
    graphics.fillRect(44, 66, 12, 24);
    graphics.fillRect(170, 66, 12, 24);
    graphics.lineStyle(2, 0x221611, 0.7);
    graphics.strokeTriangle(20, 42, 112, 10, 204, 42);
    graphics.generateTexture('furniture-desk-long', 224, 96);
    graphics.destroy();
  }

  private createChairTexture(): void {
    if (this.textures.exists('furniture-chair')) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xd4b98a, 1);
    graphics.fillRect(18, 8, 28, 38);
    graphics.fillStyle(0xb9935e, 1);
    graphics.fillTriangle(12, 50, 32, 36, 52, 50);
    graphics.fillStyle(0xead4a5, 1);
    graphics.fillTriangle(12, 50, 52, 50, 32, 64);
    graphics.fillStyle(0x6b4a31, 1);
    graphics.fillRect(18, 62, 6, 20);
    graphics.fillRect(40, 62, 6, 20);
    graphics.lineStyle(2, 0x60462f, 0.75);
    graphics.strokeRect(18, 8, 28, 38);
    graphics.generateTexture('furniture-chair', 64, 88);
    graphics.destroy();
  }

  private createLampTexture(): void {
    if (this.textures.exists('furniture-desk-lamp')) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xb99749, 1);
    graphics.fillRect(17, 28, 4, 38);
    graphics.fillStyle(0xf2d46f, 1);
    graphics.fillTriangle(4, 30, 19, 4, 34, 30);
    graphics.fillStyle(0x72562a, 1);
    graphics.fillEllipse(19, 70, 24, 8);
    graphics.generateTexture('furniture-desk-lamp', 38, 78);
    graphics.destroy();
  }

  private createBookshelfTexture(): void {
    if (this.textures.exists('furniture-bookshelf')) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x5b3a28, 1);
    graphics.fillRect(12, 10, 72, 92);
    graphics.fillStyle(0x8f5d34, 1);
    graphics.fillRect(18, 18, 60, 10);
    graphics.fillRect(18, 48, 60, 10);
    graphics.fillRect(18, 78, 60, 10);
    for (let i = 0; i < 12; i += 1) {
      graphics.fillStyle([0x9db6b7, 0xc28d62, 0xdbc37a, 0x7fa574][i % 4], 1);
      graphics.fillRect(20 + (i % 6) * 9, 30 + Math.floor(i / 6) * 30, 6, 18);
    }
    graphics.generateTexture('furniture-bookshelf', 96, 112);
    graphics.destroy();
  }

  private createPlantTexture(): void {
    if (this.textures.exists('furniture-plant')) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x315a3f, 1);
    graphics.fillEllipse(28, 24, 40, 22);
    graphics.fillEllipse(18, 38, 32, 18);
    graphics.fillEllipse(38, 42, 34, 20);
    graphics.fillStyle(0x8d6240, 1);
    graphics.fillTriangle(14, 56, 42, 56, 34, 86);
    graphics.fillStyle(0x6f472f, 1);
    graphics.fillTriangle(14, 56, 34, 86, 22, 86);
    graphics.generateTexture('furniture-plant', 56, 90);
    graphics.destroy();
  }
}

function textureKeyFor(object: FurnitureObject): string {
  return `furniture-${object.kind}`;
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
