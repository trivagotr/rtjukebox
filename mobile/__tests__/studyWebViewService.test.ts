import {describe, expect, it} from '@jest/globals';

import {
  STUDY_GAME_ASSET_ROOT,
  STUDY_LIBRARY_ENTRY_URL,
  buildStudyWebBootstrap,
  createStudyWebViewBridge,
  isAllowedStudyNavigation,
  parseStudyWebMessage,
} from '../src/services/studyWebViewService';

describe('Study Library WebView contract', () => {
  const account = {
    id: 'user-17',
    display_name: 'Ada',
    email: 'ada@example.com',
    avatar_url: 'https://radiotedu.com/uploads/ada.png',
    gold_balance: 240,
    is_guest: false,
    access_token: 'must-never-cross-the-webview-boundary',
    refresh_token: 'must-also-stay-native',
  };

  it('packages the Phaser Study game as an app-only Android asset', () => {
    expect(STUDY_GAME_ASSET_ROOT).toBe('file:///android_asset/study-game/');
    expect(STUDY_LIBRARY_ENTRY_URL).toBe(
      'file:///android_asset/study-game/index.html?embedded=mobile',
    );
  });

  it('exposes only public account fields to the embedded room', () => {
    const bootstrap = buildStudyWebBootstrap(account);

    expect(bootstrap).toEqual({
      embedded: true,
      account: {
        id: 'user-17',
        displayName: 'Ada',
        globalPoints: 240,
        authenticated: true,
      },
    });
    expect(JSON.stringify(bootstrap)).not.toContain(account.access_token);
    expect(JSON.stringify(bootstrap)).not.toContain(account.refresh_token);
  });

  it('keeps navigation inside the packaged Library tree', () => {
    expect(isAllowedStudyNavigation(STUDY_LIBRARY_ENTRY_URL)).toBe(true);
    expect(
      isAllowedStudyNavigation(
        'file:///android_asset/study-game/assets/avatars/engine-proof/body-idle.png',
      ),
    ).toBe(true);
    expect(isAllowedStudyNavigation('about:blank')).toBe(true);

    expect(isAllowedStudyNavigation('https://radiotedu.com/focus/')).toBe(false);
    expect(isAllowedStudyNavigation('file:///android_asset/other/index.html')).toBe(false);
    const scriptUrl = ['java', 'script:alert(1)'].join('');
    expect(isAllowedStudyNavigation(scriptUrl)).toBe(false);
  });

  it('builds a credential-free bridge for the Phaser Study runtime', () => {
    const bridge = createStudyWebViewBridge(buildStudyWebBootstrap(account));

    expect(bridge).toContain('RadioTEDUStudyAccount');
    expect(bridge).toContain('RadioTEDUAppAuth');
    expect(bridge).toContain('radiotedu-study-auth');
    expect(bridge).toContain('radiotedu:auth');
    expect(bridge).not.toContain(account.access_token);
    expect(bridge).not.toContain(account.refresh_token);
  });

  it('accepts only the small native message allowlist', () => {
    expect(parseStudyWebMessage('{"type":"radiotedu:library-ready"}')).toEqual({
      type: 'radiotedu:library-ready',
    });
    expect(parseStudyWebMessage('{"type":"radiotedu:request-account"}')).toEqual({
      type: 'radiotedu:request-account',
    });
    expect(parseStudyWebMessage('{"type":"logout"}')).toBeNull();
    expect(parseStudyWebMessage('not-json')).toBeNull();
  });
});
