import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const ICON_FILES = ['ic_launcher.png', 'ic_launcher_round.png'];

function assertPng(file: string) {
  expect(fs.existsSync(file)).toBe(true);
  const header = fs.readFileSync(file).subarray(0, 8);
  expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

describe('Android launcher icon assets', () => {
  it('ships literal RadioTEDU signal launcher icons for light and dark system settings', () => {
    for (const density of DENSITIES) {
      for (const iconFile of ICON_FILES) {
        const light = path.join(RES, `mipmap-${density}`, iconFile);
        const dark = path.join(RES, `mipmap-night-${density}`, iconFile);

        assertPng(light);
        assertPng(dark);
        expect(fs.readFileSync(light).equals(fs.readFileSync(dark))).toBe(false);
      }
    }
  });
});
