import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { PoolClient } from 'pg';
import { db } from '../db';
import type { AuthRequest } from '../middleware/auth';
import { adminAdjustGold } from '../services/economy';
import { isRadioTeduSuperadmin } from '../services/superadmin';
import { requireWebCsrf, webAuthMiddleware } from '../services/webSession';
import { sendError, sendSuccess } from '../utils/response';
import { normalizeClientIp, rateLimitClientIpKey } from '../utils/networkAddress';

const router = Router();
const ADMIN_COOKIE = 'rt_gold_admin';
const ADMIN_CSRF_COOKIE = 'rt_gold_admin_csrf';
const SESSION_SECONDS = 4 * 60 * 60;

type GoldAdminRequest = AuthRequest & {
    goldAdminIdentifier?: string;
    goldAdminSessionId?: string;
    goldAdminCsrfHash?: string;
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 8,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => rateLimitClientIpKey(req.ip),
});

const adminMutationLimiter = rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: GoldAdminRequest) => req.goldAdminSessionId ?? 'unauthenticated-admin',
});

function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieMap(req: Request): Record<string, string> {
    return String(req.headers.cookie ?? '').split(';').reduce<Record<string, string>>((out, part) => {
        const separator = part.indexOf('=');
        if (separator < 1) return out;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
        return out;
    }, {});
}

function cookie(name: string, value: string, httpOnly: boolean, maxAge: number): string {
    const secure = process.env.NODE_ENV !== 'test' && process.env.WEB_COOKIE_SECURE !== 'false';
    return [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        `Max-Age=${maxAge}`,
        'SameSite=Strict',
        secure ? 'Secure' : '',
        httpOnly ? 'HttpOnly' : '',
    ].filter(Boolean).join('; ');
}

export function resolveGoldAdminAuditKey(env: NodeJS.ProcessEnv = process.env): string {
    const explicit = String(env.GOLD_ADMIN_AUDIT_HMAC_KEY ?? '').trim();
    if (explicit.length >= 32) return explicit;
    const jwtSecret = String(env.JWT_SECRET ?? '').trim();
    return jwtSecret
        ? crypto.createHmac('sha256', jwtSecret).update('radiotedu:gold-admin:audit:v1').digest('hex')
        : '';
}

function configuredAdmin() {
    return {
        identifier: String(process.env.GOLD_ADMIN_IDENTIFIER ?? '').trim().toLowerCase(),
        passwordHash: String(process.env.GOLD_ADMIN_PASSWORD_HASH ?? '').trim(),
        auditKey: resolveGoldAdminAuditKey(),
    };
}

function trustedOrigin(req: Request): boolean {
    const origin = String(req.get('origin') ?? '').replace(/\/$/, '');
    if (process.env.NODE_ENV === 'test' && !origin) return true;
    return origin === 'https://radiotedu.com' || origin === 'https://www.radiotedu.com';
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

async function appendAudit(
    client: Pick<PoolClient, 'query'>,
    params: {
        adminIdentifier: string;
        action: string;
        requestId: string;
        targetUserId?: string | null;
        reason?: string | null;
        metadata?: Record<string, unknown>;
    },
) {
    const { auditKey } = configuredAdmin();
    if (auditKey.length < 32) throw new Error('GOLD_ADMIN_AUDIT_KEY_NOT_CONFIGURED');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('radiotedu_gold_admin_audit'))`);
    const previous = await client.query(
        `SELECT event_hash FROM gold_admin_audit_events ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
    );
    const previousHash = previous.rows[0]?.event_hash ?? null;
    const payload = {
        admin_identifier: params.adminIdentifier,
        action: params.action,
        request_id: params.requestId,
        target_user_id: params.targetUserId ?? null,
        reason: params.reason ?? null,
        metadata: params.metadata ?? {},
        previous_event_hash: previousHash,
    };
    const eventHash = crypto.createHmac('sha256', auditKey).update(stableJson(payload)).digest('hex');
    await client.query(
        `INSERT INTO gold_admin_audit_events (
            admin_identifier, action, target_user_id, request_id, reason, metadata,
            previous_event_hash, event_hash
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
            params.adminIdentifier,
            params.action,
            params.targetUserId ?? null,
            params.requestId,
            params.reason ?? null,
            JSON.stringify(params.metadata ?? {}),
            previousHash,
            eventHash,
        ],
    );
}

async function requireUnusedAdminRequest(client: Pick<PoolClient, 'query'>, requestId: string) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('radiotedu_gold_admin_audit'))`);
    const existing = await client.query(
        'SELECT id FROM gold_admin_audit_events WHERE request_id = $1 LIMIT 1',
        [requestId],
    );
    if (existing.rows[0]) throw new Error('GOLD_ADMIN_REQUEST_REPLAY');
}

async function requireAdmin(req: GoldAdminRequest, res: Response, next: NextFunction) {
    const token = cookieMap(req)[ADMIN_COOKIE] ?? '';
    if (!token) return sendError(res, 'Gold admin session required', 401);
    const result = await db.query(
        `SELECT id, admin_identifier, csrf_hash, user_agent FROM gold_admin_sessions
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
         LIMIT 1`,
        [sha256(token)],
    );
    if (!result.rows[0]) return sendError(res, 'Gold admin session expired', 401);
    req.goldAdminIdentifier = String(result.rows[0].admin_identifier);
    req.goldAdminSessionId = String(result.rows[0].id);
    req.goldAdminCsrfHash = String(result.rows[0].csrf_hash);
    if (String(result.rows[0].user_agent ?? '') !== String(req.get('user-agent') ?? '').slice(0, 500)) {
        return sendError(res, 'Gold admin session device mismatch', 401);
    }
    return next();
}

function requireAdminCsrf(req: GoldAdminRequest, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
    if (!trustedOrigin(req)) return sendError(res, 'Untrusted Gold admin origin', 403);
    const expected = cookieMap(req)[ADMIN_CSRF_COOKIE] ?? '';
    const actual = String(req.get('X-RadioTEDU-Gold-Admin-CSRF') ?? '');
    if (!expected || expected.length !== actual.length) return sendError(res, 'Gold admin CSRF failed', 403);
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
        return sendError(res, 'Gold admin CSRF failed', 403);
    }
    const storedHash = req.goldAdminCsrfHash ?? '';
    const actualHash = sha256(actual);
    if (!storedHash || storedHash.length !== actualHash.length
        || !crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(actualHash))) {
        return sendError(res, 'Gold admin CSRF failed', 403);
    }
    return next();
}

async function issueAdminSession(
    req: GoldAdminRequest,
    res: Response,
    identifier: string,
    authMethod: 'password' | 'radiotedu-account',
) {
    const token = crypto.randomBytes(48).toString('base64url');
    const csrf = crypto.randomBytes(32).toString('base64url');
    const requestId = crypto.randomUUID();
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE gold_admin_sessions SET revoked_at = NOW()
             WHERE admin_identifier = $1 AND revoked_at IS NULL`,
            [identifier],
        );
        await client.query(
            `INSERT INTO gold_admin_sessions (
                admin_identifier, token_hash, csrf_hash, expires_at, last_ip, user_agent
             ) VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'), $5, $6)`,
            [identifier, sha256(token), sha256(csrf), SESSION_SECONDS, normalizeClientIp(req.ip), String(req.get('user-agent') ?? '').slice(0, 500)],
        );
        await appendAudit(client, {
            adminIdentifier: identifier,
            action: 'admin-login',
            requestId,
            metadata: { ip: normalizeClientIp(req.ip), auth_method: authMethod },
        });
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Gold admin login failed:', error);
        return sendError(res, 'Gold admin login failed', 500);
    } finally {
        client.release();
    }
    res.append('Set-Cookie', cookie(ADMIN_COOKIE, token, true, SESSION_SECONDS));
    res.append('Set-Cookie', cookie(ADMIN_CSRF_COOKIE, csrf, false, SESSION_SECONDS));
    return sendSuccess(res, { identifier, csrf_token: csrf, expires_in: SESSION_SECONDS });
}

router.post(
    '/auth/account-session',
    loginLimiter,
    webAuthMiddleware,
    requireWebCsrf,
    async (req: GoldAdminRequest, res: Response) => {
        if (!isRadioTeduSuperadmin(req.user)) {
            return sendError(res, 'RadioTEDU superadmin account required', 403);
        }
        const current = await db.query(
            `SELECT id, email, role FROM users
             WHERE id = $1 AND COALESCE(is_banned, FALSE) = FALSE`,
            [req.user!.id],
        );
        if (!isRadioTeduSuperadmin(current.rows[0])) {
            return sendError(res, 'RadioTEDU superadmin account required', 403);
        }
        return issueAdminSession(req, res, String(current.rows[0].email).trim().toLowerCase(), 'radiotedu-account');
    },
);

router.post('/auth/login', loginLimiter, async (req: Request, res: Response) => {
    if (!trustedOrigin(req)) return sendError(res, 'Untrusted Gold admin origin', 403);
    const config = configuredAdmin();
    if (!config.identifier || !/^\$2[aby]\$/.test(config.passwordHash) || config.auditKey.length < 32) {
        return sendError(res, 'Gold admin is not configured', 503);
    }
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const identifierMatches = identifier.length === config.identifier.length
        && crypto.timingSafeEqual(Buffer.from(identifier), Buffer.from(config.identifier));
    const passwordMatches = password.length <= 256 && await bcrypt.compare(password, config.passwordHash);
    const valid = identifierMatches && passwordMatches;
    if (!valid) return sendError(res, 'Invalid Gold admin credentials', 401);

    return issueAdminSession(req as GoldAdminRequest, res, config.identifier, 'password');
});

router.use(requireAdmin);
router.use(requireAdminCsrf);

router.get('/session', (req: GoldAdminRequest, res) => sendSuccess(res, {
    identifier: req.goldAdminIdentifier,
    csrf_token: cookieMap(req)[ADMIN_CSRF_COOKIE] ?? '',
}));

router.post('/auth/logout', adminMutationLimiter, async (req: GoldAdminRequest, res) => {
    const requestId = crypto.randomUUID();
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE gold_admin_sessions SET revoked_at = NOW() WHERE id = $1', [req.goldAdminSessionId]);
        await appendAudit(client, {
            adminIdentifier: req.goldAdminIdentifier!,
            action: 'admin-logout',
            requestId,
        });
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        return sendError(res, 'Gold admin logout failed', 500);
    } finally {
        client.release();
    }
    res.append('Set-Cookie', cookie(ADMIN_COOKIE, '', true, 0));
    res.append('Set-Cookie', cookie(ADMIN_CSRF_COOKIE, '', false, 0));
    return sendSuccess(res, { revoked: true });
});

router.get('/rules', async (_req, res) => {
    const result = await db.query(
        `SELECT rule_key, direction, amount, daily_cap, category, enabled, description, version, updated_by, updated_at
         FROM gold_economy_rules ORDER BY direction, rule_key`,
    );
    return sendSuccess(res, { rules: result.rows });
});

router.patch('/rules/:ruleKey', adminMutationLimiter, async (req: GoldAdminRequest, res) => {
    const ruleKey = String(req.params.ruleKey ?? '');
    if (!/^[a-z0-9_]{3,64}$/.test(ruleKey)) return sendError(res, 'Invalid rule key', 400);
    const amount = Math.trunc(Number(req.body?.amount));
    const dailyCap = req.body?.daily_cap == null || req.body?.daily_cap === '' ? null : Math.trunc(Number(req.body.daily_cap));
    const enabled = req.body?.enabled === true;
    const reason = String(req.body?.reason ?? '').trim();
    const requestId = String(req.get('Idempotency-Key') ?? '');
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return sendError(res, 'Amount must be 1–10,000', 400);
    if (dailyCap != null && (!Number.isInteger(dailyCap) || dailyCap < amount || dailyCap > 100000)) {
        return sendError(res, 'Daily cap must be empty or at least the rule amount', 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || reason.length < 10 || reason.length > 500) {
        return sendError(res, 'UUID Idempotency-Key and a 10–500 character reason are required', 400);
    }
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await requireUnusedAdminRequest(client, requestId);
        const updated = await client.query(
            `UPDATE gold_economy_rules SET amount = $1, daily_cap = $2, enabled = $3,
                    version = version + 1, updated_by = $4, updated_at = NOW()
             WHERE rule_key = $5 RETURNING *`,
            [amount, dailyCap, enabled, req.goldAdminIdentifier, ruleKey],
        );
        if (!updated.rows[0]) {
            await client.query('ROLLBACK');
            return sendError(res, 'Gold rule not found', 404);
        }
        await appendAudit(client, {
            adminIdentifier: req.goldAdminIdentifier!,
            action: 'rule-updated',
            requestId,
            reason,
            metadata: { rule_key: ruleKey, amount, daily_cap: dailyCap, enabled, version: updated.rows[0].version },
        });
        await client.query('COMMIT');
        return sendSuccess(res, { rule: updated.rows[0] }, 'Gold rule updated');
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof Error && error.message === 'GOLD_ADMIN_REQUEST_REPLAY') {
            return sendError(res, 'Idempotency-Key was already used', 409);
        }
        console.error('Gold rule update failed:', error);
        return sendError(res, 'Gold rule update failed', 500);
    } finally {
        client.release();
    }
});

router.get('/users', async (req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length < 2 || query.length > 120) return sendError(res, 'Search requires 2–120 characters', 400);
    const result = await db.query(
        `SELECT u.id, u.email, u.display_name, u.created_at,
                COALESCE(up.spendable_points, 0) AS gold_balance,
                COALESCE(up.lifetime_points, 0) AS lifetime_gold
         FROM users u LEFT JOIN user_points up ON up.user_id = u.id
         WHERE u.email ILIKE $1 OR u.display_name ILIKE $1
         ORDER BY u.created_at DESC LIMIT 20`,
        [`%${query.replace(/[%_]/g, '\\$&')}%`],
    );
    return sendSuccess(res, { users: result.rows });
});

router.get('/users/:userId/ledger', async (req, res) => {
    const userId = String(req.params.userId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendError(res, 'Invalid user id', 400);
    const result = await db.query(
        `SELECT id, amount, category, source_type, source_id, balance_after, metadata, created_at
         FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [userId],
    );
    return sendSuccess(res, { ledger: result.rows });
});

router.post('/adjustments', adminMutationLimiter, async (req: GoldAdminRequest, res) => {
    const userId = String(req.body?.user_id ?? '');
    const amount = Math.trunc(Number(req.body?.amount));
    const reason = String(req.body?.reason ?? '').trim();
    const requestId = String(req.get('Idempotency-Key') ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10000) {
        return sendError(res, 'Valid user and adjustment between -10,000 and 10,000 required', 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || reason.length < 10 || reason.length > 500) {
        return sendError(res, 'UUID Idempotency-Key and a 10–500 character reason are required', 400);
    }
    const target = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!target.rows[0]) return sendError(res, 'User not found', 404);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await requireUnusedAdminRequest(client, requestId);
        const adjustment = await adminAdjustGold({
            userId,
            amount,
            requestId,
            adminIdentifier: req.goldAdminIdentifier!,
            reason,
        }, client);
        await appendAudit(client, {
            adminIdentifier: req.goldAdminIdentifier!,
            action: 'gold-adjusted',
            requestId,
            targetUserId: userId,
            reason,
            metadata: { amount, ledger_id: adjustment.ledgerId, balance_after: adjustment.spendablePoints },
        });
        await client.query('COMMIT');
        return sendSuccess(res, { adjustment }, 'Gold adjustment recorded');
    } catch (error) {
        await client.query('ROLLBACK');
        const code = error instanceof Error ? error.message : '';
        if (code === 'INSUFFICIENT_GOLD') return sendError(res, 'Adjustment would make Gold negative', 409);
        if (code === 'GOLD_ADMIN_REQUEST_REPLAY') return sendError(res, 'Idempotency-Key was already used', 409);
        console.error('Gold adjustment failed:', error);
        return sendError(res, 'Gold adjustment failed', 500);
    } finally {
        client.release();
    }
});

router.get('/audit', async (_req, res) => {
    const result = await db.query(
        `SELECT id, admin_identifier, action, target_user_id, request_id, reason, metadata,
                previous_event_hash, event_hash, created_at
         FROM gold_admin_audit_events ORDER BY created_at DESC, id DESC LIMIT 100`,
    );
    return sendSuccess(res, { events: result.rows });
});

export default router;
