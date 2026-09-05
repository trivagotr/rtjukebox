import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { NextFunction, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { PoolClient } from 'pg';
import { db } from '../db';
import type { AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';
import {
    currentWebCsrf,
    optionalWebAuthMiddleware,
    requireWebCsrf,
    webAuthMiddleware,
} from '../services/webSession';
import { enforceStudyAccess } from '../services/studyModerationAccess';
import { isRadioTeduSuperadmin } from '../services/superadmin';
import { sendError, sendSuccess } from '../utils/response';
import { rateLimitClientIpKey } from '../utils/networkAddress';

export const STUDY_ADMIN_CAPABILITIES = [
    'study.moderation.read',
    'study.moderation.ban',
    'study.moderation.unban',
    'study.moderation.reports',
    'study.moderation.audit',
] as const;

type StudyAdminCapability = typeof STUDY_ADMIN_CAPABILITIES[number];
type AdminRequest = AuthRequest & { requestId?: string };
type QueryClient = {
    query(text: string, params?: any[]): Promise<{ rows: any[] }>;
};

const REASONS = new Set(['harassment', 'spam', 'unsafe-profile', 'other']);
const REPORT_STATUSES = new Set(['open', 'resolved', 'dismissed', 'all']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
const ADMIN_INTENT_HEADER = 'moderation-console';
const ADMIN_PAGE_RETURN_TARGETS = new Set(['/study/admin.html', '/social/admin.html']);

class PublicError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) {
        super(message);
    }
}

function requestId(req: AdminRequest): string {
    if (!req.requestId) req.requestId = crypto.randomUUID();
    return req.requestId;
}

function withRequestId(req: AdminRequest, res: Response, next: NextFunction) {
    res.setHeader('X-Request-Id', requestId(req));
    res.setHeader('Cache-Control', 'no-store');
    next();
}

function fail(req: AdminRequest, res: Response, status: number, code: string, message: string) {
    return res.status(status).json({ success: false, error: message, code, requestId: requestId(req) });
}

function safeFailure(req: AdminRequest, res: Response, error: unknown) {
    if (error instanceof PublicError) return fail(req, res, error.status, error.code, error.message);
    const databaseCode = typeof error === 'object' && error ? String((error as { code?: unknown }).code ?? '') : '';
    const status = databaseCode === '23505' ? 409 : 500;
    const code = databaseCode === '23505' ? 'STUDY_MODERATION_CONFLICT' : 'STUDY_MODERATION_FAILED';
    console.error(JSON.stringify({
        event: 'study_moderation_request_failed',
        requestId: requestId(req),
        status,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        databaseCode: databaseCode || undefined,
    }));
    return fail(req, res, status, code, status === 409 ? 'The moderation resource changed.' : 'The moderation request could not be completed.');
}

function normalizeNote(value: unknown): string {
    if (typeof value !== 'string') throw new PublicError(422, 'INVALID_NOTE', 'A moderation note is required.');
    const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.length < 3 || normalized.length > 500) {
        throw new PublicError(422, 'INVALID_NOTE', 'The moderation note must contain 3 to 500 characters.');
    }
    return normalized;
}

function requireUuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new PublicError(422, 'INVALID_IDENTIFIER', `${field} is invalid.`);
    }
    return value.toLowerCase();
}

function requireReason(value: unknown): string {
    if (typeof value !== 'string' || !REASONS.has(value)) {
        throw new PublicError(422, 'INVALID_REASON', 'The moderation reason is invalid.');
    }
    return value;
}

function parseExpiry(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
        throw new PublicError(422, 'INVALID_EXPIRY', 'The ban expiry is invalid.');
    }
    const expiry = new Date(value);
    if (expiry.getTime() <= Date.now()) throw new PublicError(422, 'INVALID_EXPIRY', 'The ban expiry must be in the future.');
    return expiry.toISOString();
}

function asIso(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sessionMaxMinutes(): number {
    const configured = Number(process.env.STUDY_ADMIN_SESSION_MAX_MINUTES ?? 30);
    return Number.isFinite(configured) && configured >= 5 && configured <= 240 ? Math.floor(configured) : 30;
}

function sessionExpiry(req: AdminRequest): string {
    const token = req.user as (typeof req.user & { exp?: number; iat?: number });
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!token?.iat || !token.exp || token.exp <= nowSeconds || token.iat > nowSeconds + 60) {
        throw new PublicError(401, 'ADMIN_SESSION_STALE', 'A fresh RadioTEDU session is required.');
    }
    const freshnessExpiry = token.iat + sessionMaxMinutes() * 60;
    if (freshnessExpiry <= nowSeconds) throw new PublicError(401, 'ADMIN_SESSION_STALE', 'A fresh RadioTEDU session is required.');
    return new Date(Math.min(token.exp, freshnessExpiry) * 1000).toISOString();
}

async function capabilitiesFor(client: QueryClient, userId: string): Promise<StudyAdminCapability[]> {
    const result = await client.query(
        `SELECT capability
         FROM study_moderation_capabilities
         WHERE user_id = $1 AND revoked_at IS NULL
         ORDER BY capability`,
        [userId],
    );
    return result.rows.map((row) => row.capability).filter((value): value is StudyAdminCapability =>
        STUDY_ADMIN_CAPABILITIES.includes(value as StudyAdminCapability));
}

async function capabilitiesForRequest(client: QueryClient, req: AdminRequest): Promise<StudyAdminCapability[]> {
    if (isRadioTeduSuperadmin(req.user)) {
        const current = await client.query(
            `SELECT id, email, role FROM users
             WHERE id = $1 AND COALESCE(is_banned, FALSE) = FALSE`,
            [req.user!.id],
        );
        if (isRadioTeduSuperadmin(current.rows[0])) return [...STUDY_ADMIN_CAPABILITIES];
    }
    return capabilitiesFor(client, req.user!.id);
}

async function assertCapability(client: QueryClient, req: AdminRequest, capability: StudyAdminCapability) {
    if (!req.user?.id) throw new PublicError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    sessionExpiry(req);
    const capabilities = await capabilitiesForRequest(client, req);
    if (!capabilities.includes(capability)) {
        throw new PublicError(403, 'CAPABILITY_REQUIRED', 'The requested moderation capability is not available.');
    }
    return capabilities;
}

function requireCapability(capability: StudyAdminCapability) {
    return async (req: AdminRequest, res: Response, next: NextFunction) => {
        try {
            await assertCapability(db, req, capability);
            next();
        } catch (error) {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                console.warn(JSON.stringify({
                    event: 'study_moderation_denied',
                    requestId: requestId(req),
                    action: `${req.method} ${req.path}`,
                    authenticated: Boolean(req.user?.id),
                }));
            }
            safeFailure(req, res, error);
        }
    };
}

function requireAdminIntent(req: AdminRequest, res: Response, next: NextFunction) {
    if (req.get('X-Study-Admin-Intent') !== ADMIN_INTENT_HEADER) {
        return fail(req, res, 403, 'ADMIN_INTENT_REQUIRED', 'The moderation request was denied.');
    }
    next();
}

function requireFetchMetadata(req: AdminRequest, res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const fetchSite = req.get('Sec-Fetch-Site');
    if ((!fetchSite && !IS_TEST_ENV) || (fetchSite && fetchSite !== 'same-origin')) {
        return fail(req, res, 403, 'FETCH_METADATA_REQUIRED', 'The moderation request was denied.');
    }
    if (!req.is('application/json')) return fail(req, res, 422, 'JSON_REQUIRED', 'A JSON request body is required.');
    next();
}

function limiter(windowMs: number, max: number) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => `${(req as AdminRequest).user?.id ?? 'anonymous'}:${rateLimitClientIpKey(req.ip)}`,
        handler: (req, res) => fail(req as AdminRequest, res, 429, 'RATE_LIMITED', 'Too many moderation requests.'),
    });
}

const discoveryLimiter = limiter(60_000, Number(process.env.STUDY_ADMIN_SEARCH_RATE_LIMIT_PER_MINUTE ?? 60));
const mutationLimiter = limiter(60 * 60_000, Number(process.env.STUDY_ADMIN_BAN_RATE_LIMIT_PER_HOUR ?? 30));

function auditKey(): string {
    const key = String(process.env.STUDY_ADMIN_AUDIT_HMAC_KEY ?? '').trim();
    if (key) return key;
    if (IS_TEST_ENV) return 'test-study-audit-key';
    throw new PublicError(503, 'AUDIT_KEY_UNAVAILABLE', 'The moderation service is unavailable.');
}

type AuditInput = {
    action: 'ban-created' | 'ban-revoked' | 'ban-expired' | 'report-resolved' | 'report-dismissed';
    operatorUserId: string | null;
    targetUserId: string;
    banId?: string | null;
    reportId?: string | null;
    reason?: string | null;
    note: string;
    requestId: string;
    idempotencyKey?: string | null;
    expiresAt?: string | null;
};

async function appendAudit(client: PoolClient, input: AuditInput) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('radiotedu-study-moderation-audit'))");
    const previous = await client.query(
        `SELECT event_hash FROM study_moderation_audit_events ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    const previousHash = previous.rows[0]?.event_hash ?? null;
    const material = canonical({ ...input, previousHash });
    const eventHash = crypto.createHmac('sha256', auditKey()).update(material).digest('hex');
    const result = await client.query(
        `INSERT INTO study_moderation_audit_events
            (action, operator_user_id, target_user_id, ban_id, report_id, reason, note,
             request_id, idempotency_key, expires_at, previous_event_hash, event_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, created_at`,
        [
            input.action, input.operatorUserId, input.targetUserId, input.banId ?? null,
            input.reportId ?? null, input.reason ?? null, input.note, input.requestId,
            input.idempotencyKey ?? null, input.expiresAt ?? null, previousHash, eventHash,
        ],
    );
    return result.rows[0];
}

async function claimIdempotency(
    client: PoolClient,
    operatorUserId: string,
    action: string,
    key: string,
    body: unknown,
) {
    const hash = crypto.createHash('sha256').update(canonical(body)).digest('hex');
    const inserted = await client.query(
        `INSERT INTO study_moderation_idempotency
            (operator_user_id, action, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (operator_user_id, action, idempotency_key) DO NOTHING
         RETURNING id`,
        [operatorUserId, action, key, hash],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id as string, replay: null as unknown };
    const existing = await client.query(
        `SELECT id, request_hash, response_json, status_code
         FROM study_moderation_idempotency
         WHERE operator_user_id=$1 AND action=$2 AND idempotency_key=$3
         FOR UPDATE`,
        [operatorUserId, action, key],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== hash || !row.response_json || !row.status_code) {
        throw new PublicError(409, 'IDEMPOTENCY_CONFLICT', 'The idempotency key conflicts with another request.');
    }
    return { id: row.id as string, replay: row.response_json };
}

async function finishIdempotency(client: PoolClient, id: string, response: unknown, status = 200) {
    await client.query(
        `UPDATE study_moderation_idempotency
         SET response_json=$2::jsonb, status_code=$3, completed_at=NOW()
         WHERE id=$1`,
        [id, JSON.stringify(response), status],
    );
}

function mapUser(row: any) {
    return {
        userId: row.user_id,
        displayName: row.display_name,
        status: row.active_ban_id ? 'banned' : 'active',
        roomId: row.room_id ?? null,
        instanceId: row.instance_id ?? null,
        lastSeenAt: asIso(row.last_seen_at),
        openReportCount: Number(row.open_report_count ?? 0),
        activeBan: row.active_ban_id ? {
            id: row.active_ban_id,
            reason: row.ban_reason,
            note: row.ban_note,
            createdAt: asIso(row.ban_created_at),
            expiresAt: asIso(row.ban_expires_at),
            createdByDisplayName: row.ban_created_by_display_name,
        } : null,
    };
}

const USER_VIEW_SQL = `
    SELECT u.id AS user_id, u.display_name,
           p.room_id, p.instance_id, p.last_heartbeat_at AS last_seen_at,
           COALESCE(r.open_report_count, 0)::int AS open_report_count,
           b.id AS active_ban_id, b.reason AS ban_reason, b.note AS ban_note,
           b.created_at AS ban_created_at, b.expires_at AS ban_expires_at,
           creator.display_name AS ban_created_by_display_name
    FROM users u
    LEFT JOIN study_room_presence p ON p.user_id=u.id AND p.is_active=true
    LEFT JOIN (
        SELECT target_user_id, COUNT(*)::int AS open_report_count
        FROM study_player_reports WHERE status='open' GROUP BY target_user_id
    ) r ON r.target_user_id=u.id
    LEFT JOIN study_bans b ON b.target_user_id=u.id AND b.status='active'
        AND (b.expires_at IS NULL OR b.expires_at > NOW())
    LEFT JOIN users creator ON creator.id=b.created_by`;

async function loadUser(client: QueryClient, userId: string) {
    const result = await client.query(`${USER_VIEW_SQL} WHERE u.id=$1`, [userId]);
    if (!result.rows[0]) throw new PublicError(404, 'STUDY_USER_NOT_FOUND', 'The Study user was not found.');
    return mapUser(result.rows[0]);
}

function protectedUserIds(): Set<string> {
    return new Set(String(process.env.STUDY_PROTECTED_ACCOUNT_IDS ?? '')
        .split(',').map((value) => value.trim().toLowerCase()).filter((value) => UUID_PATTERN.test(value)));
}

async function expireBansInTransaction(client: PoolClient) {
    const expired = await client.query(
        `UPDATE study_bans SET status='expired'
         WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= NOW()
         RETURNING id, target_user_id, reason, expires_at`,
    );
    for (const row of expired.rows) {
        await appendAudit(client, {
            action: 'ban-expired', operatorUserId: null, targetUserId: row.target_user_id,
            banId: row.id, reason: row.reason, note: 'Expired by server policy.',
            requestId: crypto.randomUUID(), expiresAt: asIso(row.expires_at),
        });
    }
    return expired.rows;
}

export async function expireActiveStudyBans() {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const expired = await expireBansInTransaction(client);
        await client.query('COMMIT');
        if (expired.length) {
            const io = getIO();
            for (const row of expired) io?.to(`study:user:${row.target_user_id}`).emit('study:ban-expired', { userId: row.target_user_id });
        }
        return expired.length;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

export function startStudyModerationExpiryJob() {
    const timer = setInterval(() => {
        void expireActiveStudyBans().catch((error) => console.error(JSON.stringify({
            event: 'study_ban_expiry_failed',
            errorName: error instanceof Error ? error.name : 'UnknownError',
        })));
    }, 60_000);
    timer.unref();
}

export const studyAdminRoutes = express.Router();
studyAdminRoutes.use(withRequestId);
studyAdminRoutes.use(webAuthMiddleware);
studyAdminRoutes.use(requireAdminIntent);
studyAdminRoutes.use(requireFetchMetadata);
studyAdminRoutes.use(requireWebCsrf);

studyAdminRoutes.get('/session', discoveryLimiter, requireCapability('study.moderation.read'), async (req: AdminRequest, res) => {
    try {
        const user = await db.query('SELECT id, display_name FROM users WHERE id=$1', [req.user!.id]);
        if (!user.rows[0]) throw new PublicError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        const permissions = await capabilitiesForRequest(db, req);
        return sendSuccess(res, {
            operator: { id: user.rows[0].id, displayName: user.rows[0].display_name },
            permissions,
            expiresAt: sessionExpiry(req),
        });
    } catch (error) { return safeFailure(req, res, error); }
});

studyAdminRoutes.get('/overview', discoveryLimiter, requireCapability('study.moderation.read'), async (req: AdminRequest, res) => {
    try {
        const result = await db.query(`
            SELECT
              (SELECT COUNT(*)::int FROM study_room_presence WHERE is_active=true AND last_heartbeat_at >= NOW()-INTERVAL '90 seconds') AS online_users,
              (SELECT COUNT(*)::int FROM study_bans WHERE status='active' AND (expires_at IS NULL OR expires_at>NOW())) AS active_bans,
              (SELECT COUNT(*)::int FROM study_player_reports WHERE status='open') AS open_reports,
              (SELECT COUNT(*)::int FROM study_moderation_audit_events WHERE created_at>=CURRENT_DATE) AS actions_today`);
        const row = result.rows[0];
        return sendSuccess(res, {
            onlineUsers: Math.max(0, Number(row.online_users)),
            activeBans: Math.max(0, Number(row.active_bans)),
            openReports: Math.max(0, Number(row.open_reports)),
            actionsToday: Math.max(0, Number(row.actions_today)),
        });
    } catch (error) { return safeFailure(req, res, error); }
});

studyAdminRoutes.get('/users', discoveryLimiter, requireCapability('study.moderation.read'), async (req: AdminRequest, res) => {
    try {
        const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 80) : '';
        const status = typeof req.query.status === 'string' ? req.query.status : 'all';
        if (!['all', 'active', 'banned'].includes(status)) throw new PublicError(422, 'INVALID_STATUS', 'The user status filter is invalid.');
        const result = await db.query(
            `${USER_VIEW_SQL}
             WHERE (p.user_id IS NOT NULL OR r.open_report_count>0 OR b.id IS NOT NULL
                    OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.user_id=u.id))
               AND ($1='' OR u.display_name ILIKE '%'||$1||'%' OR u.id::text ILIKE '%'||$1||'%')
               AND ($2='all' OR ($2='banned' AND b.id IS NOT NULL) OR ($2='active' AND b.id IS NULL))
             ORDER BY u.display_name, u.id LIMIT 100`,
            [query, status],
        );
        return sendSuccess(res, result.rows.map(mapUser));
    } catch (error) { return safeFailure(req, res, error); }
});

studyAdminRoutes.get('/reports', discoveryLimiter, requireCapability('study.moderation.read'), async (req: AdminRequest, res) => {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : 'open';
        if (!REPORT_STATUSES.has(status)) throw new PublicError(422, 'INVALID_STATUS', 'The report status filter is invalid.');
        const result = await db.query(
            `SELECT r.id, r.target_user_id, target.display_name AS target_display_name,
                    reporter.display_name AS reporter_display_name, r.reason, r.room_id,
                    COALESCE(r.summary, 'Player report from shared Study room presence.') AS summary,
                    r.created_at, r.status
             FROM study_player_reports r
             JOIN users target ON target.id=r.target_user_id
             JOIN users reporter ON reporter.id=r.reporter_user_id
             WHERE ($1='all' OR r.status=$1)
             ORDER BY r.created_at DESC LIMIT 100`,
            [status],
        );
        return sendSuccess(res, result.rows.map((row) => ({
            id: row.id, targetUserId: row.target_user_id, targetDisplayName: row.target_display_name,
            reporterDisplayName: row.reporter_display_name, reason: row.reason, roomId: row.room_id,
            summary: row.summary, createdAt: asIso(row.created_at), status: row.status,
        })));
    } catch (error) { return safeFailure(req, res, error); }
});

studyAdminRoutes.get('/audit', discoveryLimiter, requireCapability('study.moderation.audit'), async (req: AdminRequest, res) => {
    try {
        const cursor = typeof req.query.cursor === 'string' && UUID_PATTERN.test(req.query.cursor) ? req.query.cursor : null;
        const result = await db.query(
            `SELECT a.id, a.action, actor.display_name AS actor_display_name,
                    target.id AS target_user_id, target.display_name AS target_display_name,
                    a.reason, a.note, a.created_at, a.expires_at,
                    COALESCE(a.idempotency_key, a.request_id) AS request_id
             FROM study_moderation_audit_events a
             LEFT JOIN users actor ON actor.id=a.operator_user_id
             JOIN users target ON target.id=a.target_user_id
             WHERE ($1::uuid IS NULL OR (a.created_at,a.id) < (
                 SELECT created_at,id FROM study_moderation_audit_events WHERE id=$1::uuid
             ))
             ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
            [cursor],
        );
        return sendSuccess(res, result.rows.map((row) => ({
            id: row.id, action: row.action, actorDisplayName: row.actor_display_name ?? 'RadioTEDU system',
            targetUserId: row.target_user_id, targetDisplayName: row.target_display_name,
            reason: row.reason, note: row.note, createdAt: asIso(row.created_at),
            expiresAt: asIso(row.expires_at), requestId: row.request_id,
        })));
    } catch (error) { return safeFailure(req, res, error); }
});

studyAdminRoutes.post('/bans', mutationLimiter, requireCapability('study.moderation.ban'), async (req: AdminRequest, res) => {
    const client = await db.pool.connect();
    try {
        const targetUserId = requireUuid(req.body?.targetUserId, 'targetUserId');
        const reason = requireReason(req.body?.reason);
        const note = normalizeNote(req.body?.note);
        const expiresAt = parseExpiry(req.body?.expiresAt);
        const idempotencyKey = requireUuid(req.body?.idempotencyKey, 'idempotencyKey');
        if (targetUserId === req.user!.id) throw new PublicError(422, 'SELF_BAN_FORBIDDEN', 'An operator cannot ban their own Study account.');
        await client.query('BEGIN');
        await assertCapability(client, req, 'study.moderation.ban');
        const claim = await claimIdempotency(client, req.user!.id, 'ban-create', idempotencyKey, { targetUserId, reason, note, expiresAt });
        if (claim.replay) { await client.query('COMMIT'); return sendSuccess(res, claim.replay); }
        await expireBansInTransaction(client);
        await client.query(
            `INSERT INTO study_moderation_profiles(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,
            [targetUserId],
        );
        const target = await client.query(
            `SELECT p.user_id, p.is_protected_service, u.display_name
             FROM study_moderation_profiles p JOIN users u ON u.id=p.user_id
             WHERE p.user_id=$1 FOR UPDATE OF p`,
            [targetUserId],
        );
        if (!target.rows[0]) throw new PublicError(404, 'STUDY_USER_NOT_FOUND', 'The Study user was not found.');
        if (target.rows[0].is_protected_service || protectedUserIds().has(targetUserId)) {
            throw new PublicError(422, 'PROTECTED_TARGET', 'The target account is protected.');
        }
        const active = await client.query(`SELECT 1 FROM study_bans WHERE target_user_id=$1 AND status='active'`, [targetUserId]);
        if (active.rows[0]) throw new PublicError(409, 'ACTIVE_BAN_EXISTS', 'The user already has an active Study ban.');
        const ban = await client.query(
            `INSERT INTO study_bans(target_user_id,reason,note,created_by,expires_at)
             VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,
            [targetUserId, reason, note, req.user!.id, expiresAt],
        );
        await client.query(
            `UPDATE study_sessions SET status='revoked', finished_at=COALESCE(finished_at,NOW()),
                    current_nonce_hash=$2, updated_at=NOW()
             WHERE user_id=$1 AND status='active'`,
            [targetUserId, crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex')],
        );
        await client.query(
            `UPDATE study_room_presence SET is_active=false, seat_id=NULL, updated_at=NOW() WHERE user_id=$1`,
            [targetUserId],
        );
        await client.query(
            `UPDATE study_seat_reservations SET is_active=false,released_at=COALESCE(released_at,NOW())
             WHERE user_id=$1 AND is_active=true`,
            [targetUserId],
        );
        const user = await loadUser(client, targetUserId);
        await appendAudit(client, {
            action: 'ban-created', operatorUserId: req.user!.id, targetUserId,
            banId: ban.rows[0].id, reason, note, requestId: requestId(req), idempotencyKey, expiresAt,
        });
        await finishIdempotency(client, claim.id, user);
        await client.query('COMMIT');
        getIO()?.to(`study:user:${targetUserId}`).emit('study:banned', { code: 'STUDY_BANNED', expiresAt });
        return sendSuccess(res, user);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return safeFailure(req, res, error);
    } finally { client.release(); }
});

studyAdminRoutes.post('/bans/:banId/revoke', mutationLimiter, requireCapability('study.moderation.unban'), async (req: AdminRequest, res) => {
    const client = await db.pool.connect();
    try {
        const banId = requireUuid(req.params.banId, 'banId');
        const targetUserId = requireUuid(req.body?.targetUserId, 'targetUserId');
        const note = normalizeNote(req.body?.note);
        const idempotencyKey = requireUuid(req.body?.idempotencyKey, 'idempotencyKey');
        await client.query('BEGIN');
        await assertCapability(client, req, 'study.moderation.unban');
        const claim = await claimIdempotency(client, req.user!.id, 'ban-revoke', idempotencyKey, { banId, targetUserId, note });
        if (claim.replay) { await client.query('COMMIT'); return sendSuccess(res, claim.replay); }
        const current = await client.query(
            `SELECT id,target_user_id,reason FROM study_bans
             WHERE id=$1 AND target_user_id=$2 AND status='active' FOR UPDATE`,
            [banId, targetUserId],
        );
        if (!current.rows[0]) throw new PublicError(409, 'ACTIVE_BAN_NOT_FOUND', 'The active Study ban was not found.');
        await client.query(
            `UPDATE study_bans SET status='revoked',revoked_by=$2,revoked_at=NOW(),revoke_note=$3 WHERE id=$1`,
            [banId, req.user!.id, note],
        );
        const user = await loadUser(client, targetUserId);
        await appendAudit(client, {
            action: 'ban-revoked', operatorUserId: req.user!.id, targetUserId, banId,
            reason: current.rows[0].reason, note, requestId: requestId(req), idempotencyKey,
        });
        await finishIdempotency(client, claim.id, user);
        await client.query('COMMIT');
        getIO()?.to(`study:user:${targetUserId}`).emit('study:ban-revoked', { userId: targetUserId });
        return sendSuccess(res, user);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return safeFailure(req, res, error);
    } finally { client.release(); }
});

studyAdminRoutes.patch('/reports/:reportId', mutationLimiter, requireCapability('study.moderation.reports'), async (req: AdminRequest, res) => {
    const client = await db.pool.connect();
    try {
        const reportId = requireUuid(req.params.reportId, 'reportId');
        const status = req.body?.status;
        if (status !== 'resolved' && status !== 'dismissed') throw new PublicError(422, 'INVALID_STATUS', 'The report status is invalid.');
        const note = normalizeNote(req.body?.note);
        const idempotencyKey = requireUuid(req.body?.idempotencyKey, 'idempotencyKey');
        await client.query('BEGIN');
        await assertCapability(client, req, 'study.moderation.reports');
        const claim = await claimIdempotency(client, req.user!.id, 'report-review', idempotencyKey, { reportId, status, note });
        if (claim.replay) { await client.query('COMMIT'); return sendSuccess(res, claim.replay); }
        const report = await client.query(
            `SELECT r.*,target.display_name AS target_display_name,reporter.display_name AS reporter_display_name
             FROM study_player_reports r
             JOIN users target ON target.id=r.target_user_id
             JOIN users reporter ON reporter.id=r.reporter_user_id
             WHERE r.id=$1 AND r.status='open' FOR UPDATE OF r`,
            [reportId],
        );
        if (!report.rows[0]) throw new PublicError(409, 'OPEN_REPORT_NOT_FOUND', 'The open Study report was not found.');
        const row = report.rows[0];
        await client.query(
            `UPDATE study_player_reports SET status=$2,reviewed_by=$3,reviewed_at=NOW(),review_note=$4 WHERE id=$1`,
            [reportId, status, req.user!.id, note],
        );
        const response = {
            id: row.id, targetUserId: row.target_user_id, targetDisplayName: row.target_display_name,
            reporterDisplayName: row.reporter_display_name, reason: row.reason, roomId: row.room_id,
            summary: row.summary ?? 'Player report from shared Study room presence.',
            createdAt: asIso(row.created_at), status,
        };
        await appendAudit(client, {
            action: status === 'resolved' ? 'report-resolved' : 'report-dismissed',
            operatorUserId: req.user!.id, targetUserId: row.target_user_id, reportId,
            reason: row.reason, note, requestId: requestId(req), idempotencyKey,
        });
        await finishIdempotency(client, claim.id, response);
        await client.query('COMMIT');
        return sendSuccess(res, response);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return safeFailure(req, res, error);
    } finally { client.release(); }
});

function safeScriptJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

type PublicWorld = 'study' | 'social';

function publicWorld(req: AdminRequest): PublicWorld {
    return req.query.public_path === 'social' ? 'social' : 'study';
}

function studyDistDirectory(world: PublicWorld): string {
    const configured = path.resolve(world === 'social'
        ? process.env.SOCIAL_DIST_DIR ?? 'C:/inetpub/wwwroot/social'
        : process.env.STUDY_DIST_DIR ?? 'C:/inetpub/wwwroot/study');
    const resolved = fs.realpathSync.native(configured);
    const releaseRoot = path.resolve(world === 'social' ? 'C:/inetpub/social-releases' : 'C:/inetpub/study-releases');
    if (!IS_TEST_ENV && resolved !== releaseRoot && !resolved.startsWith(`${releaseRoot}${path.sep}`)) {
        throw new Error(`${world.toUpperCase()}_DIST_DIR is outside the approved release root`);
    }
    return resolved;
}

function readStudyHtml(fileName: 'index.html' | 'admin.html', world: PublicWorld) {
    return fs.readFileSync(path.join(studyDistDirectory(world), fileName), 'utf8');
}

function injectBridge(html: string, publicScriptPath: string): string {
    const marker = /<script\s+type=["']module["']/i;
    if (!marker.test(html)) throw new Error('Study module script marker is missing');
    return html.replace(marker, `<script src="${publicScriptPath}"></script>\n    <script type="module"`);
}

function loginRedirect(returnTo: string) {
    return `/giris/?return_to=${encodeURIComponent(returnTo)}`;
}

function adminPageReturnTarget(req: AdminRequest): string {
    const requested = typeof req.query.return_to === 'string' ? req.query.return_to : '';
    return ADMIN_PAGE_RETURN_TARGETS.has(requested) ? requested : '/study/admin.html';
}

function bridgeRequestSource(csrf: string) {
    return `function(input,init){var u=new URL(input,location.origin);if(u.origin!==location.origin)return Promise.reject(new Error('CROSS_ORIGIN_REQUEST_BLOCKED'));var o=Object.assign({},init||{});var h=new Headers(o.headers||{});h.set('X-RadioTEDU-CSRF',${safeScriptJson(csrf)});o.headers=h;o.credentials='same-origin';return fetch(u.pathname+u.search,o)}`;
}

async function accountFor(req: AdminRequest) {
    if (!req.user?.id) throw new PublicError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    const result = await db.query(
        `SELECT u.id,u.display_name,COALESCE(p.spendable_points,0)::int AS global_points
         FROM users u LEFT JOIN user_points p ON p.user_id=u.id WHERE u.id=$1`,
        [req.user.id],
    );
    if (!result.rows[0]) throw new PublicError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return result.rows[0];
}

function javascriptHeaders(res: Response) {
    res.type('application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
}

function htmlHeaders(res: Response, admin = false) {
    res.type('html');
    res.setHeader('Cache-Control', admin ? 'no-store' : 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (admin) res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; form-action 'self'");
}

export const studyPageRoutes = express.Router();
studyPageRoutes.use(withRequestId);

studyPageRoutes.get('/game', optionalWebAuthMiddleware, async (req: AdminRequest, res) => {
    const world = publicWorld(req);
    if (!req.user?.id || !currentWebCsrf(req)) {
        htmlHeaders(res);
        return res.send(readStudyHtml('index.html', world));
    }
    try {
        await enforceStudyAccess(req, res, () => undefined);
        if (res.headersSent) return;
        await accountFor(req);
        htmlHeaders(res);
        return res.send(injectBridge(readStudyHtml('index.html', world), '/jukebox/api/v1/study/pages/game-bridge.js'));
    } catch (error) { return safeFailure(req, res, error); }
});

studyPageRoutes.get('/admin', optionalWebAuthMiddleware, async (req: AdminRequest, res) => {
    if (!req.user?.id || !currentWebCsrf(req)) return res.redirect(302, loginRedirect(adminPageReturnTarget(req)));
    try {
        htmlHeaders(res, true);
        await assertCapability(db, req, 'study.moderation.read');
        return res.send(injectBridge(readStudyHtml('admin.html', publicWorld(req)), '/jukebox/api/v1/study/pages/admin-bridge.js'));
    } catch (error) {
        if (error instanceof PublicError && error.status === 403) return res.status(404).send('Not Found');
        return safeFailure(req, res, error);
    }
});

studyPageRoutes.get('/game-bridge.js', webAuthMiddleware, async (req: AdminRequest, res) => {
    try {
        const csrf = currentWebCsrf(req);
        if (!csrf) throw new PublicError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        const account = await accountFor(req);
        javascriptHeaders(res);
        return res.send(`'use strict';window.RadioTEDUStudyBridge=Object.freeze({apiBase:'/jukebox/api/v1',account:Object.freeze({id:${safeScriptJson(account.id)},displayName:${safeScriptJson(account.display_name)},authenticated:true}),globalPoints:${Number(account.global_points)},request:${bridgeRequestSource(csrf)}});window.RadioTEDUStudyEntry=Object.freeze({loginUrl:'/giris/',registerUrl:'/kayit/',accountUrl:'/profilim/',logoutUrl:'/profilim/',helpUrl:'/iletisim/'});`);
    } catch (error) { return safeFailure(req, res, error); }
});

studyPageRoutes.get('/admin-bridge.js', webAuthMiddleware, async (req: AdminRequest, res) => {
    try {
        const csrf = currentWebCsrf(req);
        if (!csrf) throw new PublicError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        await assertCapability(db, req, 'study.moderation.read');
        javascriptHeaders(res);
        return res.send(`'use strict';window.RadioTEDUStudyAdminBridge=Object.freeze({apiBase:'/jukebox/api/v1/study/admin',request:${bridgeRequestSource(csrf)}});`);
    } catch (error) { return safeFailure(req, res, error); }
});
