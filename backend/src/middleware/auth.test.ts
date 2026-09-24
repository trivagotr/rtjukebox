import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { authMiddleware, JWT_SECRET, optionalAuth } from './auth';

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

  it('ignores invalid optional tokens without accepting their algorithm', async () => {
    const app = express();
    app.get('/public', optionalAuth, (req, res) => res.json({ authenticated: Boolean((req as any).user) }));
    const token = jwt.sign({ id: 'user-1', role: 'user' }, JWT_SECRET, { algorithm: 'HS384' });

    const response = await request(app).get('/public').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(false);
  });
});
