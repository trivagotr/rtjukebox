import { describe, expect, it } from 'vitest';
import { getWinnerLine } from './panelCopy';
import type { VotingRound } from '../agent/types';

const baseRound: VotingRound = {
  id: 'round-1',
  status: 'resolved',
  openedAt: '2026-07-01T10:00:00.000Z',
  lockedAt: null,
  resolvedAt: '2026-07-01T10:01:00.000Z',
  candidates: [
    {
      id: 'candidate-song-1',
      songId: 'song-1',
      title: 'One',
      artist: 'Artist',
      filePath: 'C:/Music/one.mp3',
      albumArtUrl: null,
      votes: 0,
    },
  ],
  votes: [],
  winnerCandidateId: 'candidate-song-1',
  resolutionMode: 'no-vote-fallback',
};

describe('panel copy', () => {
  it('does not mention random fallback in the winner line', () => {
    expect(getWinnerLine(baseRound, null)).toBe('Winner: One');
  });

  it('includes voter attribution when provided', () => {
    expect(getWinnerLine({ ...baseRound, resolutionMode: 'user-vote' }, 'Selected by user-1')).toBe(
      'Winner: One · Selected by user-1',
    );
  });
});
