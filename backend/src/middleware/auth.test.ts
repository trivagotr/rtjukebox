import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { authMiddleware, JWT_AUDIENCE, JWT_ISSUER, JWT_SECRET, optionalAuth, verifyAccessToken } from './auth';

describe('JWT algorithm restrictions', () => {
  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('rejects a token signed with a non-HS256 algorithm', async () => {
    const app = express();
    app.get('/protected', authMiddleware, (_req, res) => res.sendStatus(204));
    const token = jwt.sign({ id: 'user-1', role: 'user' }, JWT_SECRET, { algorithm: 'HS384' });

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('accepts a correctly scoped HttpOnly access cookie', async () => {
    const app = express();
    app.get('/protected', authMiddleware, (_req, res) => res.sendStatus(204));
    const token = jwt.sign({ id: 'user-1', role: 'user' }, JWT_SECRET, {
      algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
    });

    const response = await request(app).get('/protected').set('Cookie', `rtj_access=${token}`);

    expect(response.status).toBe(204);
  });

  it('ignores invalid optional tokens without accepting their algorithm', async () => {
    const app = express();
    app.get('/public', optionalAuth, (req, res) => res.json({ authenticated: Boolean((req as any).user) }));
    const token = jwt.sign({ id: 'user-1', role: 'user' }, JWT_SECRET, { algorithm: 'HS384' });

    const response = await request(app).get('/public').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(false);
  });

  it('rejects a correctly signed access token with the wrong issuer or audience', () => {
    const wrongIssuer = jwt.sign({ id: 'user-1', role: 'user' }, JWT_SECRET, {
      algorithm: 'HS256', issuer: 'other-api', audience: JWT_AUDIENCE,
    });
    const wrongAudience = jwt.sign({ id: 'user-1', role: 'user' }, JWT_SECRET, {
      algorithm: 'HS256', issuer: JWT_ISSUER, audience: 'other-client',
    });

    expect(() => verifyAccessToken(wrongIssuer)).toThrow();
    expect(() => verifyAccessToken(wrongAudience)).toThrow();
  });
});
