import { describe, expect, it } from 'vitest';
import { redactSensitiveUrl } from './redactUrl';

describe('redactSensitiveUrl', () => {
  it('redacts kiosk passwords and tokens from logged urls', () => {
    expect(redactSensitiveUrl('/api/v1/jukebox/kiosk/spotify-device-auth/start?device_id=device-1&device_pwd=1234&return_origin=http%3A%2F%2F127.0.0.1%3A3000')).toBe(
      '/api/v1/jukebox/kiosk/spotify-device-auth/start?device_id=device-1&device_pwd=%5BREDACTED%5D&return_origin=http%3A%2F%2F127.0.0.1%3A3000'
    );
    expect(redactSensitiveUrl('/callback?access_token=abc&refresh_token=def&password=secret')).toBe(
      '/callback?access_token=%5BREDACTED%5D&refresh_token=%5BREDACTED%5D&password=%5BREDACTED%5D'
    );
  });
});
