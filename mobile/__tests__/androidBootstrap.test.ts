import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Android bootstrap', () => {
  it('initializes SoLoader with the React Native merged so mapping', () => {
    const mainApplicationPath = path.join(
      __dirname,
      '..',
      'android',
      'app',
      'src',
      'main',
      'java',
      'com',
      'com.radiotedumobile',
      'MainApplication.kt'
    );

    const source = fs.readFileSync(mainApplicationPath, 'utf8');

    expect(source).toContain('OpenSourceMergedSoMapping');
    expect(source).toContain('SoLoader.init(this, OpenSourceMergedSoMapping)');
    expect(source).not.toContain('SoLoader.init(this, false)');
  });
});
