import { describe, expect, it } from '@jest/globals';
import { resolveApiConfig } from '../src/services/config';

describe('mobile api config', () => {
  it('targets the local backend in development mode', () => {
    expect(resolveApiConfig(true)).toEqual({
      serverOrigin: 'http://127.0.0.1:3000',
      baseApi: 'http://127.0.0.1:3000/api/v1',
      storageApi: 'http://127.0.0.1:3000',
      socketOrigin: 'http://127.0.0.1:3000',
      socketPath: '/socket.io',
    });
  });

  it('targets production in release mode', () => {
    expect(resolveApiConfig(false)).toEqual({
      serverOrigin: 'https://radiotedu.com/jukebox',
      baseApi: 'https://radiotedu.com/jukebox/api/v1',
      storageApi: 'https://radiotedu.com/jukebox',
      socketOrigin: 'https://radiotedu.com',
      socketPath: '/jukebox/socket.io',
    });
  });
});
