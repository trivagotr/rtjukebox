import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveErpReturnUri } from './erpIdentity';

const keys = [
  'ERP_SSO_BASE_URL',
  'ERP_SSO_CLIENT_ID',
  'ERP_SSO_REDIRECT_URI',
  'ERP_LINK_TOKEN_ENCRYPTION_KEY',
  'ERP_LOGIN_RETURN_URIS',
] as const;

describe('ERP identity return URI policy', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    keys.forEach((key) => previous.set(key, process.env[key]));
    process.env.ERP_SSO_BASE_URL = 'https://radiotedu.com/erp';
    process.env.ERP_SSO_CLIENT_ID = 'test-client';
    process.env.ERP_SSO_REDIRECT_URI = 'https://radiotedu.com/jukebox/api/v1/auth/erp-link/callback';
    process.env.ERP_LINK_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    process.env.ERP_LOGIN_RETURN_URIS = 'radiotedu://auth/erp/linked';
  });

  afterEach(() => {
    keys.forEach((key) => {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it('allows the static Study-owned account callback', () => {
    expect(resolveErpReturnUri('https://radiotedu.com/study/auth-callback.html'))
      .toBe('https://radiotedu.com/study/auth-callback.html');
    expect(resolveErpReturnUri('https://www.radiotedu.com/study/auth-callback.html'))
      .toBe('https://www.radiotedu.com/study/auth-callback.html');
  });

  it('allows the static Social-owned account callback', () => {
    expect(resolveErpReturnUri('https://radiotedu.com/social/auth-callback.html'))
      .toBe('https://radiotedu.com/social/auth-callback.html');
    expect(resolveErpReturnUri('https://www.radiotedu.com/social/auth-callback.html'))
      .toBe('https://www.radiotedu.com/social/auth-callback.html');
  });

  it('rejects unlisted Study return targets', () => {
    expect(() => resolveErpReturnUri('https://radiotedu.com/study/anything-else.html'))
      .toThrow('ERP login return URI is not allowed');
  });
});
