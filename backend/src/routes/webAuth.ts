import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { ROLES } from '../middleware/rbac';
import { sendError, sendSuccess } from '../utils/response';
import { hashOpaqueToken } from '../services/erpIdentity';
import {
    createAuthSession,
    createAuthRateLimiter,
    getRegistrationPolicyError,
    isAllowedRegistrationEmail,
    isTeduInstitutionEmail,
    loadAuthSessionUser,
    mapAuthSessionUser,
    normalizeDisplayNameInput,
    REGISTRATION_PRIVACY_VERSION,
    REGISTRATION_TERMS_VERSION,
    revokeAuthSessionFamily,
    revokeRefreshTokenSession,
    rotateRefreshTokenSession,
    verifyAccountPassword,
    verifyRefreshToken,
} from './auth';
import {
    clearWebSessionCookies,
    ensureWebCsrfCookie,
    getWebRefreshToken,
    requireTrustedWebOrigin,
    requireWebCsrf,
    setAuthNoStore,
    setWebSessionCookies,
    webAuthMiddleware,
} from '../services/webSession';
import type { AuthRequest } from '../middleware/auth';
import { tryAwardFirstLogin } from '../services/economy';
import { normalizeClientIp } from '../utils/networkAddress';
import { disconnectSessionFamilySockets } from '../socket';

const router = Router();
router.use(setAuthNoStore);
const registerLimiter = createAuthRateLimiter(15 * 60_000, 10);
const loginLimiter = createAuthRateLimiter(15 * 60_000, 20);
const erpExchangeLimiter = createAuthRateLimiter(15 * 60_000, 20);
const refreshLimiter = createAuthRateLimiter(5 * 60_000, 60);

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(200),
    display_name: z.string().min(2).max(100),
    age: z.number().int().min(0).max(120).optional(),
    terms_accepted: z.boolean().optional(),
    privacy_acknowledged: z.boolean().optional(),
    terms_version: z.string().max(32).optional(),
    privacy_version: z.string().max(32).optional(),
});

function requestError(error: unknown, fallback: string): string {
    if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback;
    return fallback;
}

router.post('/register', requireTrustedWebOrigin, registerLimiter, async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.parse(req.body);
        const email = parsed.email.trim().toLowerCase();
        const displayName = normalizeDisplayNameInput(parsed.display_name);
        if (!isAllowedRegistrationEmail(email)) {
            return sendError(res, 'Unsupported email provider', 400);
        }
        const policyError = getRegistrationPolicyError(email, parsed);
        if (policyError) return sendError(res, policyError, 400);
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows[0]) return sendError(res, 'Email already registered', 400);

        const passwordHash = await bcrypt.hash(parsed.password, 10);
        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, role, last_ip, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [email, passwordHash, displayName, ROLES.USER, normalizeClientIp(req.ip), req.headers['user-agent']],
        );
        const user = result.rows[0];
        await db.query(
            `INSERT INTO legal_acceptance_events (
                user_id, event_type, terms_version, privacy_version, age_18_confirmed, channel
             ) VALUES ($1, 'registration', $2, $3, $4, 'web')
             ON CONFLICT (user_id, event_type) DO NOTHING`,
            [
                user.id,
                parsed.terms_version!,
                parsed.privacy_version!,
                isTeduInstitutionEmail(email) ? null : Number(parsed.age) >= 18,
            ],
        );
        const tokens = await createAuthSession(user.id, user.email, user.role);
        const csrfToken = setWebSessionCookies(res, tokens);
        return sendSuccess(res, { user: mapAuthSessionUser(user), csrf_token: csrfToken }, 'Registration successful', null, 201);
    } catch (error) {
        console.error('Web registration failed:', error);
        return sendError(res, requestError(error, 'Registration failed'), 400);
    }
});

router.post('/login', requireTrustedWebOrigin, loginLimiter, async (req: Request, res: Response) => {
    try {
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        const password = String(req.body?.password ?? '');
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1 AND COALESCE(is_banned, FALSE) = FALSE',
            [email],
        );
        const user = result.rows[0];
        const valid = await verifyAccountPassword(password, user?.password_hash);
        if (!user || !valid) return sendError(res, 'Invalid credentials', 401);

        await db.query(
            'UPDATE users SET last_ip = $1, user_agent = $2 WHERE id = $3',
            [normalizeClientIp(req.ip), req.headers['user-agent'], user.id],
        );
        const firstLoginReward = await tryAwardFirstLogin(user.id, 'web');
        const sessionUser = await loadAuthSessionUser(user.id);
        if (!sessionUser) return sendError(res, 'Invalid credentials', 401);
        const tokens = await createAuthSession(
            String(sessionUser.id),
            String(sessionUser.email),
            String(sessionUser.role),
        );
        const csrfToken = setWebSessionCookies(res, tokens);
        return sendSuccess(res, {
            user: mapAuthSessionUser(sessionUser),
            csrf_token: csrfToken,
            first_login_reward: firstLoginReward,
        }, 'Login successful');
    } catch (error) {
        console.error('Web login failed:', error);
        return sendError(res, 'Login failed', 500);
    }
});

router.post('/erp-exchange', requireTrustedWebOrigin, erpExchangeLimiter, async (req: Request, res: Response) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code) return sendError(res, 'ERP login code is required', 400);
    try {
        const codeResult = await db.query(
            `UPDATE external_identity_link_requests
             SET exchanged_at = NOW()
             WHERE login_code_hash = $1
               AND purpose = 'login'
               AND exchanged_at IS NULL
               AND login_code_expires_at > NOW()
             RETURNING user_id`,
            [hashOpaqueToken(code)],
        );
        const userId = codeResult.rows[0]?.user_id;
        if (!userId) return sendError(res, 'ERP login code is invalid or expired', 401);

        const userResult = await db.query(
            'SELECT * FROM users WHERE id = $1 AND COALESCE(is_banned, FALSE) = FALSE',
            [userId],
        );
        const user = userResult.rows[0];
        if (!user) return sendError(res, 'App account is not available', 403);

        await db.query(
            `INSERT INTO legal_acceptance_events (
                user_id, event_type, terms_version, privacy_version, age_18_confirmed, channel
             ) VALUES ($1, 'erp-first-login', $2, $3, NULL, 'erp')
             ON CONFLICT (user_id, event_type) DO NOTHING`,
            [user.id, REGISTRATION_TERMS_VERSION, REGISTRATION_PRIVACY_VERSION],
        );
        const firstLoginReward = await tryAwardFirstLogin(user.id, 'erp');
        const sessionUser = await loadAuthSessionUser(user.id);
        if (!sessionUser) return sendError(res, 'App account is not available', 403);
        const tokens = await createAuthSession(
            String(sessionUser.id),
            String(sessionUser.email),
            String(sessionUser.role),
        );
        const csrfToken = setWebSessionCookies(res, tokens);
        return sendSuccess(res, {
            user: mapAuthSessionUser(sessionUser),
            csrf_token: csrfToken,
            first_login_reward: firstLoginReward,
        }, 'ERP login successful');
    } catch (error) {
        console.error('Web ERP login exchange failed:', error);
        return sendError(res, 'ERP login failed', 500);
    }
});

router.get('/session', webAuthMiddleware, async (req: AuthRequest, res: Response) => {
    const result = await db.query(
        `SELECT u.*, COALESCE(up.spendable_points, 0) AS gold_balance,
                COALESCE(up.lifetime_points, 0) AS lifetime_gold_earned
         FROM users u LEFT JOIN user_points up ON up.user_id = u.id
         WHERE u.id = $1 AND COALESCE(u.is_banned, FALSE) = FALSE`,
        [req.user!.id],
    );
    const user = result.rows[0];
    if (!user) return sendError(res, 'Account is not available', 404);
    return sendSuccess(res, {
        user: mapAuthSessionUser(user),
        csrf_token: ensureWebCsrfCookie(req, res),
    });
});

router.post('/refresh', requireTrustedWebOrigin, refreshLimiter, async (req: Request, res: Response) => {
    const refreshToken = getWebRefreshToken(req);
    if (!refreshToken) return sendError(res, 'Refresh token required', 401);
    try {
        const decoded = verifyRefreshToken(refreshToken);
        const rotation = await rotateRefreshTokenSession(refreshToken, decoded.id);
        if (rotation.status === 'invalid') {
            return sendError(res, 'Invalid or expired refresh token', 401);
        }
        if (rotation.status === 'user-unavailable') {
            clearWebSessionCookies(res);
            return sendError(res, 'Invalid or expired refresh token', 401);
        }
        const csrfToken = setWebSessionCookies(res, rotation.tokens);
        return sendSuccess(res, { refreshed: true, csrf_token: csrfToken }, 'Session refreshed');
    } catch {
        clearWebSessionCookies(res);
        return sendError(res, 'Invalid refresh token', 401);
    }
});

router.post('/logout', webAuthMiddleware, requireWebCsrf, async (req: AuthRequest, res: Response) => {
    let revokedSessionFamilyId: string | null = null;
    try {
        if (req.user?.sid) {
            await revokeAuthSessionFamily(req.user.id, req.user.sid);
            revokedSessionFamilyId = req.user.sid;
        } else {
            const refreshToken = getWebRefreshToken(req);
            if (!refreshToken) throw new Error('Legacy refresh token is unavailable');
            const decoded = verifyRefreshToken(refreshToken);
            if (decoded.id === req.user!.id) {
                const revocation = await revokeRefreshTokenSession(refreshToken);
                revokedSessionFamilyId = revocation.sessionFamilyId;
            }
        }
    } catch {
        // Logout remains idempotent for stale or already-rotated sessions.
    }
    if (revokedSessionFamilyId) {
        disconnectSessionFamilySockets(revokedSessionFamilyId);
    }
    clearWebSessionCookies(res);
    return sendSuccess(res, { revoked: true }, 'Session logged out');
});

export default router;
