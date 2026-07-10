import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadConfig({
  hostname,
  origin,
  pathname = '/kiosk/',
  protocol = 'http:',
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

  return context.__CONFIG__;
}

function loadKioskAppClass(config, { fetchImpl, localStorage } = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
  const windowObject = {
    addEventListener: vi.fn(),
    KioskPlayback: {},
  };
  const storage = localStorage || {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  const context = vm.createContext({
    window: windowObject,
    document: {
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
    clearInterval,
    module: { exports: {} },
    exports: {},
    require,
  });

  vm.runInContext(source, context);

  return context.KioskApp;
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

  it('starts fixed kiosk discovery at /kiosk/ without a query string or password', async () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk/',
      protocol: 'https:',
      search: '',
    });
    const KioskApp = loadKioskAppClass(config);
    const calls = [];
    const app = Object.create(KioskApp.prototype);

    app.setupWaveform = () => calls.push('waveform');
    app.setupAudioPlayer = () => calls.push('audio');
    app.registerDevice = async () => {
      calls.push('register');
    };
    app.generateQRCode = () => calls.push('qr');
    app.setupKioskLifecycleHandlers = () => calls.push('lifecycle');
    app.startKioskHeartbeat = () => calls.push('heartbeat');
    app.isActiveKioskSession = () => false;
    app.connectSocket = () => calls.push('socket');
    app.setupFullscreenToggle = () => calls.push('fullscreen');
    app.setupLogoutButton = () => calls.push('logout');
    app.showDeviceSetupOverlay = () => calls.push('setup-overlay');

    await app.init();

    expect(config).not.toHaveProperty('DEVICE_PWD');
    expect(calls).toContain('register');
    expect(calls).not.toContain('setup-overlay');
    expect(calls.indexOf('qr')).toBeGreaterThan(calls.indexOf('register'));
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

  it('ignores URL passwords for the password-free fixed kiosk', () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk/',
      protocol: 'https:',
      search: '?code=FALLBACK1&pwd=secret',
    });

    expect(config.DEVICE_CODE).toBe('FALLBACK1');
    expect(config).not.toHaveProperty('DEVICE_PWD');
  });

  it('serves kiosk assets from /kiosk even when the page is opened without a trailing slash', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');

    expect(indexHtml).toContain('<base href="/kiosk/">');
  });
});
