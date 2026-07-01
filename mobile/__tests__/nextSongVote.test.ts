import { describe, expect, it } from '@jest/globals';
import {
  NEXT_SONG_VOTE_ACTIVE_ROUND_PATH,
  buildNextSongVotePath,
  buildNextSongVotePayload,
  getCandidateCoverUrl,
  getNextSongVoteStatusCopy,
  normalizeNextSongVoteRound,
} from '../src/services/nextSongVote';

describe('mobile next-song vote contract', () => {
  it('uses next-song voting endpoints instead of Jukebox queue endpoints', () => {
    expect(NEXT_SONG_VOTE_ACTIVE_ROUND_PATH).toBe('/next-song-voting/rounds/active');
    expect(buildNextSongVotePath('round-1')).toBe('/next-song-voting/rounds/round-1/votes');
  });

  it('normalizes an active round payload from the backend envelope', () => {
    const round = normalizeNextSongVoteRound({
      data: {
        round: {
          id: 'round-1',
          status: 'open',
          candidates: [
            {
              id: 'candidate-1',
              songId: 'song-1',
              title: 'Track',
              artist: 'Artist',
              albumArtUrl: '/album-art/song-1',
              votes: 2,
            },
          ],
          userVoteCandidateId: 'candidate-1',
          lockAt: '2026-07-01T10:00:50.000Z',
          resolveAt: '2026-07-01T10:01:00.000Z',
        },
      },
    });

    expect(round?.candidates[0].title).toBe('Track');
    expect(round?.userVoteCandidateId).toBe('candidate-1');
    expect(round?.lockAt).toBe('2026-07-01T10:00:50.000Z');
  });

  it('builds vote payloads with the selected candidate and device id', () => {
    expect(buildNextSongVotePayload('candidate-1', 'device-1')).toEqual({
      candidateId: 'candidate-1',
      candidate_id: 'candidate-1',
      device_id: 'device-1',
    });
  });

  it('resolves relative album art URLs against the storage origin', () => {
    expect(getCandidateCoverUrl({ albumArtUrl: '/album-art/song-1' }, 'https://rt.example.test')).toBe(
      'https://rt.example.test/album-art/song-1'
    );
  });

  it('does not expose random fallback copy for no-vote resolutions', () => {
    const copy = getNextSongVoteStatusCopy({
      id: 'round-1',
      status: 'resolved',
      candidates: [],
      userVoteCandidateId: null,
      winnerCandidateId: 'candidate-1',
      resolutionMode: 'no-vote-fallback',
    });

    expect(copy).toBe('Sıradaki şarkı hazır.');
    expect(copy).not.toMatch(/random|rastgele/i);
  });
});
