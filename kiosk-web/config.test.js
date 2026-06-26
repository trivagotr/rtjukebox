import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadConfig({ hostname, origin, pathname = '/kiosk/', protocol = 'http:', search = '?code=FALLBACK1' }) {
  const source = fs.readFileSync(path.resolve(__dirname, './config.js'), 'utf8');
  const storage = new Map();
  const localStorage = {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
    removeItem: vi.fn((key) => storage.delete(key)),
  };
  const context = vm.createContext({
    window: {
      location: { hostname, origin, pathname, protocol, search },
    },
    localStorage,
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
});
