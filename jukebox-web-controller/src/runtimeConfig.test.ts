import { describe, expect, it } from 'vitest';
import { resolveWebRuntimeConfig } from './runtimeConfig';

describe('web runtime config', () => {
  it('targets local backend and root socket path in development', () => {
    expect(
      resolveWebRuntimeConfig({
        windowOrigin: 'http://localhost:5173',
        windowProtocol: 'http:',
        windowHostname: 'localhost',
        isDev: true,
        baseUrl: '/',
      }),
    ).toEqual({
      apiRoot: 'http://localhost:3000',
      socketUrl: 'http://localhost:3000',
      socketPath: '/socket.io',
      publicBasePath: '',
    });
  });

  it('targets the jukebox subdirectory in production', () => {
    expect(
      resolveWebRuntimeConfig({
        windowOrigin: 'https://radiotedu.com',
        windowProtocol: 'https:',
        windowHostname: 'radiotedu.com',
        isDev: false,
        baseUrl: '/jukebox/',
      }),
    ).toEqual({
      apiRoot: 'https://radiotedu.com/jukebox',
      socketUrl: 'https://radiotedu.com',
      socketPath: '/jukebox/socket.io',
      publicBasePath: '/jukebox',
    });
  });
});
