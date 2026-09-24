import express from 'express';
import { AddressInfo } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { registerUtilityRoutes } from './utilityRoutes';

describe('utility routes', () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(async () => {
    delete process.env.HEALTHCHECK_TOKEN;
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve, reject) => server.close((error?: Error) => (error ? reject(error) : resolve())))
      )
    );
  });

  it('returns no-content for browser utility asset requests', async () => {
    const app = express();
    registerUtilityRoutes(app);

    const server = app.listen(0);
    servers.push(server);

    const { port } = server.address() as AddressInfo;
    const faviconResponse = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
    const chromeDevtoolsResponse = await fetch(
      `http://127.0.0.1:${port}/.well-known/appspecific/com.chrome.devtools.json`
    );
    const liveResponse = await fetch(`http://127.0.0.1:${port}/health/live`);
    const unauthenticatedReadyResponse = await fetch(`http://127.0.0.1:${port}/health/ready`);

    expect(faviconResponse.status).toBe(204);
    expect(chromeDevtoolsResponse.status).toBe(204);
    expect(liveResponse.status).toBe(200);
    expect(await liveResponse.json()).toEqual({ status: 'ok' });
    expect(unauthenticatedReadyResponse.status).toBe(404);

    process.env.HEALTHCHECK_TOKEN = 'test-health-token';
    const readyResponse = await fetch(`http://127.0.0.1:${port}/health/ready`, {
      headers: { Authorization: 'Bearer test-health-token' },
    });
    expect([200, 503]).toContain(readyResponse.status);
    expect(await readyResponse.text()).not.toMatch(/database|redis|uploads|error/i);
  });
});
