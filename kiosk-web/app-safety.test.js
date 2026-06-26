import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('temporary fallback kiosk safety', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
  const configSource = fs.readFileSync(path.resolve(__dirname, './config.js'), 'utf8');

  it('does not ship the legacy kiosk setup form or password URL hint', () => {
    expect(appSource).not.toContain('setupDevicePassword');
    expect(appSource).not.toContain('?code=KOD&pwd=SIFRE');
    expect(appSource).not.toContain('Cihaz Kurulumu');
  });

  it('does not read or send jukebox device passwords from the kiosk', () => {
    expect(appSource).not.toContain('device_pwd');
    expect(configSource).not.toContain('pwdFromURL');
    expect(configSource).not.toContain('device_pwd');
  });
});
