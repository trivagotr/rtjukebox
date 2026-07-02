import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadConfigContext(windowOverrides = {}) {
  const configSource = fs.readFileSync(path.resolve(__dirname, './config.js'), 'utf8');
  const localStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  const context = vm.createContext({
    window: {
      location: {
        protocol: 'https:',
        hostname: 'kiosk.example.com',
        origin: 'https://kiosk.example.com',
        pathname: '/kiosk/',
        search: '',
      },
      localStorage,
      ...windowOverrides,
    },
    localStorage,
    URLSearchParams,
  });
  vm.runInContext(`${configSource}; globalThis.__CONFIG__ = CONFIG;`, context);
  return context.__CONFIG__;
}

describe('kiosk config', () => {
  it('allows deployment to override API and websocket urls without editing source', () => {
    const config = loadConfigContext({
      RT_JUKEBOX_CONFIG: {
        API_URL: 'https://api.example.com',
        WS_URL: 'https://ws.example.com',
      },
    });

    expect(config.API_URL).toBe('https://api.example.com');
    expect(config.WS_URL).toBe('https://ws.example.com');
  });

  it('serves kiosk assets from /kiosk even when the page is opened without a trailing slash', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');

    expect(indexHtml).toContain('<base href="/kiosk/">');
  });
});
