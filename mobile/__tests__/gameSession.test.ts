import {describe, expect, it, jest} from '@jest/globals';

jest.mock('../src/services/gamificationService', () => ({
  submitGameScore: jest.fn(),
}));

import {
  buildGameScorePayload,
  getGameResultMessage,
} from '../src/screens/games/gameSession';

describe('gameSession helpers', () => {
  it('builds the required mobile game score payload with sanitized values', () => {
    expect(
      buildGameScorePayload({
        score: 42.9,
        clientRoundId: 'round-1',
        startedAt: 1000,
        now: 5600,
      }),
    ).toEqual({
      score: 42,
      client_round_id: 'round-1',
      play_duration_ms: 4600,
      submission_source: 'mobile_game',
    });
  });

  it('formats awarded XP result messages without hiding zero awards', () => {
    expect(getGameResultMessage(120, 8)).toBe('120 skor · +8 XP');
    expect(getGameResultMessage(0, 0)).toBe('0 skor · +0 XP');
  });
});
