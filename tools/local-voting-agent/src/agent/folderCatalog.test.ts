import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanFolderCatalog, scanJingleCatalog } from './folderCatalog';

describe('folder catalog scanner', () => {
  it('builds a song catalog from a plain music folder and discovers nearby album art', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiotedu-folder-catalog-'));
    const albumDir = join(root, 'Akgul Artist');
    mkdirSync(albumDir);
    const songPath = join(albumDir, 'Evening Show.mp3');
    const coverPath = join(albumDir, 'cover.jpg');
    writeFileSync(songPath, 'fake audio');
    writeFileSync(coverPath, 'fake jpg');
    writeFileSync(join(albumDir, 'notes.txt'), 'not audio');

    const songs = scanFolderCatalog([root]);

    expect(songs).toEqual([
      {
        id: expect.stringMatching(/^song-[a-f0-9]{12}$/),
        title: 'Evening Show',
        artist: 'Akgul Artist',
        filePath: songPath,
        albumArtPath: coverPath,
        enabled: true,
      },
    ]);
  });

  it('keeps jingles in a separate catalog so they cannot become voting candidates', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiotedu-jingles-'));
    const jinglePath = join(root, 'Station ID.wav');
    writeFileSync(jinglePath, 'fake audio');

    const jingles = scanJingleCatalog([root]);

    expect(jingles).toEqual([
      {
        id: expect.stringMatching(/^jingle-[a-f0-9]{12}$/),
        title: 'Station ID',
        filePath: jinglePath,
        enabled: true,
      },
    ]);
  });
});
