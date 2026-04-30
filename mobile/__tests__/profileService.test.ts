import {beforeEach, describe, expect, it, jest} from '@jest/globals';

import api from '../src/services/api';
import {
  fetchProfileCustomization,
  updateProfileCustomization,
  updateProfileFavorites,
} from '../src/services/profileService';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

describe('profileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads profile customization with badges', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    getMock.mockResolvedValueOnce({
      data: {
        data: {
          profile: {favorite_song_title: 'Song'},
          badges: [{id: 'badge-1', title: 'Founder'}],
        },
      },
    });

    await expect(fetchProfileCustomization()).resolves.toEqual({
      profile: {favorite_song_title: 'Song'},
      badges: [{id: 'badge-1', title: 'Founder'}],
    });
    expect(getMock).toHaveBeenCalledWith('/profile/me');
  });

  it('updates profile customization and favorite fields through profile endpoints', async () => {
    const putMock = api.put as jest.MockedFunction<(path: string, body: any) => Promise<any>>;
    putMock
      .mockResolvedValueOnce({data: {data: {profile: {profile_headline: 'Radio lover'}}}})
      .mockResolvedValueOnce({data: {data: {profile: {favorite_artist_name: 'Artist'}}}});

    await updateProfileCustomization({profile_headline: 'Radio lover'});
    await updateProfileFavorites({favorite_artist_name: 'Artist'});

    expect(putMock).toHaveBeenNthCalledWith(1, '/profile/me', {profile_headline: 'Radio lover'});
    expect(putMock).toHaveBeenNthCalledWith(2, '/profile/favorites', {favorite_artist_name: 'Artist'});
  });
});
