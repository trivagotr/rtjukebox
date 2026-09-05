import express from 'express';
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockClientQuery,
  mockClientRelease,
  mockPoolConnect,
  mockSocketEmit,
} = vi.hoisted(() => {
  const clientQuery = vi.fn();
  return {
    mockDbQuery: vi.fn(),
    mockClientQuery: clientQuery,
    mockClientRelease: vi.fn(),
    mockPoolConnect: vi.fn(),
    mockSocketEmit: vi.fn(),
  };
});

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: { connect: mockPoolConnect },
  },
}));

vi.mock('../services/webSession', () => ({
  currentWebCsrf: () => 'csrf-test-token',
  optionalWebAuthMiddleware: (req: any, _res: any, next: any) => {
    if (req.get('X-Test-Anonymous') !== '1') {
      req.user = { id: '11111111-1111-4111-8111-111111111111', email: 'operator@example.invalid', role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
    }
    next();
  },
  requireWebCsrf: (_req: any, _res: any, next: any) => next(),
  webAuthMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: '11111111-1111-4111-8111-111111111111', email: 'operator@example.invalid', role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
    next();
  },
}));

vi.mock('../socket', () => ({
  getIO: () => ({ to: () => ({ emit: mockSocketEmit }) }),
}));

import { studyAdminRoutes, studyPageRoutes } from './studyAdmin';

const operatorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const banId = '33333333-3333-4333-8333-333333333333';
const reportId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '55555555-5555-4555-8555-555555555555';
const capabilities = [
  'study.moderation.read',
  'study.moderation.ban',
  'study.moderation.unban',
  'study.moderation.reports',
  'study.moderation.audit',
];

function capabilityRows() {
  return { rows: capabilities.map((capability) => ({ capability })) };
}

function jsonResponse(res: globalThis.Response) {
  return res.json() as Promise<any>;
}

describe('Study moderation admin contract', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.STUDY_ADMIN_AUDIT_HMAC_KEY = 'unit-test-audit-key';
    process.env.SOCIAL_DIST_DIR = process.env.STUDY_DIST_DIR ?? 'C:/inetpub/wwwroot/study';
    mockDbQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockReset();
    mockPoolConnect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
    mockSocketEmit.mockReset();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  async function request(path: string, init: RequestInit = {}) {
    const app = express();
    app.use(express.json());
    app.use('/admin', studyAdminRoutes);
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}/admin${path}`, {
      ...init,
      headers: {
        'X-Study-Admin-Intent': 'moderation-console',
        ...(init.body ? { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' } : {}),
        ...init.headers,
      },
    });
  }

  async function pageRequest(path: string, init: RequestInit = {}) {
    const app = express();
    app.use('/pages', studyPageRoutes);
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}/pages${path}`, { redirect: 'manual', ...init });
  }

  it('serves the locked Study entry while keeping moderation behind login', async () => {
    const game = await pageRequest('/game', { headers: { 'X-Test-Anonymous': '1' } });
    const socialGame = await pageRequest('/game?public_path=social', { headers: { 'X-Test-Anonymous': '1' } });
    const admin = await pageRequest('/admin', { headers: { 'X-Test-Anonymous': '1' } });
    const socialAdmin = await pageRequest('/admin?return_to=%2Fsocial%2Fadmin.html', { headers: { 'X-Test-Anonymous': '1' } });
    const unsafeAdmin = await pageRequest('/admin?return_to=https%3A%2F%2Fexample.invalid%2F', { headers: { 'X-Test-Anonymous': '1' } });
    const gameHtml = await game.text();

    expect(game.status).toBe(200);
    expect(socialGame.status).toBe(200);
    expect(game.headers.get('location')).toBeNull();
    expect(gameHtml).toContain('<div id="game-ui"');
    expect(gameHtml).not.toContain('/jukebox/api/v1/study/pages/game-bridge.js');
    expect(admin.status).toBe(302);
    expect(admin.headers.get('location')).toBe('/giris/?return_to=%2Fstudy%2Fadmin.html');
    expect(socialAdmin.headers.get('location')).toBe('/giris/?return_to=%2Fsocial%2Fadmin.html');
    expect(unsafeAdmin.headers.get('location')).toBe('/giris/?return_to=%2Fstudy%2Fadmin.html');
  });

  it('publishes only live same-origin account destinations in the game bridge', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: operatorId, display_name: 'Operator', global_points: 25 }] });

    const response = await pageRequest('/game-bridge.js');
    const source = await response.text();

    expect(response.status).toBe(200);
    expect(source).toContain("loginUrl:'/giris/'");
    expect(source).toContain("registerUrl:'/kayit/'");
    expect(source).toContain("accountUrl:'/profilim/'");
    expect(source).toContain("logoutUrl:'/profilim/'");
    expect(source).toContain("helpUrl:'/iletisim/'");
    expect(source).not.toContain("loginUrl:'/login/'");
  });

  it('returns a sanitized session with only allow-listed capabilities', async () => {
    mockDbQuery
      .mockResolvedValueOnce(capabilityRows())
      .mockResolvedValueOnce({ rows: [{ id: operatorId, display_name: 'Operator' }] })
      .mockResolvedValueOnce({ rows: [...capabilityRows().rows, { capability: 'site.super-admin' }] });

    const response = await request('/session');
    const body = await jsonResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.operator).toEqual({ id: operatorId, displayName: 'Operator' });
    expect(body.data.permissions).toEqual(capabilities);
    expect(body.data).not.toHaveProperty('email');
  });

  it('denies by default when the exact capability is absent', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request('/overview');
    const body = await jsonResponse(response);

    expect(response.status).toBe(403);
    expect(body.code).toBe('CAPABILITY_REQUIRED');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows read-only discovery but denies a direct ban mutation without the exact capability', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ capability: 'study.moderation.read' }] });

    const response = await request('/bans', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: targetId, reason: 'spam', note: 'Denied read-only mutation.', expiresAt: null, idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(403);
    expect(body.code).toBe('CAPABILITY_REQUIRED');
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it('conceals the admin console with a no-store 404 when moderation read is absent', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const response = await pageRequest('/admin');
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(body).toBe('Not Found');
  });

  it('creates a Study-only ban transaction and invalidates only Study state', async () => {
    mockDbQuery.mockResolvedValueOnce(capabilityRows());
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM study_moderation_capabilities')) return capabilityRows();
      if (sql.includes('INSERT INTO study_moderation_idempotency')) return { rows: [{ id: 'idem-1' }] };
      if (sql.includes("UPDATE study_bans SET status='expired'")) return { rows: [] };
      if (sql.includes('INSERT INTO study_moderation_profiles')) return { rows: [] };
      if (sql.includes('FROM study_moderation_profiles')) return { rows: [{ user_id: targetId, is_protected_service: false, display_name: 'Target' }] };
      if (sql.includes("SELECT 1 FROM study_bans")) return { rows: [] };
      if (sql.includes('INSERT INTO study_bans')) return { rows: [{ id: banId, created_at: new Date() }] };
      if (sql.includes('SELECT u.id AS user_id')) return { rows: [{
        user_id: targetId,
        display_name: 'Target',
        room_id: null,
        instance_id: null,
        last_seen_at: new Date(),
        open_report_count: 0,
        active_ban_id: banId,
        ban_reason: 'spam',
        ban_note: 'Repeated Study chat flooding.',
        ban_created_at: new Date(),
        ban_expires_at: null,
        ban_created_by_display_name: 'Operator',
      }] };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT event_hash')) return { rows: [] };
      if (sql.includes('INSERT INTO study_moderation_audit_events')) return { rows: [{ id: 'audit-1', created_at: new Date() }] };
      if (sql.includes('UPDATE study_moderation_idempotency')) return { rows: [] };
      if (sql.includes('UPDATE study_sessions') || sql.includes('UPDATE study_room_presence') || sql.includes('UPDATE study_seat_reservations')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request('/bans', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: targetId, reason: 'spam', note: 'Repeated Study chat flooding.', expiresAt: null, idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual(expect.objectContaining({ userId: targetId, status: 'banned' }));
    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('UPDATE study_sessions');
    expect(sql).toContain('UPDATE study_room_presence');
    expect(sql).toContain('UPDATE study_seat_reservations');
    expect(sql).toContain('INSERT INTO study_moderation_audit_events');
    expect(sql).not.toContain('UPDATE users SET is_banned');
    expect(mockSocketEmit).toHaveBeenCalledWith('study:banned', expect.objectContaining({ code: 'STUDY_BANNED' }));
  });

  it('replays an identical completed ban without a second ban or audit mutation', async () => {
    mockDbQuery.mockResolvedValueOnce(capabilityRows());
    let requestHash = '';
    mockClientQuery.mockImplementation(async (sql: string, parameters?: any[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM study_moderation_capabilities')) return capabilityRows();
      if (sql.includes('INSERT INTO study_moderation_idempotency')) {
        requestHash = String(parameters?.[3]);
        return { rows: [] };
      }
      if (sql.includes('FROM study_moderation_idempotency')) return { rows: [{
        id: 'existing-idem',
        request_hash: requestHash,
        response_json: { userId: targetId, status: 'banned' },
        status_code: 200,
      }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request('/bans', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: targetId, reason: 'spam', note: 'Repeated Study chat flooding.', expiresAt: null, idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ userId: targetId, status: 'banned' });
    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).not.toContain('INSERT INTO study_bans');
    expect(sql).not.toContain('INSERT INTO study_moderation_audit_events');
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it('returns a conflict for a different ban while the target already has an active ban', async () => {
    mockDbQuery.mockResolvedValueOnce(capabilityRows());
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM study_moderation_capabilities')) return capabilityRows();
      if (sql.includes('INSERT INTO study_moderation_idempotency')) return { rows: [{ id: 'idem-concurrent' }] };
      if (sql.includes("UPDATE study_bans SET status='expired'")) return { rows: [] };
      if (sql.includes('INSERT INTO study_moderation_profiles')) return { rows: [] };
      if (sql.includes('FROM study_moderation_profiles')) return { rows: [{ user_id: targetId, is_protected_service: false, display_name: 'Target' }] };
      if (sql.includes('SELECT 1 FROM study_bans')) return { rows: [{ '?column?': 1 }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request('/bans', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: targetId, reason: 'harassment', note: 'A different concurrent request.', expiresAt: null, idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(409);
    expect(body.code).toBe('ACTIVE_BAN_EXISTS');
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('revokes only the active Study ban and preserves history through a new audit event', async () => {
    mockDbQuery.mockResolvedValueOnce(capabilityRows());
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM study_moderation_capabilities')) return capabilityRows();
      if (sql.includes('INSERT INTO study_moderation_idempotency')) return { rows: [{ id: 'idem-revoke' }] };
      if (sql.includes('FROM study_bans') && sql.includes("status='active'")) return { rows: [{ id: banId, target_user_id: targetId, reason: 'spam' }] };
      if (sql.includes("UPDATE study_bans SET status='revoked'")) return { rows: [] };
      if (sql.includes('SELECT u.id AS user_id')) return { rows: [{
        user_id: targetId,
        display_name: 'Target',
        room_id: null,
        instance_id: null,
        last_seen_at: new Date(),
        open_report_count: 0,
        active_ban_id: null,
        ban_reason: null,
        ban_note: null,
        ban_created_at: null,
        ban_expires_at: null,
        ban_created_by_display_name: null,
      }] };
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('SELECT event_hash')) return { rows: [] };
      if (sql.includes('INSERT INTO study_moderation_audit_events')) return { rows: [{ id: 'audit-revoke', created_at: new Date() }] };
      if (sql.includes('UPDATE study_moderation_idempotency')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request(`/bans/${banId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId: targetId, note: 'Reviewed and restored Study access.', idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual(expect.objectContaining({ userId: targetId, status: 'active' }));
    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain("UPDATE study_bans SET status='revoked'");
    expect(sql).toContain('INSERT INTO study_moderation_audit_events');
    expect(sql).not.toContain('DELETE FROM study_bans');
    expect(mockSocketEmit).toHaveBeenCalledWith('study:ban-revoked', { userId: targetId });
  });

  it('resolves a report without creating a ban', async () => {
    mockDbQuery.mockResolvedValueOnce(capabilityRows());
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM study_moderation_capabilities')) return capabilityRows();
      if (sql.includes('INSERT INTO study_moderation_idempotency')) return { rows: [{ id: 'idem-report' }] };
      if (sql.includes('FROM study_player_reports r')) return { rows: [{
        id: reportId,
        target_user_id: targetId,
        target_display_name: 'Target',
        reporter_display_name: 'Reporter',
        reason: 'harassment',
        room_id: 'library',
        summary: 'Unwanted messages.',
        created_at: new Date(),
      }] };
      if (sql.includes('UPDATE study_player_reports')) return { rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT event_hash')) return { rows: [] };
      if (sql.includes('INSERT INTO study_moderation_audit_events')) return { rows: [{ id: 'audit-report' }] };
      if (sql.includes('UPDATE study_moderation_idempotency')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request(`/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', note: 'Reviewed against the room report.', idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('resolved');
    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('UPDATE study_player_reports');
    expect(sql).not.toContain('INSERT INTO study_bans');
  });

  it('rejects a reused idempotency key with a different request body', async () => {
    mockDbQuery.mockResolvedValueOnce(capabilityRows());
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM study_moderation_capabilities')) return capabilityRows();
      if (sql.includes('INSERT INTO study_moderation_idempotency')) return { rows: [] };
      if (sql.includes('FROM study_moderation_idempotency')) return { rows: [{
        id: 'existing-idem', request_hash: 'different-hash', response_json: { userId: targetId }, status_code: 200,
      }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request('/bans', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: targetId, reason: 'spam', note: 'Repeated Study chat flooding.', expiresAt: null, idempotencyKey }),
    });
    const body = await jsonResponse(response);

    expect(response.status).toBe(409);
    expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
