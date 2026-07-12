import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Metro shared workspace configuration', () => {
  it('allows React Native bundling to resolve the shared social modules used by Study', () => {
    const metroSource = fs.readFileSync(path.join(__dirname, '../metro.config.js'), 'utf8');

    expect(metroSource).toContain('watchFolders');
    expect(metroSource).toContain('sharedPath');
    expect(metroSource).toContain('shared');
  });
});
