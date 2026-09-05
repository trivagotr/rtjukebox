import express from 'express';
import {mkdtemp, rm, writeFile} from 'fs/promises';
import {AddressInfo} from 'net';
import {tmpdir} from 'os';
import path from 'path';
import {afterEach, describe, expect, it} from 'vitest';
import {registerVotingPublicAssetRoutes} from './votingPublicAssets';

describe('voting public assets', () => {
  const servers: Array<{close: (callback: (error?: Error) => void) => void}> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => error ? reject(error) : resolve());
    })));
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, {recursive: true, force: true})));
  });

  it.each([
    '/uploads/next-song-voting/fallback.png',
    '/jukebox/uploads/next-song-voting/fallback.png',
  ])('serves a real PNG at %s', async (requestPath) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'voting-fallback-'));
    tempDirs.push(dir);
    const logoPath = path.join(dir, 'fallback.png');
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await writeFile(logoPath, pngMagic);

    const app = express();
    registerVotingPublicAssetRoutes(app, {fallbackLogoPath: logoPath, publicBasePath: '/jukebox'});
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}${requestPath}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\/png\b/);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 8)).toEqual(pngMagic);
  });

  it('fails at registration without exposing a filesystem path to an HTTP client', () => {
    const app = express();
    expect(() => registerVotingPublicAssetRoutes(app, {
      fallbackLogoPath: path.join(tmpdir(), 'does-not-exist-voting-fallback.png'),
    })).toThrow('Voting fallback asset is unavailable');
  });
});
