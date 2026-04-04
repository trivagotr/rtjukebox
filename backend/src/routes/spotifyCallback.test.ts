import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockHandleCallback,
  mockHandleDeviceAuthCallback,
  mockIsDeviceAuthState,
} = vi.hoisted(() => ({
  mockHandleCallback: vi.fn(),
  mockHandleDeviceAuthCallback: vi.fn(),
  mockIsDeviceAuthState: vi.fn(),
}));

vi.mock('../services/spotify', () => ({
  spotifyService: {
    handleCallback: mockHandleCallback,
    handleDeviceAuthCallback: mockHandleDeviceAuthCallback,
    isDeviceAuthState: mockIsDeviceAuthState,
  },
}));

function createResponseDouble() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe('spotify callback route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('routes device-scoped auth callbacks through the main spotify callback endpoint', async () => {
    const spotifyRouteModule = await import('./spotify');
    const res = createResponseDouble();

    mockHandleDeviceAuthCallback.mockResolvedValue({
      deviceId: 'device-1',
      spotifyDisplayName: 'Kiosk Device',
    });
    mockIsDeviceAuthState.mockReturnValue(true);

    await (spotifyRouteModule as any).handleSpotifyAuthCallback(
      {
        query: {
          code: 'device-auth-code',
          state: 'device.device-1.nonce.signature',
        },
      } as any,
      res,
    );

    expect(mockHandleDeviceAuthCallback).toHaveBeenCalledWith(
      'device-auth-code',
      'device.device-1.nonce.signature',
      undefined
    );
    expect(mockHandleCallback).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('SPOTIFY_DEVICE_AUTH_SUCCESS'));
  });
});
