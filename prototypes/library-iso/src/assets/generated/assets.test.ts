import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const assetDir = join(process.cwd(), 'src/assets/generated');

const requiredPngs = [
  'desk-long.png',
  'desk-long-occluder.png',
  'chair.png',
  'desk-lamp.png',
  'bookshelf.png',
  'plant.png',
  'sofa-green.png',
  'window.png',
  'wall-left.png',
  'stair.png',
  'side-table.png',
  'avatar-north-idle.png',
  'avatar-north-east-walk.png',
  'avatar-south-sit.png',
  'avatar-west-idle.png',
];

describe('generated transparent sprite assets', () => {
  it('keeps required Habbo-style cutouts as RGBA PNG files', () => {
    for (const filename of requiredPngs) {
      expect(pngColorType(filename)).toBe(6);
    }
  });
});

function pngColorType(filename: string): number {
  const bytes = readFileSync(join(assetDir, filename));
  const signature = bytes.subarray(0, 8).toString('hex');
  expect(signature).toBe('89504e470d0a1a0a');

  return bytes[25];
}
