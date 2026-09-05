import express from 'express';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {afterEach, describe, expect, it} from 'vitest';
import {registerVotingWebRoutes} from './votingWebRoutes';

describe('voting web routes', () => {
  const servers: Array<{close(callback: (error?: Error) => void): void}> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => error ? reject(error) : resolve());
    })));
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})));
  });

  async function createDist() {
    const dir = await mkdtemp(path.join(tmpdir(), 'radiotedu-vote-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>RadioTEDU Vote</title>');
    await writeFile(path.join(dir, 'assets', 'app.js'), 'console.log("vote")');
    return dir;
  }

  function listen(app: express.Express) {
    const server = app.listen(0);
    servers.push(server);
    return (server.address() as AddressInfo).port;
  }

  it('serves the responsive voting app and immutable built assets', async () => {
    const app = express();
    registerVotingWebRoutes(app, {distPath: await createDist()});
    const port = listen(app);

    const page = await fetch(`http://127.0.0.1:${port}/vote/`);
    const asset = await fetch(`http://127.0.0.1:${port}/vote/assets/app.js`);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('RadioTEDU Vote');
    expect(page.headers.get('cache-control')).toContain('no-store');
    expect(await asset.text()).toContain('console.log');
    expect(asset.headers.get('cache-control')).toContain('immutable');
  });

  it('also serves the voting app below PUBLIC_BASE_PATH', async () => {
    const app = express();
    registerVotingWebRoutes(app, {distPath: await createDist(), publicBasePath: '/jukebox'});
    const port = listen(app);

    const response = await fetch(`http://127.0.0.1:${port}/jukebox/vote/?embed=1`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('RadioTEDU Vote');
  });
});
