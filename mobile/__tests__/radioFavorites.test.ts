import {describe, expect, it, jest} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import {
  buildFavoriteChannelOrder,
  toggleFavoriteChannelId,
} from '../src/services/radioFavorites';

describe('radioFavorites helpers', () => {
  it('toggles favorite ids without duplicating channels', () => {
    expect(toggleFavoriteChannelId([], 'main')).toEqual(['main']);
    expect(toggleFavoriteChannelId(['main'], 'jazz')).toEqual(['main', 'jazz']);
    expect(toggleFavoriteChannelId(['main', 'jazz'], 'main')).toEqual(['jazz']);
  });

  it('orders favorites first while keeping the full channel catalog available', () => {
    const channels = [
      {id: 'main', name: 'Main'},
      {id: 'jazz', name: 'Jazz'},
      {id: 'lofi', name: 'Lo-Fi'},
    ];

    expect(buildFavoriteChannelOrder(channels, ['lofi', 'missing'])).toEqual({
      favorites: [{id: 'lofi', name: 'Lo-Fi'}],
      remaining: [
        {id: 'main', name: 'Main'},
        {id: 'jazz', name: 'Jazz'},
      ],
    });
  });
});
