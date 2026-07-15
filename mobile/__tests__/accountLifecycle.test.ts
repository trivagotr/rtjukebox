import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import {BASE_API} from '../src/services/config';
import {
  buildDeleteAccountPayload,
  buildLogoutPayload,
  deleteAccountAndClearSession,
  logoutAccountSession,
} from '../src/services/accountLifecycleService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    delete: jest.fn(),
    post: jest.fn(),
    defaults: {
      headers: {
        common: {},
      },
    },
  },
}));

describe('mobile account lifecycle service', () => {
  const getItemMock = AsyncStorage.getItem as jest.MockedFunction<
    typeof AsyncStorage.getItem
  >;
  const multiRemoveMock = AsyncStorage.multiRemove as jest.MockedFunction<
    typeof AsyncStorage.multiRemove
  >;
  const postMock = axios.post as jest.MockedFunction<typeof axios.post>;
  const deleteMock = axios.delete as jest.MockedFunction<typeof axios.delete>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete axios.defaults.headers.common.Authorization;
  });

  it('builds the backend logout and account-deletion contracts exactly', () => {
    expect(buildLogoutPayload(' refresh-token ')).toEqual({
      refresh_token: 'refresh-token',
    });
    expect(buildDeleteAccountPayload(' secret ')).toEqual({
      confirmation: 'DELETE',
      password: ' secret ',
    });
    expect(buildDeleteAccountPayload()).toEqual({confirmation: 'DELETE'});
  });

  it('revokes the current refresh-token session before clearing local auth', async () => {
    getItemMock.mockResolvedValueOnce('refresh-token');
    postMock.mockResolvedValueOnce({data: {data: {revoked: true}}});
    axios.defaults.headers.common.Authorization = 'Bearer access-token';

    await logoutAccountSession();

    expect(postMock).toHaveBeenCalledWith(`${BASE_API}/auth/logout`, {
      refresh_token: 'refresh-token',
    });
    expect(multiRemoveMock).toHaveBeenCalledWith([
      'access_token',
      'refresh_token',
    ]);
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
  });

  it('still clears local auth when the server logout request fails', async () => {
    getItemMock.mockResolvedValueOnce('refresh-token');
    postMock.mockRejectedValueOnce(new Error('offline'));

    await expect(logoutAccountSession()).rejects.toThrow('offline');

    expect(multiRemoveMock).toHaveBeenCalledWith([
      'access_token',
      'refresh_token',
    ]);
  });

  it('deletes the account through the authenticated endpoint and clears auth on success', async () => {
    deleteMock.mockResolvedValueOnce({data: {data: {deleted: true}}});

    await deleteAccountAndClearSession('correct-password');

    expect(deleteMock).toHaveBeenCalledWith(`${BASE_API}/auth/account`, {
      data: {
        confirmation: 'DELETE',
        password: 'correct-password',
      },
    });
    expect(multiRemoveMock).toHaveBeenCalledWith([
      'access_token',
      'refresh_token',
    ]);
  });

  it('keeps local auth when account deletion is rejected by the server', async () => {
    deleteMock.mockRejectedValueOnce(new Error('wrong password'));

    await expect(deleteAccountAndClearSession('wrong-password')).rejects.toThrow(
      'wrong password',
    );

    expect(multiRemoveMock).not.toHaveBeenCalled();
  });
});
