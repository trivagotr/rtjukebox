import type { CandidateCount, CatalogSong, VotingCandidate } from './types';

function takeRandomIndex(length: number, rng: () => number): number {
  if (length <= 1) {
    return 0;
  }

  return Math.min(length - 1, Math.floor(rng() * length));
}

function toCandidate(song: CatalogSong): VotingCandidate {
  return {
    id: `candidate-${song.id}`,
    songId: song.id,
    title: song.title,
    artist: song.artist,
    filePath: song.filePath,
    albumArtUrl: song.albumArtPath ? `/album-art/${encodeURIComponent(song.id)}` : null,
    votes: 0,
  };
}

export function selectRandomCandidates(
  songs: CatalogSong[],
  count: CandidateCount,
  rng: () => number = Math.random,
): VotingCandidate[] {
  const pool = [...songs];
  const selected: CatalogSong[] = [];
  const targetCount = Math.min(count, pool.length);

  while (selected.length < targetCount) {
    const index = takeRandomIndex(pool.length, rng);
    const [song] = pool.splice(index, 1);
    if (song) {
      selected.push(song);
    }
  }

  return selected.map(toCandidate);
}
