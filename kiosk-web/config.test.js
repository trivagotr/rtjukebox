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

describe('kiosk configuration', () => {
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

  it('does not require a device code when the kiosk screen opens a fixed /kiosk URL', () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk',
      protocol: 'https:',
      search: '',
    });

    expect(config.DEVICE_CODE).toBe('');
    expect(config.QR_LINK_FORMAT).toBe('https://radiotedu.com/jukebox?device={DEVICE_CODE}');
  });

  it('ignores URL passwords for the temporary no-password fallback kiosk', () => {
    const config = loadConfig({
      hostname: 'radiotedu.com',
      origin: 'https://radiotedu.com',
      pathname: '/kiosk',
      protocol: 'https:',
      search: '?code=FALLBACK1&pwd=secret',
    });

    expect(config.DEVICE_CODE).toBe('FALLBACK1');
    expect(config.DEVICE_PWD).toBe('');
  });

  it('supports GitHub Pages under the repository path without device code or password', () => {
    const config = loadConfig({
      hostname: 'trivagotr.github.io',
      origin: 'https://trivagotr.github.io',
      pathname: '/rtjukebox/kiosk/',
      protocol: 'https:',
      search: '',
      runtimeConfig: {
        API_BASE_URL: 'https://api.example.com/jukebox',
      },
    });

    expect(config.DEVICE_CODE).toBe('');
    expect(config.DEVICE_PWD).toBe('');
    expect(config.API_URL).toBe('https://api.example.com/jukebox');
    expect(config.WS_URL).toBe('https://api.example.com');
    expect(config.SOCKET_PATH).toBe('/jukebox/socket.io');
    expect(config.QR_LINK_FORMAT).toBe('https://trivagotr.github.io/rtjukebox/jukebox?device={DEVICE_CODE}');
  });

  it('keeps the GitHub Pages repository base when the kiosk URL has no trailing slash', () => {
    const config = loadConfig({
      hostname: 'trivagotr.github.io',
      origin: 'https://trivagotr.github.io',
      pathname: '/rtjukebox/kiosk',
      protocol: 'https:',
      search: '',
    });

    expect(config.QR_LINK_FORMAT).toBe('https://trivagotr.github.io/rtjukebox/jukebox?device={DEVICE_CODE}');
  });
});
