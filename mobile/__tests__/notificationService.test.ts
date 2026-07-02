import {beforeEach, describe, expect, it, jest} from '@jest/globals';

import api from '../src/services/api';
import {
  buildNotificationPreferencesPayload,
  registerNotificationToken,
  updateNotificationPreferences,
} from '../src/services/notificationService';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    put: jest.fn(),
  },
}));

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes notification preference payloads for published channels', () => {
    expect(
      buildNotificationPreferencesPayload({
        podcast: true,
        radio: false,
        jukebox: true,
        events: true,
      }),
    ).toEqual({
      podcast: true,
      radio: false,
      jukebox: true,
      events: true,
    });
  });

  it('registers the mobile FCM token with the backend', async () => {
    const putMock = api.put as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    putMock.mockResolvedValueOnce({data: {data: {notifications_ready: true}}});

    await expect(registerNotificationToken(' token-123 ')).resolves.toEqual({
      notifications_ready: true,
    });

    expect(putMock).toHaveBeenCalledWith('/notifications/device-token', {
      fcm_token: 'token-123',
    });
  });

  it('updates notification preferences through the backend', async () => {
    const putMock = api.put as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    putMock.mockResolvedValueOnce({data: {data: {preferences: {podcast: true}}}});

    await updateNotificationPreferences({podcast: true});

    expect(putMock).toHaveBeenCalledWith('/notifications/preferences', {
      preferences: {podcast: true},
    });
  });
});
