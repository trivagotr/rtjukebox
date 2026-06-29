import Phaser from 'phaser';
import { DEBUG_TINTS, ROOM_MAP, getAllTiles, getTileKind, isInRoom, sortByIsoDepth } from '../model/roomMap';
import { ISO_CELL, depthForTile, type ScreenXY, type TileXY, tileToScreen } from '../model/iso';

type RexBoardPlugin = {
  add: {
    board(config: unknown): unknown;
  };
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
  private board?: {
    worldXYToTileXY(x: number, y: number): TileXY;
  };
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
    }) as typeof this.board;

    this.drawWalls();
    this.drawFloor();
    this.drawDebugOverlay();
    this.drawDepthProofSprites();
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

  private drawDepthProofSprites(): void {
    const proofSprites = sortByIsoDepth([
      { id: 'far', tile: { x: 6, y: 4 }, zBias: 80, color: 0xd7b46a },
      { id: 'near', tile: { x: 6, y: 5 }, zBias: 80, color: 0x79b7c5 },
    ]);

    for (const proof of proofSprites) {
      const screen = tileToScreen(proof.tile, BOARD_ORIGIN);
      const marker = this.add.rectangle(screen.x, screen.y + 8, 30, 66, proof.color, 1);
      marker.setOrigin(0.5, 1);
      marker.setStrokeStyle(2, 0x10202a, 0.65);
      marker.setDepth(depthForTile(proof.tile, proof.zBias));
    }
  }
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
