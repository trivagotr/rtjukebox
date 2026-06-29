import Phaser from 'phaser';
import { ISO_CELL, type TileXY, tileToScreen } from '../model/iso';

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

const BOARD_SIZE = {
  width: 14,
  height: 12,
};

const BOARD_ORIGIN = {
  x: 195,
  y: 120,
};

export class LibraryScene extends Phaser.Scene {
  private board?: {
    worldXYToTileXY(x: number, y: number): TileXY;
  };

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
      width: BOARD_SIZE.width,
      height: BOARD_SIZE.height,
    }) as typeof this.board;

    this.drawBlankBoard();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer.worldX, pointer.worldY);
    });
  }

  private handlePointerDown(worldX: number, worldY: number): void {
    if (!this.board) {
      return;
    }

    const tile = this.board.worldXYToTileXY(worldX, worldY);
    if (!isInBoard(tile)) {
      return;
    }

    window.__libraryIsoDebug = {
      ...window.__libraryIsoDebug,
      lastClickedTile: tile,
    };
    console.log(`tile ${tile.x},${tile.y}`);
  }

  private drawBlankBoard(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x59758a, 0.65);
    graphics.fillStyle(0x223848, 0.55);

    for (let y = 0; y < BOARD_SIZE.height; y += 1) {
      for (let x = 0; x < BOARD_SIZE.width; x += 1) {
        drawIsoDiamond(graphics, tileToScreen({ x, y }, BOARD_ORIGIN));
      }
    }
  }
}

function isInBoard(tile: TileXY): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < BOARD_SIZE.width && tile.y < BOARD_SIZE.height;
}

function drawIsoDiamond(graphics: Phaser.GameObjects.Graphics, center: TileXY): void {
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
