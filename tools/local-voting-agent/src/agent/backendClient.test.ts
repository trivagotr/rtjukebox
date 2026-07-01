import { describe, expect, it } from 'vitest';
import { buildAgentHeaders, buildBackendRoundPayload } from './backendClient';
import type { VotingRound } from './types';

const round: VotingRound = {
  id: 'round-1',
  status: 'resolved',
  openedAt: '2026-07-01T10:00:00.000Z',
  lockedAt: '2026-07-01T10:00:50.000Z',
  resolvedAt: '2026-07-01T10:01:00.000Z',
  winnerCandidateId: 'candidate-song-1',
  resolutionMode: 'user-vote',
  votes: [
    {
      userId: 'user-1',
      candidateId: 'candidate-song-1',
      acceptedAt: '2026-07-01T10:00:10.000Z',
      rewardKey: 'round-1:user-1:voting_reward',
    },
  ],
  candidates: [
    {
      id: 'candidate-song-1',
      songId: 'song-1',
      title: 'Winner',
      artist: 'Artist',
      filePath: 'C:/Music/winner.mp3',
      albumArtUrl: '/album-art/song-1',
      votes: 1,
    },
  ],
};

describe('backend client helpers', () => {
  it('builds device-scoped auth headers for the backend agent client', () => {
    expect(
      buildAgentHeaders({
        apiBaseUrl: 'https://rt.example.test',
        agentToken: 'secret-token',
        deviceId: 'studio-pc',
        enabled: true,
      }),
    ).toEqual({
      Authorization: 'Bearer secret-token',
      'Content-Type': 'application/json',
      'X-RT-Device-Id': 'studio-pc',
    });
  });

  it('builds a public-safe round payload without local filesystem paths', () => {
    const payload = buildBackendRoundPayload(round);

    expect(JSON.stringify(payload)).not.toContain('C:/Music');
    expect(payload.candidates).toEqual([
      {
        id: 'candidate-song-1',
        songId: 'song-1',
        title: 'Winner',
        artist: 'Artist',
        albumArtUrl: '/album-art/song-1',
        votes: 1,
      },
    ]);
    expect(payload.winnerCandidateId).toBe('candidate-song-1');
  });
});
