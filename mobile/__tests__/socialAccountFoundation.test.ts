import {describe, expect, it} from '@jest/globals';

import {
  buildSocialBootstrap,
  isAllowedSocialNavigation,
  parseSocialMessage,
  resolveSocialAccess,
} from '../src/services/socialSessionService';

const memberAccount = {
  id: 'user-1',
  display_name: 'Ada',
  role: 'user',
  is_guest: false,
  avatar_url: 'https://radiotedu.com/avatar/user-1.png',
  email: 'private@example.com',
  access_token: 'must-not-cross-the-webview-boundary',
};

describe('mobile Social account foundation', () => {
  it('allows registered accounts and rejects guests or signed-out users', () => {
    expect(resolveSocialAccess(null)).toEqual({allowed: false, reason: 'login-required'});
    expect(resolveSocialAccess({...memberAccount, is_guest: true})).toEqual({
      allowed: false,
      reason: 'registered-account-required',
    });
    expect(resolveSocialAccess(memberAccount)).toEqual({allowed: true, reason: null});
  });

  it('builds a public account bootstrap without credentials or private fields', () => {
    const bootstrap = buildSocialBootstrap(memberAccount);

    expect(bootstrap).toEqual({
      type: 'radiotedu-account',
      version: 1,
      surface: 'social',
      account: {
        id: 'user-1',
        displayName: 'Ada',
        avatarUrl: 'https://radiotedu.com/avatar/user-1.png',
        role: 'member',
      },
    });
    expect(JSON.stringify(bootstrap)).not.toContain('private@example.com');
    expect(JSON.stringify(bootstrap)).not.toContain('must-not-cross-the-webview-boundary');
    expect(JSON.stringify(bootstrap)).not.toContain('access_token');
  });

  it('allows navigation only inside configured Social roots', () => {
    const roots = ['https://radiotedu.com/social/', 'http://127.0.0.1:4177/'];

    expect(isAllowedSocialNavigation('https://radiotedu.com/social/', roots)).toBe(true);
    expect(isAllowedSocialNavigation('https://radiotedu.com/social/room?room=welcome', roots)).toBe(true);
    expect(isAllowedSocialNavigation('http://127.0.0.1:4177/index.html', roots)).toBe(true);
    expect(isAllowedSocialNavigation('https://radiotedu.com/jukebox/', roots)).toBe(false);
    expect(isAllowedSocialNavigation('https://radiotedu.com/social-preview/', roots)).toBe(false);
    expect(isAllowedSocialNavigation('https://radiotedu.com.evil.example/social/', roots)).toBe(false);
    expect(isAllowedSocialNavigation('javascript:alert(1)', roots)).toBe(false);
  });

  it('accepts only the minimal Social-to-native message allowlist', () => {
    expect(parseSocialMessage('{"type":"radiotedu:social-ready"}')).toEqual({
      type: 'radiotedu:social-ready',
    });
    expect(parseSocialMessage('{"type":"radiotedu:request-account"}')).toEqual({
      type: 'radiotedu:request-account',
    });
    expect(parseSocialMessage('{"type":"radiotedu:navigate","url":"https://evil.example"}')).toBeNull();
    expect(parseSocialMessage('not-json')).toBeNull();
  });
});
