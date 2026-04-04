import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSpotifyDeviceAuthEndpoints,
  createSpotifyDeviceAuthController,
  renderSpotifyDeviceAuthSetup,
  removeSpotifyDeviceAuthSetup,
} from './device-spotify-auth.js';

function createDocumentStub() {
  const nodes = new Map();
  const appended = [];

  const body = {
    appendChild(node) {
      appended.push(node);
      if (node?.id) {
        nodes.set(node.id, node);
      }
      return node;
    },
    removeChild(node) {
      const index = appended.indexOf(node);
      if (index >= 0) {
        appended.splice(index, 1);
      }
      if (node?.id) {
        nodes.delete(node.id);
      }
      return node;
    },
  };

  return {
    body,
    appended,
    nodes,
    createElement(tagName) {
      return {
        tagName,
        id: '',
        className: '',
        style: {},
        innerHTML: '',
        textContent: '',
        dataset: {},
        remove() {
          body.removeChild(this);
        },
        querySelector() {
          return null;
        },
      };
    },
    getElementById(id) {
      return nodes.get(id) || null;
    },
  };
}

describe('kiosk device spotify auth helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the device specific spotify auth endpoints', () => {
    expect(buildSpotifyDeviceAuthEndpoints('http://127.0.0.1:3000')).toEqual({
      status: 'http://127.0.0.1:3000/api/v1/jukebox/kiosk/spotify-device-auth/status',
      start: 'http://127.0.0.1:3000/api/v1/jukebox/kiosk/spotify-device-auth/start',
    });
  });

  it('shows a blocking setup state when device spotify auth is missing', async () => {
    const documentStub = createDocumentStub();
    const fetch = vi.fn(async (url) => {
      expect(String(url)).toContain('/api/v1/jukebox/kiosk/spotify-device-auth/status');
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deviceId: 'device-1',
            connected: false,
            spotifyAccountId: null,
            spotifyDisplayName: null,
            spotifyEmail: null,
            spotifyProduct: null,
            spotifyCountry: null,
            tokenExpiresAt: null,
            scopes: null,
            hasRefreshToken: false,
          },
        }),
      };
    });

    const controller = createSpotifyDeviceAuthController({
      apiBaseUrl: 'http://127.0.0.1:3000',
      deviceId: 'device-1',
      devicePassword: 'secret',
      document: documentStub,
      fetch,
      window: {
        open: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await controller.refreshStatus();

    const overlay = documentStub.getElementById('spotifyDeviceAuthSetupOverlay');
    expect(overlay).not.toBeNull();
    expect(overlay.innerHTML).toContain('Spotify bağlantısı gerekli');
    expect(overlay.innerHTML).toContain('Bağlan');
  });

  it('opens the device-specific spotify authorize url', async () => {
    const documentStub = createDocumentStub();
    const popup = {
      location: { href: '' },
      focus: vi.fn(),
      close: vi.fn(),
    };
    const open = vi.fn(() => popup);
    const fetch = vi.fn();

    const controller = createSpotifyDeviceAuthController({
      apiBaseUrl: 'http://127.0.0.1:3000',
      deviceId: 'device-1',
      devicePassword: 'secret',
      document: documentStub,
      fetch,
      window: {
        open,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await controller.openConnectFlow();

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(fetch).not.toHaveBeenCalled();
    expect(popup.location.href).toBe('http://127.0.0.1:3000/api/v1/jukebox/kiosk/spotify-device-auth/start?device_id=device-1&device_pwd=secret');
    expect(popup.focus).toHaveBeenCalledTimes(1);
  });

  it('opens the popup synchronously before awaiting the auth url request', async () => {
    const documentStub = createDocumentStub();
    const popup = {
      location: { href: '' },
      focus: vi.fn(),
      close: vi.fn(),
    };
    const open = vi.fn(() => popup);

    const fetch = vi.fn();

    const controller = createSpotifyDeviceAuthController({
      apiBaseUrl: 'http://127.0.0.1:3000',
      deviceId: 'device-1',
      devicePassword: 'secret',
      document: documentStub,
      fetch,
      window: {
        open,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await controller.openConnectFlow();

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(fetch).not.toHaveBeenCalled();
    expect(popup.location.href).toBe('http://127.0.0.1:3000/api/v1/jukebox/kiosk/spotify-device-auth/start?device_id=device-1&device_pwd=secret');
  });

  it('refreshes and exits setup after a successful auth success message', async () => {
    const documentStub = createDocumentStub();
    let connected = false;
    let messageHandler = null;
    const popup = {
      location: { href: '' },
      focus: vi.fn(),
      close: vi.fn(),
    };
    const open = vi.fn(() => popup);
    const addEventListener = vi.fn((eventName, handler) => {
      if (eventName === 'message') {
        messageHandler = handler;
      }
    });
    const fetch = vi.fn(async (url) => {
      const urlString = String(url);
      if (urlString.includes('/status')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deviceId: 'device-1',
              connected,
              spotifyAccountId: connected ? 'spotify-1' : null,
              spotifyDisplayName: connected ? 'Kiosk Device' : null,
              spotifyEmail: connected ? 'kiosk@example.com' : null,
              spotifyProduct: connected ? 'premium' : null,
              spotifyCountry: connected ? 'TR' : null,
              tokenExpiresAt: connected ? '2026-04-03T12:00:00.000Z' : null,
              scopes: connected ? 'streaming' : null,
              hasRefreshToken: connected,
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { authUrl: 'https://accounts.spotify.com/authorize?state=device-state' },
        }),
      };
    });

    const onConnected = vi.fn();
    const controller = createSpotifyDeviceAuthController({
      apiBaseUrl: 'http://127.0.0.1:3000',
      deviceId: 'device-1',
      devicePassword: 'secret',
      document: documentStub,
      fetch,
      window: {
        open,
        addEventListener,
        removeEventListener: vi.fn(),
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
      onConnected,
    });

    await controller.refreshStatus();
    expect(documentStub.getElementById('spotifyDeviceAuthSetupOverlay')).not.toBeNull();

    await controller.openConnectFlow();
    expect(open).toHaveBeenCalledWith('', '_blank');

    connected = true;
    await messageHandler({
      data: {
        type: 'SPOTIFY_DEVICE_AUTH_SUCCESS',
        deviceId: 'device-1',
      },
    });

    expect(onConnected).toHaveBeenCalledWith(expect.objectContaining({
      connected: true,
      spotifyAccountId: 'spotify-1',
    }));
    expect(documentStub.getElementById('spotifyDeviceAuthSetupOverlay')).toBeNull();
    expect(controller.getStatus()).toEqual(expect.objectContaining({
      connected: true,
      spotifyAccountId: 'spotify-1',
    }));
  });

  it('hides the setup state after a reconnect status refresh succeeds', async () => {
    const documentStub = createDocumentStub();
    let connected = false;
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          deviceId: 'device-1',
          connected,
          spotifyAccountId: connected ? 'spotify-1' : null,
          spotifyDisplayName: connected ? 'Kiosk Device' : null,
          spotifyEmail: connected ? 'kiosk@example.com' : null,
          spotifyProduct: connected ? 'premium' : null,
          spotifyCountry: connected ? 'TR' : null,
          tokenExpiresAt: connected ? '2026-04-03T12:00:00.000Z' : null,
          scopes: connected ? 'streaming' : null,
          hasRefreshToken: connected,
        },
      }),
    }));

    const controller = createSpotifyDeviceAuthController({
      apiBaseUrl: 'http://127.0.0.1:3000',
      deviceId: 'device-1',
      devicePassword: 'secret',
      document: documentStub,
      fetch,
      window: {
        open: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await controller.refreshStatus();
    expect(documentStub.getElementById('spotifyDeviceAuthSetupOverlay')).not.toBeNull();

    connected = true;
    await controller.refreshStatus();

    expect(documentStub.getElementById('spotifyDeviceAuthSetupOverlay')).toBeNull();
    expect(controller.getStatus()).toEqual(expect.objectContaining({
      connected: true,
      spotifyAccountId: 'spotify-1',
    }));
  });

  it('can render and remove the setup overlay directly', () => {
    const documentStub = createDocumentStub();

    renderSpotifyDeviceAuthSetup(documentStub, {
      deviceId: 'device-1',
      reason: 'Spotify authorization required for this device',
      onConnect: vi.fn(),
    });

    expect(documentStub.getElementById('spotifyDeviceAuthSetupOverlay')).not.toBeNull();

    removeSpotifyDeviceAuthSetup(documentStub);
    expect(documentStub.getElementById('spotifyDeviceAuthSetupOverlay')).toBeNull();
  });
});
