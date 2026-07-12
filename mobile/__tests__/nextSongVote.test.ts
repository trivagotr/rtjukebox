import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import api from '../src/services/api';
import { NEXT_SONG_VOTE_API } from '../src/services/config';
import {
  NEXT_SONG_VOTE_ACTIVE_ROUND_PATH,
  NEXT_SONG_VOTE_CLIENT_ID_KEY,
  buildNextSongVoteRequestConfig,
  buildNextSongVotePath,
  buildNextSongVotePayload,
  fetchActiveNextSongVoteRound,
  getCandidateCoverUrl,
  getNextSongVoteStatusCopy,
  normalizeNextSongVoteRound,
  submitNextSongVote,
} from '../src/services/nextSongVote';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('mobile next-song vote contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('fetches and submits next-song votes through the backend API client', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string, config?: any) => Promise<any>>;
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any, config?: any) => Promise<any>>;
    const roundEnvelope = {
      data: {
        round: {
          id: 'round-1',
          status: 'open',
          candidates: [{id: 'candidate-1', title: 'Track', artist: 'Artist', votes: 0}],
        },
      },
    };
    getMock.mockResolvedValueOnce({data: roundEnvelope});
    postMock.mockResolvedValueOnce({data: roundEnvelope});

    await expect(fetchActiveNextSongVoteRound('device-1')).resolves.toEqual(expect.objectContaining({id: 'round-1'}));
    await expect(submitNextSongVote('round-1', 'candidate-1', 'device-1')).resolves.toEqual(expect.objectContaining({id: 'round-1'}));

    expect(getMock).toHaveBeenCalledWith(NEXT_SONG_VOTE_ACTIVE_ROUND_PATH, expect.objectContaining({
      params: {device_id: 'device-1'},
      baseURL: NEXT_SONG_VOTE_API,
    }));
    expect(postMock).toHaveBeenCalledWith(
      buildNextSongVotePath('round-1'),
      buildNextSongVotePayload('candidate-1', 'device-1'),
      expect.objectContaining({baseURL: NEXT_SONG_VOTE_API}),
    );
  });


  it('uses a persistent x-client-id fallback only when the user is not logged in', async () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        records.set(key, value);
      },
    };

    const anonymousConfig = await buildNextSongVoteRequestConfig(storage, () => 0.123456789);
    const repeatedConfig = await buildNextSongVoteRequestConfig(storage, () => 0.987654321);

    expect(anonymousConfig).toEqual({ headers: { 'x-client-id': 'nsv-4fzzzxjylrx' } });
    expect(repeatedConfig).toEqual(anonymousConfig);
    expect(records.get(NEXT_SONG_VOTE_CLIENT_ID_KEY)).toBe('nsv-4fzzzxjylrx');

    records.set('access_token', 'jwt-token');

    await expect(buildNextSongVoteRequestConfig(storage, () => 0.1)).resolves.toEqual({});
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
