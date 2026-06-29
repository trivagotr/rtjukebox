export type TileXY = {
  x: number;
  y: number;
};

export type ScreenXY = {
  x: number;
  y: number;
};

export const ISO_CELL = {
  width: 64,
  height: 32,
} as const;

export const DEFAULT_ORIGIN: ScreenXY = {
  x: 0,
  y: 0,
};

export function tileToScreen(tile: TileXY, origin: ScreenXY = DEFAULT_ORIGIN): ScreenXY {
  return {
    x: origin.x + (tile.x - tile.y) * (ISO_CELL.width / 2),
    y: origin.y + (tile.x + tile.y) * (ISO_CELL.height / 2),
  };
}

export function screenToTile(point: ScreenXY, origin: ScreenXY = DEFAULT_ORIGIN): TileXY {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const tileDeltaX = dx / (ISO_CELL.width / 2);
  const tileDeltaY = dy / (ISO_CELL.height / 2);

  return {
    x: Math.round((tileDeltaX + tileDeltaY) / 2),
    y: Math.round((tileDeltaY - tileDeltaX) / 2),
  };
}

export function depthForTile(tile: TileXY, zBias = 0): number {
  return (tile.x + tile.y) * 1000 + zBias;
}
