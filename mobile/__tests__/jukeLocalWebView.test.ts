import {describe, expect, it} from '@jest/globals';

import {
  buildJukeLocalControllerUrl,
  isAllowedJukeLocalNavigation,
  normalizeJukeLocalAppPath,
} from '../src/services/jukeLocalWebViewService';

describe('juke-local app WebView contract', () => {
  it('opens the public phone controller and forwards a scanned device code', () => {
    expect(buildJukeLocalControllerUrl()).toBe(
      'https://radiotedu.com/juke-local/controller/',
    );
    expect(buildJukeLocalControllerUrl(' TEDU 01 ')).toBe(
      'https://radiotedu.com/juke-local/controller/?code=TEDU+01',
    );
  });

  it('keeps WebView navigation inside the juke-local phone controller', () => {
    expect(
      isAllowedJukeLocalNavigation(
        'https://radiotedu.com/juke-local/controller/?code=TEDU01',
      ),
    ).toBe(true);
    expect(
      isAllowedJukeLocalNavigation(
        'https://radiotedu.com/juke-local/kiosk/?code=TEDU01',
      ),
    ).toBe(false);
    expect(
      isAllowedJukeLocalNavigation(
        'https://radiotedu.com.evil.example/juke-local/controller/',
      ),
    ).toBe(false);
    expect(
      isAllowedJukeLocalNavigation(
        'https://radiotedu.com/juke-local/controller-evil/',
      ),
    ).toBe(false);
    expect(
      isAllowedJukeLocalNavigation(
        'https://radiotedu.com/juke-local/controller/admin',
      ),
    ).toBe(false);
  });

  it('maps the public QR URL into the existing Jukebox app route', () => {
    expect(
      normalizeJukeLocalAppPath('juke-local/controller/?code=TEDU%2001'),
    ).toBe('jukebox/TEDU%2001');
    expect(normalizeJukeLocalAppPath('juke-local/controller/')).toBe('jukebox');
    expect(normalizeJukeLocalAppPath('events/qr/TEDU-1')).toBe(
      'events/qr/TEDU-1',
    );
  });

  it('uses exact Android App Link paths instead of a broad prefix', () => {
    const manifest = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '../android/app/src/main/AndroidManifest.xml',
      ),
      'utf8',
    );
    expect(manifest).toContain('android:path="/juke-local/controller/"');
    expect(manifest).not.toContain(
      'android:pathPrefix="/juke-local/controller"',
    );
  });
});
