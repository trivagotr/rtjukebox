import { createHmac } from 'node:crypto';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminRouter } from './admin.router.js';
import type { AdminAuditRepository } from './ports/admin-audit.repository.js';

const secret = 'a'.repeat(32);
const servers: Array<ReturnType<express.Express['listen']>> = [];

function token(role: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: '00000000-0000-4000-8000-000000000001', role, iss: 'test-issuer', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 60 });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function serveAdminRoute() {
  const app = express();
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AdminAuditRepository;
  const admin = createAdminRouter(secret, 'test-issuer', 'test-client', false, audit);
  admin.get('/probe', (_req, res) => res.json({ ok: true }));
  app.use('/api/v1/admin', admin);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to bind');
  return { url: `http://127.0.0.1:${address.port}/api/v1/admin/probe`, audit };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

describe('central admin router guard', () => {
  it('rejects requests without authentication', async () => {
    const { url } = await serveAdminRoute();
    const response = await fetch(url);
    expect(response.status).toBe(401);
  });

  it('rejects an authenticated non-admin', async () => {
    const { url } = await serveAdminRoute();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token('user')}` } });
    expect(response.status).toBe(403);
  });

  it('allows an admin and records the action', async () => {
    const { url, audit } = await serveAdminRoute();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token('admin')}` } });
    expect(response.status).toBe(200);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ userId: '00000000-0000-4000-8000-000000000001', action: 'HTTP_GET' }));
  });
});
