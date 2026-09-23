import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import deviceSpotifyAuth from './device-spotify-auth.js';
import { server } from './test/mswServer.js';

const { SETUP_OVERLAY_ID, createSpotifyDeviceAuthController } = deviceSpotifyAuth;

describe('kiosk Spotify setup component and API', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the setup prompt from the API response and opens the connect flow', async () => {
    let requestBody;
    server.use(
      http.post(/\/api\/v1\/jukebox\/kiosk\/spotify-device-auth\/status$/, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          success: true,
          data: { connected: false, reason: 'Spotify account is not linked' },
        });
      }),
    );

    const popup = { location: { href: '' }, focus: vi.fn() };
    const windowScope = {
      location: { href: 'https://kiosk.test/', origin: 'https://kiosk.test' },
      open: vi.fn(() => popup),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const controller = createSpotifyDeviceAuthController({
      apiBaseUrl: 'https://kiosk.test',
      deviceId: 'kiosk-01',
      devicePassword: 'test-device-password',
      document,
      window: windowScope,
      fetch: globalThis.fetch,
    });

    const status = await controller.refreshStatus();

    expect(status.connected).toBe(false);
    expect(requestBody).toEqual({ device_id: 'kiosk-01', device_pwd: 'test-device-password' });
    expect(document.getElementById(SETUP_OVERLAY_ID)?.textContent).toContain('Spotify account is not linked');

    document.querySelector('[data-role="spotify-connect"]').click();
    await vi.waitFor(() => expect(popup.location.href).toContain('/spotify-device-auth/start?'));
    expect(popup.location.href).toContain('device_id=kiosk-01');
    expect(popup.location.href).toContain('return_origin=https%3A%2F%2Fkiosk.test');
    expect(popup.focus).toHaveBeenCalledOnce();
    controller.destroy();
  });
});
