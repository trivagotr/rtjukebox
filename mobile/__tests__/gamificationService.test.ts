import {beforeEach, describe, expect, it, jest} from '@jest/globals';

import api from '../src/services/api';
import {
  claimQrReward,
  fetchEvents,
  fetchGames,
  fetchGamificationHome,
  fetchMarketItems,
  redeemMarketItem,
  sendListeningHeartbeat,
  submitGameScore,
} from '../src/services/gamificationService';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('gamificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the consolidated gamification home payload', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    getMock.mockResolvedValueOnce({
      data: {
        data: {
          points: {lifetime_points: 12, spendable_points: 8},
          events: [{id: 'event-1', title: 'Launch'}],
          games: [{id: 'game-1', title: 'Trivia'}],
          market: [{id: 'item-1', title: 'Sticker'}],
        },
      },
    });

    await expect(fetchGamificationHome()).resolves.toEqual({
      points: {lifetime_points: 12, spendable_points: 8},
      events: [{id: 'event-1', title: 'Launch'}],
      games: [{id: 'game-1', title: 'Trivia'}],
      market: [{id: 'item-1', title: 'Sticker'}],
    });
    expect(getMock).toHaveBeenCalledWith('/gamification/home');
  });

  it('uses dedicated endpoints for events, games, market and rewards', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    getMock
      .mockResolvedValueOnce({data: {data: {events: [{id: 'event-1'}]}}})
      .mockResolvedValueOnce({data: {data: {games: [{id: 'game-1'}]}}})
      .mockResolvedValueOnce({data: {data: {items: [{id: 'item-1'}]}}});
    postMock
      .mockResolvedValueOnce({data: {data: {redemption: {id: 'redeem-1'}}}})
      .mockResolvedValueOnce({data: {data: {points_awarded: 10}}})
      .mockResolvedValueOnce({data: {data: {points_awarded: 5}}})
      .mockResolvedValueOnce({data: {data: {points_awarded: 1}}});

    await expect(fetchEvents()).resolves.toEqual([{id: 'event-1'}]);
    await expect(fetchGames()).resolves.toEqual([{id: 'game-1'}]);
    await expect(fetchMarketItems()).resolves.toEqual([{id: 'item-1'}]);
    await redeemMarketItem('item-1');
    await submitGameScore('game-1', 250);
    await claimQrReward('QR-1');
    await sendListeningHeartbeat({content_type: 'radio', listened_seconds: 300});

    expect(postMock).toHaveBeenNthCalledWith(1, '/gamification/market/item-1/redeem');
    expect(postMock).toHaveBeenNthCalledWith(2, '/gamification/games/game-1/score', {score: 250});
    expect(postMock).toHaveBeenNthCalledWith(3, '/gamification/events/qr/claim', {code: 'QR-1'});
    expect(postMock).toHaveBeenNthCalledWith(4, '/gamification/listening/heartbeat', {
      content_type: 'radio',
      listened_seconds: 300,
    });
  });
});
