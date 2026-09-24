import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
    pool: { query: vi.fn(), end: vi.fn() },
  },
}));

import { app } from '../server';
import { db } from '../db';
import { JWT_SECRET } from '../middleware/auth';

describe('HTTP API Integration Tests (supertest)', () => {
  it('GET /api/v1/health or utility returns 204 or expected status', async () => {
    const res = await request(app).get('/favicon.ico');
    expect(res.status).toBe(204);
  });

  describe('Auth HTTP Endpoints', () => {
    it('rejects POST /api/v1/auth/login with missing credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects POST /api/v1/auth/login when user not found', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ locked: false }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ locked: false }] } as any);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@radiotedu.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('rejects POST /api/v1/auth/register with unsupported email domain', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@unsupported-provider.xyz',
          password: 'password123',
          display_name: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unsupported email provider');
    });

    it('rejects POST /api/v1/auth/guest with empty display name', async () => {
      const res = await request(app)
        .post('/api/v1/auth/guest')
        .send({ display_name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Display name required');
    });
  });

  describe('RBAC & Auth Gating on Protected Endpoints', () => {
    it('returns 401 on protected route GET /api/v1/profile without token', async () => {
      const res = await request(app).get('/api/v1/profile');
      expect(res.status).toBe(401);
    });

    it('returns 401 on protected route GET /api/v1/profile with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', 'Bearer bad.token.here');
      expect(res.status).toBe(401);
    });

    it('returns 403 on admin-only route when accessed with user role token', async () => {
      const userToken = jwt.sign(
        { id: 'regular-user-id', email: 'user@radiotedu.com', role: 'user' },
        JWT_SECRET || 'test-jwt-secret-key'
      );

      const res = await request(app)
        .post('/api/v1/podcast-feeds')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ feed_url: 'https://example.com/rss' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/unauthorized|insufficient|forbidden/i);
    });
  });

  describe('CORS and Security Headers', () => {
    it('sets standard security headers via Helmet', async () => {
      const res = await request(app).get('/favicon.ico');
      expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(res.headers).toHaveProperty('x-frame-options');
    });

    it('allows credentialed cookie-auth requests from configured browser origins', async () => {
      const allowedOrigin = (process.env.CORS_ORIGINS || 'http://localhost').split(',')[0].trim();
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'x-auth-transport');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toContain('x-auth-transport');
    });
  });
});
