import {beforeEach, describe, expect, it, jest} from '@jest/globals';

import api from '../src/services/api';
import {
  equipAvatarItem,
  fetchAvatarCatalog,
  fetchAvatarProfile,
  fetchStudyRoomState,
  finishStudySession,
  isStudyRoomSeatConflictError,
  purchaseAvatarItem,
  sendStudyHeartbeat,
  sendStudyRoomPresenceHeartbeat,
  startStudySession,
} from '../src/services/studyService';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('studyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts, heartbeats, and finishes authenticated Study sessions through backend-owned endpoints', async () => {
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    postMock
      .mockResolvedValueOnce({
        data: {
          data: {
            session: {id: 'session-1', location: 'chim-alan', status: 'active'},
            nonce: 'nonce-1',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            session: {id: 'session-1', location: 'chim-alan', status: 'active'},
            nonce: 'nonce-2',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            session: {id: 'session-1', location: 'chim-alan', status: 'finished'},
            points: {lifetime_points: 120, spendable_points: 45},
            awarded_points: 8,
          },
        },
      });

    await expect(startStudySession({location: 'chim-alan', clientSessionId: 'client-1'})).resolves.toEqual({
      session: {id: 'session-1', location: 'chim-alan', status: 'active'},
      nonce: 'nonce-1',
    });
    await expect(
      sendStudyHeartbeat('session-1', {
        nonce: 'nonce-1',
        focused: true,
        foreground: true,
        position: {x: 13, y: 18},
        interaction: 'seated',
        seatId: 'chim-upper-seat-12',
      }),
    ).resolves.toEqual({
      session: {id: 'session-1', location: 'chim-alan', status: 'active'},
      nonce: 'nonce-2',
    });
    await expect(finishStudySession('session-1', {nonce: 'nonce-2'})).resolves.toEqual({
      session: {id: 'session-1', location: 'chim-alan', status: 'finished'},
      points: {lifetime_points: 120, spendable_points: 45},
      awarded_points: 8,
    });

    expect(postMock).toHaveBeenNthCalledWith(1, '/study/sessions/start', {
      location: 'chim-alan',
      clientSessionId: 'client-1',
    });
    expect(postMock).toHaveBeenNthCalledWith(2, '/study/sessions/session-1/heartbeat', {
      nonce: 'nonce-1',
      focused: true,
      foreground: true,
      position: {x: 13, y: 18},
      interaction: 'seated',
      seat_id: 'chim-upper-seat-12',
    });
    expect(postMock).toHaveBeenNthCalledWith(3, '/study/sessions/session-1/finish', {nonce: 'nonce-2'});
  });

  it('can start a backend-owned Pomodoro Study session with 25, 50, or custom target minutes', async () => {
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    postMock.mockResolvedValueOnce({
      data: {
        data: {
          session: {
            id: 'session-1',
            location: 'library',
            status: 'active',
            session_type: 'pomodoro',
            pomodoro_target_minutes: 50,
          },
          nonce: 'nonce-1',
        },
      },
    });

    await expect(startStudySession({
      location: 'library',
      clientSessionId: 'client-pomodoro-1',
      sessionType: 'pomodoro',
      pomodoroTargetMinutes: 50,
    })).resolves.toEqual({
      session: {
        id: 'session-1',
        location: 'library',
        status: 'active',
        session_type: 'pomodoro',
        pomodoro_target_minutes: 50,
      },
      nonce: 'nonce-1',
    });

    expect(postMock).toHaveBeenCalledWith('/study/sessions/start', {
      location: 'library',
      clientSessionId: 'client-pomodoro-1',
      sessionType: 'pomodoro',
      pomodoroTargetMinutes: 50,
    });
  });

  it('uses backend-owned catalog, inventory, purchase, and equip endpoints for avatar clothes', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    getMock
      .mockResolvedValueOnce({
        data: {
          data: {
            items: [{itemId: 'spark-hoodie', slot: 'top', title: 'Spark Hoodie', costPoints: 80}],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            ownedItemIds: ['default-top'],
            equipped: {top: 'default-top'},
            points: {lifetime_points: 100, spendable_points: 100},
          },
        },
      });
    postMock
      .mockResolvedValueOnce({
        data: {
          data: {
            ownedItemIds: ['default-top', 'spark-hoodie'],
            points: {lifetime_points: 100, spendable_points: 20},
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            equipped: {top: 'spark-hoodie'},
          },
        },
      });

    await expect(fetchAvatarCatalog()).resolves.toEqual([
      {itemId: 'spark-hoodie', slot: 'top', title: 'Spark Hoodie', costPoints: 80},
    ]);
    await expect(fetchAvatarProfile()).resolves.toEqual({
      ownedItemIds: ['default-top'],
      equipped: {top: 'default-top'},
      points: {lifetime_points: 100, spendable_points: 100},
    });
    await expect(purchaseAvatarItem('spark-hoodie')).resolves.toEqual({
      ownedItemIds: ['default-top', 'spark-hoodie'],
      points: {lifetime_points: 100, spendable_points: 20},
    });
    await expect(equipAvatarItem({slot: 'top', itemId: 'spark-hoodie'})).resolves.toEqual({
      equipped: {top: 'spark-hoodie'},
    });

    expect(getMock).toHaveBeenNthCalledWith(1, '/study/avatar/catalog');
    expect(getMock).toHaveBeenNthCalledWith(2, '/study/avatar/me');
    expect(postMock).toHaveBeenNthCalledWith(1, '/study/avatar/purchase', {itemId: 'spark-hoodie'});
    expect(postMock).toHaveBeenNthCalledWith(2, '/study/avatar/equip', {slot: 'top', itemId: 'spark-hoodie'});
  });

  it('fetches backend study-room participants for seat-by-seat occupancy', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    getMock.mockResolvedValueOnce({
      data: {
        data: {
          room: {id: 'chim-alan', title: 'Çim alan'},
          zones: [],
          seats: [{id: 'chim-upper-seat-12'}],
          participants: [
            {
              user_id: 'user-1',
              display_name: 'Ada',
              seat_id: 'chim-upper-seat-12',
              presence_mode: 'studying',
              avatar_style: 'classic-red',
              equipped_outfit: {top: 'spark-hoodie'},
            },
          ],
        },
      },
    });

    await expect(fetchStudyRoomState('chim-alan')).resolves.toEqual({
      room: {id: 'chim-alan', title: 'Çim alan'},
      zones: [],
      seats: [{id: 'chim-upper-seat-12'}],
      participants: [
        {
          user_id: 'user-1',
          display_name: 'Ada',
          seat_id: 'chim-upper-seat-12',
          presence_mode: 'studying',
          avatar_style: 'classic-red',
          equipped_outfit: {top: 'spark-hoodie'},
        },
      ],
    });
    expect(getMock).toHaveBeenCalledWith('/gamification/study-room?room_id=chim-alan');
  });

  it('publishes backend study-room presence without awarding duplicate study seconds', async () => {
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    postMock.mockResolvedValueOnce({
      data: {
        data: {
          participant: {
            user_id: 'user-1',
            room_id: 'chim-alan',
            seat_id: 'chim-upper-seat-12',
            presence_mode: 'studying',
          },
          studied_seconds_delta: 0,
        },
      },
    });

    await expect(
      sendStudyRoomPresenceHeartbeat({
        roomId: 'chim-alan',
        position: {x: 12, y: 4},
        seatId: 'chim-upper-seat-12',
        presenceMode: 'studying',
        studiedSecondsDelta: 0,
      }),
    ).resolves.toEqual({
      participant: {
        user_id: 'user-1',
        room_id: 'chim-alan',
        seat_id: 'chim-upper-seat-12',
        presence_mode: 'studying',
      },
      studied_seconds_delta: 0,
    });

    expect(postMock).toHaveBeenCalledWith('/gamification/study-room/heartbeat', {
      room_id: 'chim-alan',
      position: {x: 12, y: 4},
      seat_id: 'chim-upper-seat-12',
      presence_mode: 'studying',
      studied_seconds_delta: 0,
    });
  });

  it('identifies backend seat conflict errors for room presence recovery', () => {
    expect(isStudyRoomSeatConflictError({response: {status: 409, data: {message: 'Seat already occupied'}}})).toBe(true);
    expect(isStudyRoomSeatConflictError({response: {status: 500, data: {message: 'Seat already occupied'}}})).toBe(false);
    expect(isStudyRoomSeatConflictError(new Error('Seat already occupied'))).toBe(false);
  });
});
