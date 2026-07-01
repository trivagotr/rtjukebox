import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSongCatalog } from './songCatalog';

describe('song catalog', () => {
  it('loads enabled songs whose files live inside music roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiotedu-catalog-'));
    const musicRoot = join(root, 'music');
    mkdirSync(musicRoot);
    const catalogPath = join(root, 'songs.json');
    const insidePath = join(musicRoot, 'song.mp3');
    const outsidePath = join(root, 'outside.mp3');

    writeFileSync(
      catalogPath,
      JSON.stringify([
        { id: 'song-1', title: 'One', artist: 'Artist', filePath: insidePath, enabled: true },
        { id: 'song-2', title: 'Two', artist: 'Artist', filePath: outsidePath, enabled: true },
        { id: 'song-3', title: 'Three', artist: 'Artist', filePath: insidePath, enabled: false },
      ]),
      'utf8',
    );

    expect(loadSongCatalog(catalogPath, [musicRoot])).toEqual([
      { id: 'song-1', title: 'One', artist: 'Artist', filePath: insidePath, enabled: true },
    ]);
  });
});
