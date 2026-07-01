import { describe, expect, it } from 'vitest';
import { selectRandomCandidates } from './candidateSelection';
import type { CatalogSong } from './types';

const songs: CatalogSong[] = [
  { id: 'song-1', title: 'One', artist: 'Artist', filePath: 'C:/Music/one.mp3' },
  { id: 'song-2', title: 'Two', artist: 'Artist', filePath: 'C:/Music/two.mp3' },
  { id: 'song-3', title: 'Three', artist: 'Artist', filePath: 'C:/Music/three.mp3' },
];

describe('candidate selection', () => {
  it('selects deterministic unique candidates with an injected rng', () => {
    const candidates = selectRandomCandidates(songs, 2, () => 0);

    expect(candidates.map((candidate) => candidate.songId)).toEqual(['song-1', 'song-2']);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      id: 'candidate-song-1',
      title: 'One',
      artist: 'Artist',
      votes: 0,
    });
  });

  it('uses album art paths as local file URLs when available', () => {
    const candidates = selectRandomCandidates(
      [{ ...songs[0], albumArtPath: 'C:/Music/art/one.jpg' }, songs[1]],
      2,
      () => 0,
    );

    expect(candidates[0].albumArtUrl).toBe('/album-art/song-1');
    expect(candidates[1].albumArtUrl).toBeNull();
  });
});
