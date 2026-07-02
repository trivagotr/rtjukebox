import {describe, expect, it, jest} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

import {API_ORIGIN, BASE_API} from '../src/services/api';
import {
  NEXT_SONG_VOTE_ACTIVE_ROUND_PATH,
  NEXT_SONG_VOTE_CLIENT_ID_KEY,
  buildNextSongVoteBody,
  buildNextSongVotePath,
  buildNextSongVoteRequestConfig,
  formatNextSongVoteRemainingTime,
  getCandidateArtworkUrl,
  getNextSongVoteErrorCopy,
  getNextSongVoteStatusCopy,
  getWinningCandidate,
  normalizeNextSongVoteRound,
} from '../src/services/nextSongVote';

describe('next-song voting mobile contract', () => {
  it('uses the separate next-song-voting namespace', () => {
    expect(BASE_API).toBe('http://10.98.98.66:8090/api/v1');
    expect(API_ORIGIN).toBe('http://10.98.98.66:8090');
    expect(NEXT_SONG_VOTE_ACTIVE_ROUND_PATH).toBe(
      '/next-song-voting/rounds/active',
    );
    expect(buildNextSongVotePath('round-1')).toBe(
      '/next-song-voting/rounds/round-1/votes',
    );
  });

  it('normalizes empty, active, locked, resolved, and cancelled backend response shapes', () => {
    const emptyRound = normalizeNextSongVoteRound({
      success: true,
      data: null,
      message: 'No active next song voting round',
    });

    const activeRound = normalizeNextSongVoteRound({
      data: {
        round: {
          id: 'round-1',
          status: 'active',
          prompt: 'Sıradaki şarkı için oy ver',
          stationName: 'RadioTEDU',
          streamKey: 'ai',
          icecastMount: '/ai',
          startedAt: '2026-07-02T09:00:00.000Z',
          expiresAt: '2026-07-02T09:01:15.000Z',
          winningCandidateId: null,
          voteCount: 4,
          userVoteCandidateId: 'candidate-2',
          candidates: [
            {
              id: 'candidate-1',
              externalId: 'local-song-1',
              title: 'Song Title',
              artist: 'Artist',
              artworkUrl: null,
              voteCount: 1,
            },
            {
              id: 'candidate-2',
              externalId: 'local-song-2',
              title: 'Winner So Far',
              artist: 'Artist 2',
              artworkUrl: '/public/art/local-song-2.jpg',
              voteScore: 12,
              voteCount: 3,
              position: 2,
            },
          ],
        },
      },
    });

    const lockedRound = normalizeNextSongVoteRound({
      data: {
        id: 'round-2',
        status: 'locked',
        candidates: [],
      },
    });

    const resolvedRound = normalizeNextSongVoteRound({
      round: {
        id: 'round-3',
        status: 'resolved',
        winningCandidateId: 'candidate-2',
        candidates: activeRound?.candidates,
      },
    });

    const cancelledRound = normalizeNextSongVoteRound({
      data: {
        id: 'round-4',
        status: 'cancelled',
        candidates: [],
      },
    });

    expect(emptyRound).toBeNull();
    expect(activeRound).toMatchObject({
      id: 'round-1',
      status: 'active',
      prompt: 'Sıradaki şarkı için oy ver',
      stationName: 'RadioTEDU',
      streamKey: 'ai',
      icecastMount: '/ai',
      startedAt: '2026-07-02T09:00:00.000Z',
      expiresAt: '2026-07-02T09:01:15.000Z',
      voteCount: 4,
      userVoteCandidateId: 'candidate-2',
    });
    expect(activeRound?.candidates[1]).toEqual({
      id: 'candidate-2',
      externalId: 'local-song-2',
      title: 'Winner So Far',
      artist: 'Artist 2',
      artworkUrl: '/public/art/local-song-2.jpg',
      voteScore: 12,
      voteCount: 3,
      position: 2,
    });
    expect(lockedRound?.status).toBe('locked');
    expect(cancelledRound?.status).toBe('cancelled');
    expect(getWinningCandidate(resolvedRound)?.id).toBe('candidate-2');
  });

  it('persists x-client-id and keeps vote body limited to backend candidate id', async () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        records.set(key, value);
      },
    };

    const requestConfig = await buildNextSongVoteRequestConfig(
      storage,
      () => 0.123456789,
    );
    const repeatedConfig = await buildNextSongVoteRequestConfig(
      storage,
      () => 0.987654321,
    );
    const body = await buildNextSongVoteBody('candidate-1');

    expect(requestConfig).toEqual({
      headers: {'x-client-id': 'nsv-4fzzzxjylrx'},
    });
    expect(repeatedConfig).toEqual(requestConfig);
    expect(body).toEqual({
      candidateId: 'candidate-1',
    });
    expect(records.get(NEXT_SONG_VOTE_CLIENT_ID_KEY)).toBe('nsv-4fzzzxjylrx');
  });

  it('accepts public artwork URLs and rejects local file paths', () => {
    expect(
      getCandidateArtworkUrl({artworkUrl: 'https://cdn.example.test/art.jpg'}),
    ).toBe('https://cdn.example.test/art.jpg');
    expect(
      getCandidateArtworkUrl(
        {artworkUrl: '/public/art.jpg'},
        'https://rt.example.test',
      ),
    ).toBe('https://rt.example.test/public/art.jpg');
    expect(
      getCandidateArtworkUrl({artworkUrl: 'C:/Music/cover.jpg'}),
    ).toBeNull();
    expect(
      getCandidateArtworkUrl({artworkUrl: 'file:///C:/Music/cover.jpg'}),
    ).toBeNull();
    expect(
      getCandidateArtworkUrl({artworkUrl: '\\\\studio-pc\\Music\\cover.jpg'}),
    ).toBeNull();
  });

  it('returns stable UI copy for empty, active, locked, resolved, and cancelled rounds', () => {
    const activeRound = normalizeNextSongVoteRound({
      data: {
        round: {
          id: 'round-1',
          status: 'active',
          prompt: 'Sıradaki şarkı için oy ver',
          expiresAt: '2026-07-02T09:01:15.000Z',
          candidates: [],
        },
      },
    });

    expect(getNextSongVoteStatusCopy(null)).toBe('Şu an aktif oylama yok');
    expect(getNextSongVoteStatusCopy(activeRound)).toBe(
      'Sıradaki şarkı için oy ver',
    );
    expect(getNextSongVoteStatusCopy({...activeRound!, status: 'locked'})).toBe(
      'Oylar kilitlendi',
    );
    expect(
      getNextSongVoteStatusCopy({...activeRound!, status: 'resolved'}),
    ).toBe('Sıradaki şarkı seçildi');
    expect(
      getNextSongVoteStatusCopy({...activeRound!, status: 'cancelled'}),
    ).toBe('Şu an aktif oylama yok');
  });

  it('formats active round remaining time from expiresAt', () => {
    const activeRound = normalizeNextSongVoteRound({
      data: {
        id: 'round-1',
        status: 'active',
        expiresAt: '2026-07-02T09:01:15.000Z',
        candidates: [],
      },
    });

    expect(
      formatNextSongVoteRemainingTime(
        activeRound,
        new Date('2026-07-02T09:00:00.000Z').getTime(),
      ),
    ).toBe('1:15');
    expect(
      formatNextSongVoteRemainingTime(
        activeRound,
        new Date('2026-07-02T09:02:00.000Z').getTime(),
      ),
    ).toBe('0:00');
    expect(
      formatNextSongVoteRemainingTime({
        ...activeRound!,
        status: 'locked',
      }),
    ).toBeNull();
  });

  it('maps closed voting errors to user-facing copy', () => {
    expect(getNextSongVoteErrorCopy({response: {status: 409}})).toBe(
      'Oylama kapandı.',
    );
    expect(
      getNextSongVoteErrorCopy({response: {data: {error: 'Oy gönderilemedi'}}}),
    ).toBe('Oy gönderilemedi');
  });
});
