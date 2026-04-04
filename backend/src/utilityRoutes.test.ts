import express from 'express';
import { AddressInfo } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { registerUtilityRoutes } from './utilityRoutes';

describe('utility routes', () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(async () => {
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

    expect(faviconResponse.status).toBe(204);
    expect(chromeDevtoolsResponse.status).toBe(204);
  });
});
