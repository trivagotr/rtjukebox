import express from 'express';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { registerControllerWebRoutes } from './controllerWebRoutes';

describe('controller web routes', () => {
  const servers: Array<{ close: (callback: (error?: Error) => void) => void }> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve, reject) => server.close((error?: Error) => (error ? reject(error) : resolve())))
      )
    );
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createControllerDist() {
    const dir = await mkdtemp(path.join(tmpdir(), 'rtjukebox-controller-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>Temporary Jukebox</title>');
    return dir;
  }

  function listen(app: express.Express) {
    const server = app.listen(0);
    servers.push(server);
    return (server.address() as AddressInfo).port;
  }

  it('serves the controller page from the exact /jukebox alias without capturing jukebox API paths', async () => {
    const app = express();
    const controllerDistPath = await createControllerDist();

    registerControllerWebRoutes(app, {
      controllerDistPath,
      pageAliases: ['/jukebox'],
    });
    app.get('/jukebox/songs', (req, res) => res.json({ api: true }));

    const port = listen(app);
    const pageResponse = await fetch(`http://127.0.0.1:${port}/jukebox?device=FALLBACK1`);
    const apiResponse = await fetch(`http://127.0.0.1:${port}/jukebox/songs`);

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('Temporary Jukebox');
    await expect(apiResponse.json()).resolves.toEqual({ api: true });
  });

  it('serves the exact jukebox alias under PUBLIC_BASE_PATH', async () => {
    const app = express();
    const controllerDistPath = await createControllerDist();

    registerControllerWebRoutes(app, {
      controllerDistPath,
      pageAliases: ['/jukebox'],
      publicBasePath: '/radio',
    });

    const port = listen(app);
    const pageResponse = await fetch(`http://127.0.0.1:${port}/radio/jukebox?device=FALLBACK1`);

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('Temporary Jukebox');
  });
});
