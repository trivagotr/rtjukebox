import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadRuntimeConfig() {
  const source = fs.readFileSync(path.resolve(__dirname, './runtime-config.js'), 'utf8');
  const context = vm.createContext({
    window: {},
  });

  vm.runInContext(source, context);

  return context.window.RADIOTEDU_KIOSK_CONFIG;
}

describe('kiosk runtime configuration', () => {
  it('ships the public radiotedu production endpoints for server overlay deploys', () => {
    expect(loadRuntimeConfig()).toEqual({
      API_BASE_URL: 'https://radiotedu.com/juke-local',
      PUBLIC_SITE_BASE_URL: 'https://radiotedu.com',
      QR_LINK_BASE_URL: 'https://radiotedu.com/juke-local/controller/',
    });
  });
});
