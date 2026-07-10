import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadConfig({
  hostname,
  origin,
  pathname = '/kiosk/',
  protocol = 'http:',
  returnHarness = false,
  search = '?code=FALLBACK1',
  runtimeConfig,
}) {
  const source = fs.readFileSync(path.resolve(__dirname, './config.js'), 'utf8');
  const storage = new Map();
  const localStorage = {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
    removeItem: vi.fn((key) => storage.delete(key)),
  };
  const windowObject = {
    location: { hostname, origin, pathname, protocol, search },
  };
  if (runtimeConfig) {
    windowObject.RADIOTEDU_KIOSK_CONFIG = runtimeConfig;
  }
  const context = vm.createContext({
    window: windowObject,
    localStorage,
    URL,
    URLSearchParams,
  });

  vm.runInContext(`${source}\nglobalThis.__CONFIG__ = CONFIG;`, context);

  if (returnHarness) {
    return { config: context.__CONFIG__, localStorage };
  }

  return context.__CONFIG__;
}

function loadKioskAppClass(config, {
  clearInterval: clearIntervalOverride,
  document: documentOverride,
  fetchImpl,
  localStorage,
  window: windowOverride,
} = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
  const windowObject = {
    addEventListener: vi.fn(),
    KioskPlayback: {},
    ...windowOverride,
  };
  const storage = localStorage || {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  const context = vm.createContext({
    window: windowObject,
    document: documentOverride || {
      addEventListener: vi.fn(),
      getElementById: vi.fn(() => null),
    },
    CONFIG: config,
    localStorage: storage,
    fetch: fetchImpl || vi.fn(),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval: clearIntervalOverride || clearInterval,
    module: { exports: {} },
    exports: {},
    require,
  });

  vm.runInContext(source, context);

  return context.KioskApp;
}

function createDocumentHarness() {
  const elements = new Map();
  const controls = {
    deviceCode: { value: '', onkeydown: null, focus: vi.fn() },
    devicePassword: { value: '', onkeydown: null, focus: vi.fn() },
    save: { onclick: null, disabled: false },
    retry: { onclick: null, disabled: false },
  };
  const selectorControls = {
    '#setupDeviceCode': controls.deviceCode,
    '#setupDevicePassword': controls.devicePassword,
    '#saveDeviceCode': controls.save,
    '#retryDeviceRegistration': controls.retry,
  };
  const document = {
    body: {
      appendChild: vi.fn((node) => {
        elements.set(node.id, node);
      }),
    },
    addEventListener: vi.fn(),
    getElementById: vi.fn((id) => elements.get(id) || null),
    createElement: vi.fn(() => {
      const node = {
        id: '',
        style: {},
        innerHTML: '',
        querySelector: vi.fn((selector) => selectorControls[selector] || null),
        remove: vi.fn(function remove() {
          elements.delete(this.id);
        }),
      };
      return node;
    }),
  };

  return { controls, document, elements };
}

describe('kiosk configuration', () => {
  it('loads the production runtime config immediately before config.js', () => {
    const runtimeConfigPath = path.resolve(__dirname, './runtime-config.js');
    const runtimeConfigExists = fs.existsSync(runtimeConfigPath);

    expect(runtimeConfigExists).toBe(true);

    const runtimeConfigSource = fs.readFileSync(runtimeConfigPath, 'utf8');
    const runtimeContext = vm.createContext({ window: {} });
    vm.runInContext(runtimeConfigSource, runtimeContext);
    expect(runtimeContext.window.RADIOTEDU_KIOSK_CONFIG).toEqual({
      API_BASE_URL: 'https://radiotedu.com/jukebox',
      PUBLIC_SITE_BASE_URL: 'https://radiotedu.com',
      QR_LINK_BASE_URL: 'https://radiotedu.com/jukebox',
    });

    const indexHtml = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');
    expect(indexHtml).toMatch(
      /<script src="runtime-config\.js"><\/script>\s*<script src="config\.js"><\/script>/,
    );
  });

  it('derives production API, websocket, socket path, and QR URLs from runtime config', () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk/',
      protocol: 'https:',
      search: '',
      runtimeConfig: {
        API_BASE_URL: 'https://radiotedu.com/jukebox',
        PUBLIC_SITE_BASE_URL: 'https://radiotedu.com',
        QR_LINK_BASE_URL: 'https://radiotedu.com/jukebox',
      },
    });

    expect(config.API_URL).toBe('https://radiotedu.com/jukebox');
    expect(config.WS_URL).toBe('https://radiotedu.com');
    expect(config.SOCKET_PATH).toBe('/jukebox/socket.io');
    expect(config.QR_LINK_FORMAT).toBe('https://radiotedu.com/jukebox?device={DEVICE_CODE}');
    expect(config.RECONNECT_INTERVAL).toBe(5000);
    expect(config.UI_UPDATE_INTERVAL).toBe(100);
    expect(config.SOCKET_EMIT_INTERVAL).toBe(5000);
  });

  it('points local QR scans at the phone jukebox page', () => {
    const config = loadConfig({
      hostname: '127.0.0.1',
      origin: 'http://127.0.0.1:3000',
    });

    expect(config.QR_LINK_FORMAT).toBe('http://127.0.0.1:5173/jukebox?device={DEVICE_CODE}');
  });

  it('points production QR scans at the public jukebox phone page', () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/radio/kiosk/',
      protocol: 'https:',
    });

    expect(config.QR_LINK_FORMAT).toBe('https://radiotedu.com/radio/jukebox?device={DEVICE_CODE}');
  });

  it('halts after a real registration failure and completes startup once after retry', async () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk/',
      protocol: 'https:',
      search: '',
    });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Temporarily unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            device: {
              id: 'device-1',
              device_code: 'FIXED1',
              name: 'Fixed kiosk',
              location: 'Studio',
            },
            kioskSession: {
              sessionId: 'session-1',
              role: 'active',
              activeSessionId: 'session-1',
            },
          },
        }),
      });
    const { controls, document } = createDocumentHarness();
    const KioskApp = loadKioskAppClass(config, { fetchImpl, document });
    const app = Object.create(KioskApp.prototype);
    app.device = null;
    app.socket = null;
    app.kioskSessionId = 'session-1';
    app.kioskSession = null;
    app.playbackStartCoordinator = null;
    app.spotifyDeviceAuthReady = false;
    app.getOrCreateKioskSessionId = () => 'session-1';
    app.clearPlaybackCompletionRetry = vi.fn();
    app.applyKioskSession = vi.fn((session) => {
      app.kioskSession = session;
    });
    app.log = vi.fn();
    app.updateConnectionStatus = vi.fn();
    app.setupWaveform = vi.fn();
    app.setupAudioPlayer = vi.fn();
    app.generateQRCode = vi.fn();
    app.setupKioskLifecycleHandlers = vi.fn();
    app.startKioskHeartbeat = vi.fn();
    app.isActiveKioskSession = () => true;
    app.setupSpotifyDeviceAuthFlow = vi.fn(async () => {
      app.spotifyDeviceAuthReady = true;
    });
    app.resumeAfterSpotifyDeviceAuth = vi.fn(async () => {});
    app.connectSocket = vi.fn();
    app.setupFullscreenToggle = vi.fn();
    app.setupLogoutButton = vi.fn();
    app.showStartupOverlay = vi.fn();

    await app.init();

    expect(app.device).toBeNull();
    expect(app.setupKioskLifecycleHandlers).not.toHaveBeenCalled();
    expect(app.startKioskHeartbeat).not.toHaveBeenCalled();
    expect(app.generateQRCode).not.toHaveBeenCalled();
    expect(app.setupSpotifyDeviceAuthFlow).not.toHaveBeenCalled();
    expect(controls.retry.onclick).toBeTypeOf('function');

    await controls.retry.onclick();
    await controls.retry.onclick();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(app.device?.id).toBe('device-1');
    expect(app.setupKioskLifecycleHandlers).toHaveBeenCalledTimes(1);
    expect(app.startKioskHeartbeat).toHaveBeenCalledTimes(1);
    expect(app.generateQRCode).toHaveBeenCalledTimes(1);
    expect(app.setupSpotifyDeviceAuthFlow).toHaveBeenCalledTimes(1);
    expect(app.resumeAfterSpotifyDeviceAuth).toHaveBeenCalledTimes(1);
    expect(app.setupFullscreenToggle).toHaveBeenCalledTimes(1);
    expect(app.setupLogoutButton).toHaveBeenCalledTimes(1);
  });

  it('sends the no-code fixed-kiosk request and applies a compatible backend response', async () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk/',
      protocol: 'https:',
      search: '',
    });
    const fetchImpl = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          device: {
            id: 'device-1',
            device_code: 'FIXED1',
            name: 'Fixed kiosk',
            location: 'Studio',
          },
          kioskSession: {
            sessionId: 'session-1',
            role: 'active',
            activeSessionId: 'session-1',
          },
        },
      }),
    }));
    const KioskApp = loadKioskAppClass(config, { fetchImpl });
    const app = Object.create(KioskApp.prototype);
    app.socket = null;
    app.device = null;
    app.playbackStartCoordinator = null;
    app.getOrCreateKioskSessionId = () => 'session-1';
    app.clearPlaybackCompletionRetry = vi.fn();
    app.applyKioskSession = vi.fn();
    app.log = vi.fn();
    app.updateConnectionStatus = vi.fn();

    await app.registerDevice();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      session_id: 'session-1',
    });
    expect(config.DEVICE_CODE).toBe('FIXED1');
  });

  it('persists a fresh URL password and sends it with device registration', async () => {
    const { config, localStorage } = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk/',
      protocol: 'https:',
      returnHarness: true,
      search: '?code=FALLBACK1&pwd=secret',
    });
    const fetchImpl = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          device: {
            id: 'device-1',
            device_code: 'FALLBACK1',
            name: 'Configured kiosk',
            location: 'Studio',
          },
          kioskSession: {
            sessionId: 'session-1',
            role: 'active',
            activeSessionId: 'session-1',
          },
        },
      }),
    }));
    const KioskApp = loadKioskAppClass(config, { fetchImpl, localStorage });
    const app = Object.create(KioskApp.prototype);
    app.socket = null;
    app.device = null;
    app.playbackStartCoordinator = null;
    app.getOrCreateKioskSessionId = () => 'session-1';
    app.clearPlaybackCompletionRetry = vi.fn();
    app.applyKioskSession = vi.fn();
    app.log = vi.fn();
    app.updateConnectionStatus = vi.fn();

    await app.registerDevice();

    expect(config.DEVICE_CODE).toBe('FALLBACK1');
    expect(config.DEVICE_PWD).toBe('secret');
    expect(localStorage.setItem).toHaveBeenCalledWith('device_pwd', 'secret');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      device_code: 'FALLBACK1',
      password: 'secret',
      session_id: 'session-1',
    });
  });

  it('logout stops lifecycle work and retries registration without stale credentials', async () => {
    const config = {
      DEVICE_CODE: 'OLD1',
      DEVICE_PWD: 'old-secret',
      API_URL: 'https://radiotedu.com/jukebox',
      WS_URL: 'https://radiotedu.com',
      SOCKET_PATH: '/jukebox/socket.io',
      QR_LINK_FORMAT: 'https://radiotedu.com/jukebox?device={DEVICE_CODE}',
      RECONNECT_INTERVAL: 5000,
      UI_UPDATE_INTERVAL: 100,
      SOCKET_EMIT_INTERVAL: 5000,
    };
    const values = new Map([
      ['device_code', 'OLD1'],
      ['device_pwd', 'old-secret'],
    ]);
    const localStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key)),
    };
    const fetchImpl = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          device: {
            id: 'device-2',
            device_code: 'FIXED2',
            name: 'Replacement kiosk',
            location: 'Studio',
          },
          kioskSession: {
            sessionId: 'session-1',
            role: 'standby',
            activeSessionId: 'other-session',
          },
        },
      }),
    }));
    const clearInterval = vi.fn();
    const { controls, document } = createDocumentHarness();
    const window = { addEventListener: vi.fn() };
    const KioskApp = loadKioskAppClass(config, {
      clearInterval,
      document,
      fetchImpl,
      localStorage,
      window,
    });
    const socket = { disconnect: vi.fn() };
    const app = Object.create(KioskApp.prototype);
    app.audioPlayer = { pause: vi.fn(), src: 'playing.mp3' };
    app.clearPlaybackCompletionRetry = vi.fn();
    app.connectSocket = vi.fn();
    app.device = { id: 'device-1', device_code: 'OLD1' };
    app.generateQRCode = vi.fn();
    app.getOrCreateKioskSessionId = () => 'session-1';
    app.hideSpotifyDeviceAuthSetupOverlay = vi.fn();
    app.isActiveKioskSession = () => false;
    app.kioskHeartbeatInterval = 'heartbeat-1';
    app.kioskSession = { sessionId: 'session-1', role: 'active' };
    app.kioskSessionId = 'session-1';
    app.log = vi.fn();
    app.notifyKioskLogout = vi.fn();
    app.playbackStartCoordinator = { reset: vi.fn() };
    app.queueData = { now_playing: null, queue: [] };
    app.registeredStartupComplete = true;
    app.registrationAttempt = null;
    app.reportSpotifyPlaybackDeviceState = vi.fn();
    app.setupKioskLifecycleHandlers = vi.fn();
    app.setupLogoutButton = vi.fn();
    app.socket = socket;
    app.spotifyController = null;
    app.spotifyDeviceAuthController = null;
    app.startKioskHeartbeat = vi.fn();
    app.updateConnectionStatus = vi.fn();
    app.applyKioskSession = vi.fn((session) => {
      app.kioskSession = session;
    });

    await app.completeRegisteredStartup();
    app.logout();

    expect(clearInterval).toHaveBeenCalledWith('heartbeat-1');
    expect(app.kioskHeartbeatInterval).toBeNull();
    expect(app.kioskSession).toBeNull();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(app.socket).toBeNull();
    expect(app.registeredStartupComplete).toBe(false);
    expect(config.DEVICE_CODE).toBe('');
    expect(config.DEVICE_PWD).toBe('');
    expect(controls.retry.onclick).toBeTypeOf('function');

    await controls.retry.onclick();

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      session_id: 'session-1',
    });
    expect(app.device?.id).toBe('device-2');
    expect(app.setupKioskLifecycleHandlers).toHaveBeenCalledTimes(2);
    expect(app.startKioskHeartbeat).toHaveBeenCalledTimes(2);
    expect(app.connectSocket).toHaveBeenCalledTimes(2);
    expect(document.addEventListener.mock.calls.filter(([event]) => event === 'dblclick')).toHaveLength(1);
    expect(document.addEventListener.mock.calls.filter(([event]) => event === 'fullscreenchange')).toHaveLength(1);
    expect(window.addEventListener.mock.calls.filter(([event]) => event === 'resize')).toHaveLength(1);
  });

  it('serves kiosk assets from /kiosk even when the page is opened without a trailing slash', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');

    expect(indexHtml).toContain('<base href="/kiosk/">');
  });
});
