import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { authMiddleware, AuthRequest, JWT_ALGORITHM, JWT_SECRET } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';
import { normalizeText } from '../utils/textNormalization';
import { getIstanbulYearMonth } from '../services/jukeboxScoring';
import { tryAwardFirstLogin } from '../services/economy';
import { setAuthNoStore } from '../services/webSession';
import {
    type AuthSessionQueryClient,
    isSessionFamilyId,
} from '../services/authSession';
import { normalizeClientIp, rateLimitClientIpKey } from '../utils/networkAddress';
import { disconnectSessionFamilySockets } from '../socket';

const router = Router();
router.use(setAuthNoStore);

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// In production these are asserted at startup (see server.ts). A deterministic
// default is only allowed under tests so the suite can run without secrets.
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (IS_TEST_ENV ? 'test-refresh-secret-key' : '');
const REFRESH_TOKEN_HASH_PREFIX = 'sha256:';
const AUTH_DUMMY_PASSWORD_HASH = '$2a$10$/dxQZSfSW8CLYhTYwRNjGOvV7ITgYlxPGhz7FyQ1jDh3ulSQMt2/2';

export async function verifyAccountPassword(password: unknown, passwordHash: unknown): Promise<boolean> {
    const hasPasswordHash = typeof passwordHash === 'string' && passwordHash.length > 0;
    const candidateHash = hasPasswordHash ? passwordHash : AUTH_DUMMY_PASSWORD_HASH;
    const matches = await bcrypt.compare(String(password ?? ''), candidateHash);
    return hasPasswordHash && matches;
}

export type RefreshTokenClaims = {
    id: string;
    email: string;
    role: string;
    sid?: string;
};

export function verifyRefreshToken(refreshToken: string): RefreshTokenClaims {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
        algorithms: [JWT_ALGORITHM],
    });
    if (
        typeof decoded === 'string'
        || typeof decoded.id !== 'string'
        || !decoded.id.trim()
        || typeof decoded.email !== 'string'
        || !decoded.email.trim()
        || typeof decoded.role !== 'string'
        || !decoded.role.trim()
        || (decoded.sid !== undefined && !isSessionFamilyId(decoded.sid))
    ) {
        throw new jwt.JsonWebTokenError('Invalid refresh token payload');
    }
    return {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        ...(decoded.sid ? { sid: decoded.sid } : {}),
    };
}

export function createRefreshToken(
    userId: string,
    email: string,
    role: string,
    sessionFamilyId: string = crypto.randomUUID(),
) {
    if (!isSessionFamilyId(sessionFamilyId)) {
        throw new TypeError('Invalid auth session family id');
    }
    return jwt.sign(
        { id: userId, email, role, sid: sessionFamilyId },
        JWT_REFRESH_SECRET,
        { algorithm: JWT_ALGORITHM, expiresIn: '30d', jwtid: crypto.randomUUID() }
    );
}

export function getRefreshTokenHashInput(refreshToken: string) {
    return crypto.createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

/**
 * A sid-less refresh token needs a stable family only while it crosses the
 * legacy-to-family rotation boundary. Deriving that UUID from the signed token
 * lets a concurrent logout identify and remove the freshly rotated successor.
 */
export function deriveLegacyRefreshSessionFamilyId(refreshToken: string): string {
    const bytes = crypto.createHash('sha256')
        .update('radiotedu:legacy-refresh-session-family\0', 'utf8')
        .update(refreshToken, 'utf8')
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x50;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SUPPORTED_ONBOARDING_LANGUAGES = [
    'en', 'tr', 'ru', 'ar', 'de', 'nl', 'fr', 'it', 'jp',
] as const;
const CURRENT_YEAR = new Date().getUTCFullYear();

export const REGISTRATION_TERMS_VERSION = '2026-08-22';
export const REGISTRATION_PRIVACY_VERSION = '2026-08-22';
export const LEGACY_REGISTRATION_TERMS_VERSION = '2026-08-11';
export const LEGACY_REGISTRATION_PRIVACY_VERSION = '2026-08-11';

const ACCEPTED_REGISTRATION_LEGAL_PAIRS = new Set([
    `${REGISTRATION_TERMS_VERSION}:${REGISTRATION_PRIVACY_VERSION}`,
    `${LEGACY_REGISTRATION_TERMS_VERSION}:${LEGACY_REGISTRATION_PRIVACY_VERSION}`,
]);

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(200),
    display_name: z.string().min(2).max(100),
    birth_year: z.number().int().min(1900).max(CURRENT_YEAR).optional(),
    preferred_language: z.enum(SUPPORTED_ONBOARDING_LANGUAGES).optional(),
    age: z.number().int().min(0).max(120).optional(),
    terms_accepted: z.boolean().optional(),
    privacy_acknowledged: z.boolean().optional(),
    terms_version: z.string().max(32).optional(),
    privacy_version: z.string().max(32).optional(),
});

const ALLOWED_REGISTRATION_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'yahoo.com',
    'yandex.com',
    'proton.me',
    'protonmail.com',
    'tedu.edu.tr',
    'radiotedu.com',
]);

export function getEmailDomain(email: string): string {
    return String(email).trim().toLowerCase().split('@').pop() ?? '';
}

export function isAllowedRegistrationEmail(email: string): boolean {
    const domain = getEmailDomain(email);
    return ALLOWED_REGISTRATION_EMAIL_DOMAINS.has(domain) || domain.endsWith('.edu.tr');
}

export function isTeduInstitutionEmail(email: string): boolean {
    const domain = getEmailDomain(email);
    return domain === 'tedu.edu.tr' || domain.endsWith('.tedu.edu.tr');
}

type RegistrationPolicyInput = {
    age?: number;
    terms_accepted?: boolean;
    privacy_acknowledged?: boolean;
    terms_version?: string;
    privacy_version?: string;
};

export function getRegistrationPolicyError(email: string, input: RegistrationPolicyInput): string | null {
    const legalVersionPair = `${input.terms_version ?? ''}:${input.privacy_version ?? ''}`;
    const legalAccepted = input.terms_accepted === true
        && input.privacy_acknowledged === true
        && ACCEPTED_REGISTRATION_LEGAL_PAIRS.has(legalVersionPair);
    if (!legalAccepted) {
        return 'You must accept the Terms of Use and acknowledge the Privacy Notice';
    }
    if (!isTeduInstitutionEmail(email) && (!Number.isInteger(input.age) || Number(input.age) < 18)) {
        return 'You must be at least 18 years old to register with a non-TEDU email address';
    }
    return null;
}

export function createAuthRateLimiter(windowMs: number, max: number) {
    return rateLimit({
        windowMs,
        max: IS_TEST_ENV ? 1000 : max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => rateLimitClientIpKey(req.ip),
        handler: (_req, res) => sendError(
            res,
            'Too many authentication requests. Please try again later.',
            429,
        ),
    });
}

const registerLimiter = createAuthRateLimiter(15 * 60_000, 10);
const loginLimiter = createAuthRateLimiter(15 * 60_000, 20);
const guestLimiter = createAuthRateLimiter(15 * 60_000, 20);
const refreshLimiter = createAuthRateLimiter(5 * 60_000, 60);
const logoutLimiter = createAuthRateLimiter(5 * 60_000, 60);
const accountDeleteLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String((req as AuthRequest).user?.id || 'authenticated-user'),
    handler: (_req, res) => sendError(
        res,
        'Too many account deletion attempts. Please try again later.',
        429,
    ),
});

export function normalizeDisplayNameInput(displayName: string): string {
    return normalizeText(displayName);
}

export function mapCurrentUserProfile(row: Record<string, unknown>) {
    return {
        id: row.id,
        email: row.email,
        display_name: (typeof row.username === 'string' && row.username.trim()) || row.display_name,
        real_display_name: row.display_name,
        username: typeof row.username === 'string' && row.username.trim() ? row.username.trim() : null,
        avatar_url: row.avatar_url ?? null,
        rank_score: Number(row.rank_score ?? 0),
        monthly_rank_score: Number(row.monthly_rank_score ?? 0),
        is_guest: Boolean(row.is_guest),
        total_songs_added: Number(row.total_songs_added ?? 0),
        total_upvotes_received: Number(row.total_upvotes_received ?? 0),
        role: row.role,
        last_super_vote_at: row.last_super_vote_at ?? null,
        birth_year: row.birth_year ?? null,
        preferred_language: row.preferred_language ?? null,
        gold_balance: Number(row.gold_balance ?? 0),
    };
}

export function mapAuthSessionUser(row: Record<string, unknown>) {
    const isGuest = Boolean(row.is_guest);
    return {
        id: row.id,
        email: row.email,
        display_name: (typeof row.username === 'string' && row.username.trim()) || row.display_name,
        real_display_name: row.display_name,
        username: typeof row.username === 'string' && row.username.trim() ? row.username.trim() : null,
        avatar_url: row.avatar_url ?? null,
        rank_score: Number(row.rank_score ?? 0),
        is_guest: isGuest,
        role: row.role ?? (isGuest ? ROLES.GUEST : ROLES.USER),
        total_songs_added: Number(row.total_songs_added ?? 0),
        total_upvotes_received: Number(row.total_upvotes_received ?? 0),
        last_super_vote_at: row.last_super_vote_at ?? null,
        birth_year: row.birth_year ?? null,
        preferred_language: row.preferred_language ?? null,
        gold_balance: Number(row.gold_balance ?? 0),
    };
}

// Helper to generate and store tokens
export async function createAuthSession(
    userId: string,
    email: string,
    role: string,
    queryClient: AuthSessionQueryClient = db,
    sessionFamilyId: string = crypto.randomUUID(),
) {
    if (!isSessionFamilyId(sessionFamilyId)) {
        throw new TypeError('Invalid auth session family id');
    }
    const accessToken = jwt.sign(
        { id: userId, email, role, sid: sessionFamilyId },
        JWT_SECRET,
        { algorithm: JWT_ALGORITHM, expiresIn: '24h' }
    );

    const refreshToken = createRefreshToken(userId, email, role, sessionFamilyId);

    const refreshTokenHash = REFRESH_TOKEN_HASH_PREFIX
        + await bcrypt.hash(getRefreshTokenHashInput(refreshToken), 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Store in DB
    await queryClient.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, session_family_id)
         VALUES ($1, $2, $3, $4::uuid)`,
        [userId, refreshTokenHash, expiresAt, sessionFamilyId]
    );

    return {
        access_token: accessToken,
        refresh_token: refreshToken
    };
}

export async function loadAuthSessionUser(
    userId: string,
    queryClient: AuthSessionQueryClient = db,
): Promise<Record<string, unknown> | null> {
    const result = await queryClient.query(
        `SELECT u.*, COALESCE(up.spendable_points, 0) AS gold_balance
         FROM users u
         LEFT JOIN user_points up ON up.user_id = u.id
         WHERE u.id = $1 AND COALESCE(u.is_banned, FALSE) = FALSE`,
        [userId],
    );
    return result.rows[0] ?? null;
}

export async function findRefreshTokenSession(
    refreshToken: string,
    userId: string,
    queryClient: AuthSessionQueryClient = db,
    lockForUpdate = false,
): Promise<string | null> {
    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload | null;
    if (decoded?.sid !== undefined && !isSessionFamilyId(decoded.sid)) return null;
    const sessionFamilyId = isSessionFamilyId(decoded?.sid) ? decoded.sid : null;
    const result = await queryClient.query(
        `SELECT id, token_hash
         FROM refresh_tokens
         WHERE user_id = $1
           AND expires_at > NOW()
           AND ($2::uuid IS NULL OR session_family_id = $2::uuid)
         ${lockForUpdate ? 'FOR UPDATE' : ''}`,
        [userId, sessionFamilyId]
    );

    const canUseLegacyHash = !decoded?.jti;
    const hashInput = getRefreshTokenHashInput(refreshToken);

    for (const row of result.rows) {
        const storedHash = String(row.token_hash ?? '');
        const matchesCurrentHash = storedHash.startsWith(REFRESH_TOKEN_HASH_PREFIX)
            && await bcrypt.compare(hashInput, storedHash.slice(REFRESH_TOKEN_HASH_PREFIX.length));
        const matchesLegacyHash = canUseLegacyHash
            && !storedHash.startsWith(REFRESH_TOKEN_HASH_PREFIX)
            && await bcrypt.compare(refreshToken, storedHash);
        if (matchesCurrentHash || matchesLegacyHash) return row.id;
    }
    return null;
}

export type RefreshSessionRotationResult =
    | {
        status: 'rotated';
        tokens: Awaited<ReturnType<typeof createAuthSession>>;
        user: Record<string, unknown>;
    }
    | { status: 'invalid' }
    | { status: 'user-unavailable' };

/**
 * Consumes one refresh token and creates its replacement inside one pinned
 * database transaction. The stable user-row lock serializes refresh with
 * family logout before bcrypt-matched refresh rows can be replaced.
 */
export async function rotateRefreshTokenSession(
    refreshToken: string,
    userId: string,
): Promise<RefreshSessionRotationResult> {
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.id !== userId) return { status: 'invalid' };
    const sessionFamilyId = decoded.sid ?? deriveLegacyRefreshSessionFamilyId(refreshToken);
    const client = await db.pool.connect();
    let transactionOpen = false;

    const rollback = async () => {
        if (!transactionOpen) return;
        try {
            await client.query('ROLLBACK');
        } finally {
            transactionOpen = false;
        }
    };

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const userLock = await client.query(
            'SELECT id FROM users WHERE id = $1 FOR UPDATE',
            [userId],
        );
        if (!userLock.rows[0]) {
            await rollback();
            return { status: 'user-unavailable' };
        }

        const matchedTokenId = await findRefreshTokenSession(
            refreshToken,
            userId,
            client,
            true,
        );
        if (!matchedTokenId) {
            await rollback();
            return { status: 'invalid' };
        }

        const sessionUser = await loadAuthSessionUser(userId, client);
        if (!sessionUser) {
            await rollback();
            return { status: 'user-unavailable' };
        }

        const deletion = await client.query(
            'DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
            [matchedTokenId, userId],
        );
        if (deletion.rows.length !== 1) {
            await rollback();
            return { status: 'invalid' };
        }

        const tokens = await createAuthSession(
            String(sessionUser.id),
            String(sessionUser.email),
            String(sessionUser.role),
            client,
            sessionFamilyId,
        );
        await client.query('COMMIT');
        transactionOpen = false;

        return { status: 'rotated', tokens, user: sessionUser };
    } catch (error) {
        try {
            await rollback();
        } catch {
            // Preserve the original refresh failure while the client is released.
        }
        throw error;
    } finally {
        client.release();
    }
}

type RefreshSessionRevocationResult = {
    sessionFamilyId: string;
};

async function revokeLockedRefreshSession(params: {
    userId: string;
    sessionFamilyId: string;
    legacyRefreshToken?: string;
}): Promise<RefreshSessionRevocationResult> {
    const client = await db.pool.connect();
    let transactionOpen = false;

    const rollback = async () => {
        if (!transactionOpen) return;
        try {
            await client.query('ROLLBACK');
        } finally {
            transactionOpen = false;
        }
    };

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        await client.query(
            'SELECT id FROM users WHERE id = $1 FOR UPDATE',
            [params.userId],
        );

        if (params.legacyRefreshToken) {
            const tokenId = await findRefreshTokenSession(
                params.legacyRefreshToken,
                params.userId,
                client,
                true,
            );
            if (tokenId) {
                await client.query(
                    'DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2',
                    [tokenId, params.userId],
                );
            }
        }

        await client.query(
            `SELECT id
             FROM refresh_tokens
             WHERE user_id = $1 AND session_family_id = $2::uuid
             FOR UPDATE`,
            [params.userId, params.sessionFamilyId],
        );
        await client.query(
            `DELETE FROM refresh_tokens
             WHERE user_id = $1 AND session_family_id = $2::uuid`,
            [params.userId, params.sessionFamilyId],
        );

        await client.query('COMMIT');
        transactionOpen = false;
        return { sessionFamilyId: params.sessionFamilyId };
    } catch (error) {
        try {
            await rollback();
        } catch {
            // Preserve the original revocation failure while releasing the client.
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function revokeAuthSessionFamily(
    userId: string,
    sessionFamilyId: string,
): Promise<RefreshSessionRevocationResult> {
    if (!isSessionFamilyId(sessionFamilyId)) {
        throw new TypeError('Invalid auth session family id');
    }
    return revokeLockedRefreshSession({ userId, sessionFamilyId });
}

export async function revokeRefreshTokenSession(
    refreshToken: string,
): Promise<RefreshSessionRevocationResult> {
    const decoded = verifyRefreshToken(refreshToken);
    const sessionFamilyId = decoded.sid
        ?? deriveLegacyRefreshSessionFamilyId(refreshToken);
    return revokeLockedRefreshSession({
        userId: decoded.id,
        sessionFamilyId,
        legacyRefreshToken: decoded.sid ? undefined : refreshToken,
    });
}

router.post('/register', registerLimiter, async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.parse(req.body);
        const { email, password, display_name, birth_year, preferred_language } = parsed;
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedDisplayName = normalizeDisplayNameInput(display_name);

        if (!isAllowedRegistrationEmail(normalizedEmail)) {
            return sendError(res, 'Unsupported email provider', 400);
        }

        const policyError = getRegistrationPolicyError(normalizedEmail, parsed);
        if (policyError) return sendError(res, policyError, 400);

        if (normalizedDisplayName.length < 2) {
            return sendError(res, 'Display name required', 400);
        }

        // Check if user exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existing.rows[0]) {
            return sendError(res, 'Email already registered', 400);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, role, last_ip, user_agent, birth_year, preferred_language)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [normalizedEmail, hashedPassword, normalizedDisplayName, ROLES.USER, normalizeClientIp(req.ip), req.headers['user-agent'], birth_year ?? null, preferred_language ?? null]
        );

        const user = result.rows[0];
        await db.query(
            `INSERT INTO legal_acceptance_events (
                user_id, event_type, terms_version, privacy_version, age_18_confirmed, channel
             ) VALUES ($1, 'registration', $2, $3, $4, 'mobile')
             ON CONFLICT (user_id, event_type) DO NOTHING`,
            [
                user.id,
                parsed.terms_version!,
                parsed.privacy_version!,
                isTeduInstitutionEmail(normalizedEmail) ? null : Number(parsed.age) >= 18,
            ],
        );
        const tokens = await createAuthSession(user.id, user.email, user.role);

        return sendSuccess(res, { user: mapAuthSessionUser(user), ...tokens }, 'Registration successful', null, 201);
    } catch (error) {
        console.error('Registration failed:', error);
        return sendError(res, 'Registration failed', 400);
    }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = String(email ?? '').trim().toLowerCase();
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1 AND COALESCE(is_banned, FALSE) = FALSE',
            [normalizedEmail],
        );

        const user = result.rows[0];
        const valid = await verifyAccountPassword(password, user?.password_hash);

        if (!user || !valid) {
            return sendError(res, 'Invalid credentials', 401);
        }

        // Update last IP and UA on login
        await db.query('UPDATE users SET last_ip = $1, user_agent = $2 WHERE id = $3', [normalizeClientIp(req.ip), req.headers['user-agent'], user.id]);

        const firstLoginReward = await tryAwardFirstLogin(user.id, 'mobile');
        const sessionUser = await loadAuthSessionUser(user.id);
        if (!sessionUser) return sendError(res, 'Invalid credentials', 401);
        const tokens = await createAuthSession(
            String(sessionUser.id),
            String(sessionUser.email),
            String(sessionUser.role),
        );
        return sendSuccess(res, {
            user: mapAuthSessionUser(sessionUser),
            first_login_reward: firstLoginReward,
            ...tokens
        }, 'Login successful');
    } catch (error) {
        console.error('Login failed:', error);
        return sendError(res, 'Login failed', 500);
    }
});

router.post('/guest', guestLimiter, async (req: Request, res: Response) => {
    try {
        const normalizedDisplayName = normalizeDisplayNameInput(req.body.display_name ?? '');
        if (!normalizedDisplayName || normalizedDisplayName.length < 2) {
            return res.status(400).json({ error: 'Display name required' });
        }

        // Generate a random guest email
        const guestId = Math.random().toString(36).substring(7);
        const email = `guest_${guestId}@radiotedu.internal`;

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, is_guest, role, last_ip, user_agent)
             VALUES ($1, NULL, $2, TRUE, $3, $4, $5) RETURNING *`,
            [email, normalizedDisplayName, ROLES.GUEST, normalizeClientIp(req.ip), req.headers['user-agent']]
        );

        const user = result.rows[0];
        const tokens = await createAuthSession(user.id, user.email, ROLES.GUEST);

        return sendSuccess(res, {
            user: mapAuthSessionUser(user),
            ...tokens
        }, 'Guest login successful', null, 201);
    } catch (error) {
        console.error('Guest login failed:', error);
        return sendError(res, 'Guest login failed', 500);
    }
});

router.post('/refresh', refreshLimiter, async (req: Request, res: Response) => {
    try {
        const { refresh_token } = req.body;
        if (typeof refresh_token !== 'string' || !refresh_token || refresh_token.length > 4096) {
            return sendError(res, 'Refresh token required', 400);
        }

        const decoded = verifyRefreshToken(refresh_token);

        const rotation = decoded.id
            ? await rotateRefreshTokenSession(refresh_token, decoded.id)
            : { status: 'invalid' as const };

        if (rotation.status !== 'rotated') {
            return sendError(res, 'Invalid or expired refresh token', 401);
        }
        return sendSuccess(res, {
            ...rotation.tokens,
            user: mapAuthSessionUser(rotation.user),
        }, 'Token refreshed');
    } catch (error) {
        return sendError(res, 'Invalid refresh token', 401);
    }
});

router.delete('/account', authMiddleware, accountDeleteLimiter, async (req: AuthRequest, res: Response) => {
    if (req.body?.confirmation !== 'DELETE') {
        return sendError(res, 'Type DELETE to confirm account deletion', 400);
    }

    const userId = req.user?.id;
    if (!userId) return sendError(res, 'Authentication required', 401);

    const client = await db.pool.connect();
    let transactionOpen = false;

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const accountResult = await client.query(
            `SELECT id, is_guest, password_hash
             FROM users
             WHERE id = $1
             FOR UPDATE`,
            [userId]
        );
        const account = accountResult.rows[0];

        if (!account) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'User not found', 404);
        }

        if (!account.is_guest && account.password_hash) {
            const password = String(req.body?.password ?? '');
            const passwordMatches = await bcrypt.compare(password, account.password_hash);

            if (!passwordMatches) {
                await client.query('ROLLBACK');
                transactionOpen = false;
                return sendError(res, 'Current password is incorrect', 401);
            }
        }

        await client.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1',
            [userId]
        );
        await client.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [userId]
        );
        await client.query('COMMIT');
        transactionOpen = false;

        return sendSuccess(res, { deleted: true }, 'Account deleted');
    } catch {
        if (transactionOpen) {
            await client.query('ROLLBACK');
        }
        return sendError(res, 'Failed to delete account', 500);
    } finally {
        client.release();
    }
});

router.post('/logout', logoutLimiter, async (req: Request, res: Response) => {
    const refreshToken = typeof req.body?.refresh_token === 'string'
        ? req.body.refresh_token.trim()
        : '';

    if (refreshToken && refreshToken.length <= 4096) {
        try {
            const revocation = await revokeRefreshTokenSession(refreshToken);
            if (revocation.sessionFamilyId) {
                disconnectSessionFamilySockets(revocation.sessionFamilyId);
            }
        } catch (error) {
            if (!(error instanceof jwt.JsonWebTokenError)) {
                console.error('Session logout failed:', error);
                return sendError(res, 'Failed to log out session', 500);
            }
            // Invalid/expired JWTs cannot authorize a session. Database failures
            // must remain retryable errors rather than falsely claiming revocation.
        }
    }

    return sendSuccess(res, { revoked: true }, 'Session logged out');
});

router.post('/logout-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    let client: PoolClient | null = null;
    let discard = false;
    try {
        client = await db.pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        const deleted = await client.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1 RETURNING session_family_id', [req.user!.id],
        );
        await client.query('COMMIT');
        for (const row of deleted.rows) {
            if (row.session_family_id) disconnectSessionFamilySockets(row.session_family_id);
        }
        return sendSuccess(res, { revoked_sessions: deleted.rowCount ?? 0 }, 'All sessions logged out');
    } catch (error) {
        discard = true;
        try { if (client) await client.query('ROLLBACK'); }
        catch (rollbackError) { console.error('Logout-all rollback failed:', rollbackError); }
        console.error('Logout-all failed:', error);
        return sendError(res, 'Failed to log out sessions', 500);
    } finally {
        client?.release(discard);
    }
});

export async function handleCurrentUserProfileRequest(req: AuthRequest, res: Response) {
    try {
        const currentYearMonth = getIstanbulYearMonth(new Date());
        const result = await db.query(
            `SELECT u.id,
                    u.email,
                    u.display_name,
                    u.avatar_url,
                    u.is_guest,
                    u.rank_score,
                    u.total_songs_added,
                    u.total_upvotes_received,
                    u.role,
                    u.last_super_vote_at,
                    u.birth_year,
                    u.preferred_language,
                    COALESCE(up.spendable_points, 0) AS gold_balance,
                    COALESCE(ums.score, 0) AS monthly_rank_score
             FROM users u
             LEFT JOIN user_monthly_rank_scores ums
               ON ums.user_id = u.id AND ums.year_month = $2
             LEFT JOIN user_points up ON up.user_id = u.id
             WHERE u.id = $1`,
            [req.user?.id, currentYearMonth]
        );

        if (!result.rows[0]) {
            return sendError(res, 'User not found', 404);
        }

        return sendSuccess(res, mapCurrentUserProfile(result.rows[0] as Record<string, unknown>));
    } catch (error) {
        return sendError(res, 'Failed to fetch profile', 500);
    }
}

router.get('/me', authMiddleware, handleCurrentUserProfileRequest);

export async function handleUnifiedAccountSessionRequest(req: AuthRequest, res: Response) {
    try {
        const currentYearMonth = getIstanbulYearMonth(new Date());
        const result = await db.query(
            `SELECT u.id,
                    u.email,
                    u.display_name,
                    u.avatar_url,
                    u.is_guest,
                    u.rank_score,
                    u.total_songs_added,
                    u.total_upvotes_received,
                    u.role,
                    u.last_super_vote_at,
                    u.birth_year,
                    u.preferred_language,
                    COALESCE(ums.score, 0) AS monthly_rank_score,
                    COALESCE(up.spendable_points, 0) AS gold_balance,
                    COALESCE(up.lifetime_points, 0) AS lifetime_gold_earned
             FROM users u
             LEFT JOIN user_monthly_rank_scores ums
               ON ums.user_id = u.id AND ums.year_month = $2
             LEFT JOIN user_points up
               ON up.user_id = u.id
             WHERE u.id = $1`,
            [req.user?.id, currentYearMonth]
        );

        const row = result.rows[0] as Record<string, unknown> | undefined;
        if (!row) {
            return sendError(res, 'User not found', 404);
        }

        return sendSuccess(res, {
            user: mapCurrentUserProfile(row),
            account: {
                scope: 'radiotedu',
                surfaces: {
                    mobile: true,
                    social: true,
                    jukebox: true,
                    'study-library': true,
                    spark: false,
                    rock: false,
                },
            },
            points: {
                gold_balance: Number(row.gold_balance ?? 0),
                lifetime_gold_earned: Number(row.lifetime_gold_earned ?? 0),
            },
            endpoints: {
                social: '/social/',
                auth: '/api/v1/auth',
                study: '/api/v1/study',
                jukebox: '/api/v1/jukebox',
            },
        });
    } catch (error) {
        return sendError(res, 'Failed to fetch account session', 500);
    }
}

router.get('/session', authMiddleware, handleUnifiedAccountSessionRequest);

router.post('/upload-avatar', authMiddleware, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        await db.query(
            'UPDATE users SET avatar_url = $1 WHERE id = $2',
            [avatarUrl, req.user?.id]
        );

        return sendSuccess(res, { avatar_url: avatarUrl });
    } catch (error) {
        console.error('Avatar upload failed:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ==========================================
// Device Pairing Flow for radiotedu-tui
// ==========================================
const PAIRING_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function generatePairingCode(): string {
    const bytes = crypto.randomBytes(8);
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) {
        p1 += PAIRING_CHARSET[bytes[i] % PAIRING_CHARSET.length];
    }
    for (let i = 4; i < 8; i++) {
        p2 += PAIRING_CHARSET[bytes[i] % PAIRING_CHARSET.length];
    }
    return `${p1}-${p2}`;
}

const deviceCodeLimiter = createAuthRateLimiter(60_000, 60);
const deviceVerifyLimiter = createAuthRateLimiter(5 * 60_000, 30);

router.post('/device/code', deviceCodeLimiter, async (req: Request, res: Response) => {
    try {
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            return sendError(res, 'Valid email required', 400);
        }
        const displayName = typeof req.body?.display_name === 'string' ? req.body.display_name.trim() : null;
        const role = typeof req.body?.role === 'string' ? req.body.role.trim() : 'student';

        // Invalidate previous unclaimed codes for this email
        await db.query(
            `UPDATE device_pairing_codes
             SET claimed_at = NOW()
             WHERE LOWER(email) = $1 AND claimed_at IS NULL`,
            [email]
        );

        let code = '';
        let inserted = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            code = generatePairingCode();
            try {
                const result = await db.query(
                    `INSERT INTO device_pairing_codes (code, email, display_name, role, expires_at)
                     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
                     RETURNING code, expires_at, EXTRACT(EPOCH FROM (expires_at - NOW()))::int AS expires_in`,
                    [code, email, displayName, role]
                );
                inserted = true;
                return sendSuccess(res, {
                    code: result.rows[0].code,
                    expires_in: result.rows[0].expires_in || 600,
                    expires_at: result.rows[0].expires_at,
                }, 'Eşleme kodu başarıyla oluşturuldu.', null, 201);
            } catch (err: any) {
                if (err.code === '23505') continue; // Unique collision, retry
                throw err;
            }
        }
        if (!inserted) {
            return sendError(res, 'Eşleme kodu oluşturulamadı, lütfen tekrar deneyin.', 500);
        }
    } catch (error) {
        console.error('Failed to create device pairing code:', error);
        return sendError(res, 'Eşleme kodu oluşturulamadı.', 500);
    }
});

router.post('/device/verify', deviceVerifyLimiter, async (req: Request, res: Response) => {
    try {
        const rawCode = String(req.body?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (rawCode.length !== 8) {
            return sendError(res, 'Geçersiz veya süresi dolmuş kod.', 400);
        }
        const formattedCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;

        // Atomic claim: update and return only if active, unexpired, and unclaimed
        const claimResult = await db.query(
            `UPDATE device_pairing_codes
             SET claimed_at = NOW()
             WHERE (code = $1 OR code = $2)
               AND claimed_at IS NULL
               AND expires_at > NOW()
             RETURNING *`,
            [formattedCode, rawCode]
        );

        const pairRecord = claimResult.rows[0];
        if (!pairRecord) {
            return sendError(res, 'Geçersiz veya süresi dolmuş kod.', 400);
        }

        const email = String(pairRecord.email).trim().toLowerCase();
        const clientIp = normalizeClientIp(req.ip);
        const userAgent = String(req.headers['user-agent'] || 'radiotedu-tui');

        // Provision or find user in Jukebox PostgreSQL
        const userResult = await db.query(
            'SELECT * FROM users WHERE LOWER(email) = $1',
            [email]
        );

        let user = userResult.rows[0];
        if (user && user.is_banned) {
            return sendError(res, 'Hesap erişimi engellenmiş.', 403);
        }

        if (!user) {
            const role = pairRecord.role || ROLES.USER;
            const displayName = pairRecord.display_name || email.split('@')[0] || 'RadioTEDU Member';
            const createResult = await db.query(
                `INSERT INTO users (email, display_name, role, is_guest, last_ip, user_agent)
                 VALUES ($1, $2, $3, FALSE, $4, $5)
                 RETURNING *`,
                [email, displayName, role, clientIp, userAgent]
            );
            user = createResult.rows[0];
        } else {
            await db.query(
                'UPDATE users SET last_ip = $1, user_agent = $2 WHERE id = $3',
                [clientIp, userAgent, user.id]
            );
        }

        const tokens = await createAuthSession(
            String(user.id),
            String(user.email),
            String(user.role || ROLES.USER)
        );

        return sendSuccess(res, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name || pairRecord.display_name,
                role: user.role || pairRecord.role || 'student',
            }
        }, 'Cihaz başarıyla eşlendi.');
    } catch (error) {
        console.error('Failed to verify device pairing code:', error);
        return sendError(res, 'Cihaz eşleme işlemi başarısız oldu.', 500);
    }
});

// ==========================================
// GitHub CLI-Style Device Flow (RFC 8628)
// ==========================================

const devicePollLimiter = createAuthRateLimiter(60_000, 120);

// Initialize Device Authorization Flow (Called by radiotedu-tui CMD)
router.post('/device/init', deviceCodeLimiter, async (req: Request, res: Response) => {
    try {
        const clientIp = normalizeClientIp(req.ip);
        const userAgent = String(req.headers['user-agent'] || 'radiotedu-tui').slice(0, 255);

        // Periodically purge stale authorizations
        db.query(
            `DELETE FROM device_authorizations
             WHERE expires_at < NOW() - INTERVAL '1 day'
                OR (status IN ('claimed', 'denied') AND created_at < NOW() - INTERVAL '1 day')`
        ).catch(() => {});

        let userCode = '';
        let deviceToken = '';
        let inserted = false;

        for (let attempt = 0; attempt < 5; attempt++) {
            userCode = generatePairingCode();
            deviceToken = crypto.randomBytes(32).toString('hex');
            try {
                const result = await db.query(
                    `INSERT INTO device_authorizations (
                        device_token, user_code, status, client_ip, user_agent, expires_at
                    ) VALUES ($1, $2, 'pending', $3, $4, NOW() + INTERVAL '10 minutes')
                    RETURNING user_code, expires_at, EXTRACT(EPOCH FROM (expires_at - NOW()))::int AS expires_in`,
                    [deviceToken, userCode, clientIp, userAgent]
                );
                inserted = true;
                const row = result.rows[0];
                return sendSuccess(res, {
                    device_token: deviceToken,
                    user_code: row.user_code,
                    verification_url: `https://radiotedu.com/device?code=${row.user_code}`,
                    expires_in: row.expires_in || 600,
                    interval: 2,
                }, 'Cihaz yetkilendirme oturumu başlatıldı.', null, 201);
            } catch (err: any) {
                if (err.code === '23505') continue; // Unique constraint collision, retry
                throw err;
            }
        }
        if (!inserted) {
            return sendError(res, 'Yetkilendirme oturumu oluşturulamadı.', 500);
        }
    } catch (error) {
        console.error('Failed to init device flow:', error);
        return sendError(res, 'Yetkilendirme oturumu başlatılamadı.', 500);
    }
});

// Poll Device Authorization Status (Called every 2s by radiotedu-tui CMD)
router.post('/device/poll', devicePollLimiter, async (req: Request, res: Response) => {
    try {
        const deviceToken = String(req.body?.device_token ?? '').trim();
        if (!deviceToken || deviceToken.length !== 64) {
            return sendError(res, 'Geçersiz cihaz jetonu.', 400);
        }

        const result = await db.query(
            `SELECT da.*, EXTRACT(EPOCH FROM (da.expires_at - NOW()))::int AS seconds_left
             FROM device_authorizations da
             WHERE da.device_token = $1`,
            [deviceToken]
        );

        const record = result.rows[0];
        if (!record) {
            return sendError(res, 'Yetkilendirme oturumu bulunamadı.', 404);
        }

        if (record.seconds_left <= 0 || record.status === 'expired') {
            if (record.status !== 'expired') {
                await db.query(`UPDATE device_authorizations SET status = 'expired' WHERE id = $1`, [record.id]);
            }
            return sendSuccess(res, { status: 'expired' }, 'Oturum onay süresi doldu.');
        }

        if (record.status === 'pending') {
            return sendSuccess(res, { status: 'pending', seconds_left: record.seconds_left }, 'Onay bekleniyor.');
        }

        if (record.status === 'denied') {
            return sendSuccess(res, { status: 'denied' }, 'Oturum tarayıcıda reddedildi.');
        }

        if (record.status === 'approved') {
            // Atomically mark claimed and purge plaintext tokens from database table
            await db.query(
                `UPDATE device_authorizations
                 SET status = 'claimed',
                     claimed_at = NOW(),
                     access_token = NULL,
                     refresh_token = NULL
                 WHERE id = $1`,
                [record.id]
            );

            // Load user data
            const userRes = await db.query(
                `SELECT u.id, u.email, u.display_name, u.role, COALESCE(up.spendable_points, 0) AS gold_balance
                 FROM users u
                 LEFT JOIN user_points up ON up.user_id = u.id
                 WHERE u.id = $1`,
                [record.user_id]
            );
            const user = userRes.rows[0];

            return sendSuccess(res, {
                status: 'approved',
                access_token: record.access_token,
                refresh_token: record.refresh_token,
                user: {
                    id: user?.id || record.user_id,
                    email: user?.email || '',
                    display_name: user?.display_name || 'RadioTEDU Member',
                    role: user?.role || 'student',
                    gold_balance: Number(user?.gold_balance || 0),
                },
            }, 'Cihaz başarıyla yetkilendirildi.');
        }

        return sendSuccess(res, { status: record.status });
    } catch (error) {
        console.error('Failed to poll device flow:', error);
        return sendError(res, 'Durum kontrolü başarısız oldu.', 500);
    }
});

// Check code validity (Called by web page https://radiotedu.com/device)
router.get('/device/check-code', deviceVerifyLimiter, async (req: Request, res: Response) => {
    try {
        const rawCode = String(req.query?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (rawCode.length !== 8) {
            return sendError(res, 'Geçersiz onay kodu formatı.', 400);
        }
        const formattedCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;

        const result = await db.query(
            `SELECT id, user_code, status, expires_at,
                    EXTRACT(EPOCH FROM (expires_at - NOW()))::int AS expires_in
             FROM device_authorizations
             WHERE (user_code = $1 OR user_code = $2)
               AND expires_at > NOW()
               AND status = 'pending'`,
            [formattedCode, rawCode]
        );

        const record = result.rows[0];
        if (!record) {
            return sendError(res, 'Kod geçersiz, onaylanmış veya süresi dolmuş.', 404);
        }

        return sendSuccess(res, {
            valid: true,
            user_code: record.user_code,
            expires_in: Math.max(0, record.expires_in || 0),
        });
    } catch (error) {
        console.error('Failed to check device code:', error);
        return sendError(res, 'Kod kontrolü başarısız oldu.', 500);
    }
});

// Approve device authorization (Called by web page https://radiotedu.com/device)
router.post('/device/approve', deviceVerifyLimiter, async (req: Request, res: Response) => {
    try {
        const rawCode = String(req.body?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (rawCode.length !== 8) {
            return sendError(res, 'Geçersiz veya eksik onay kodu.', 400);
        }
        const formattedCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;

        // Verify that authorization record is pending and unexpired
        const authRecordRes = await db.query(
            `SELECT id, user_code, status
             FROM device_authorizations
             WHERE (user_code = $1 OR user_code = $2)
               AND status = 'pending'
               AND expires_at > NOW()`,
            [formattedCode, rawCode]
        );

        const authRecord = authRecordRes.rows[0];
        if (!authRecord) {
            return sendError(res, 'Kod geçersiz, önceden onaylanmış veya süresi dolmuş.', 400);
        }

        let user: any = null;

        // Check if authorization was made with Bearer token
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7).trim();
            try {
                const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as any;
                if (decoded?.sub) {
                    const userRes = await db.query(
                        'SELECT * FROM users WHERE id = $1 AND COALESCE(is_banned, FALSE) = FALSE',
                        [decoded.sub]
                    );
                    user = userRes.rows[0] || null;
                }
            } catch (err) {
                // Token invalid, fall back to body credentials
            }
        }

        // If user is registering on the spot:
        if (!user && req.body?.register && req.body?.email && req.body?.password) {
            const email = String(req.body.email).trim().toLowerCase();
            const password = String(req.body.password);
            const rawDisplayName = String(req.body.display_name || email.split('@')[0] || 'RadioTEDU Dinleyici');
            const displayName = normalizeDisplayNameInput(rawDisplayName);

            if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return sendError(res, 'Geçerli bir e-posta adresi giriniz.', 400);
            }

            if (password.length < 6 || password.length > 128) {
                return sendError(res, 'Şifre 6 ile 128 karakter arasında olmalıdır.', 400);
            }

            if (displayName.length < 2 || displayName.length > 100) {
                return sendError(res, 'Görünen ad 2 ile 100 karakter arasında olmalıdır.', 400);
            }

            const existingRes = await db.query(
                'SELECT * FROM users WHERE LOWER(email) = $1 AND COALESCE(is_banned, FALSE) = FALSE',
                [email]
            );
            const existing = existingRes.rows[0];
            if (existing) {
                // If user already exists and entered their valid password, sign them in directly!
                const isValid = await verifyAccountPassword(password, existing.password_hash);
                if (isValid) {
                    user = existing;
                } else {
                    return sendError(
                        res,
                        'Bu e-posta adresi zaten bir RadioTEDU hesabına kayıtlı. Lütfen şifrenizi kontrol edin veya Giriş Yap sekmesini kullanın.',
                        400
                    );
                }
            } else {
                const passwordHash = await bcrypt.hash(password, 10);
                const createRes = await db.query(
                    `INSERT INTO users (email, password_hash, display_name, role, last_ip, user_agent, preferred_language, birth_year)
                     VALUES ($1, $2, $3, $4, $5, $6, 'tr', 2000) RETURNING *`,
                    [email, passwordHash, displayName, ROLES.USER, normalizeClientIp(req.ip), req.headers['user-agent']]
                );
                user = createRes.rows[0];

                try {
                    await db.query(
                        `INSERT INTO legal_acceptance_events (
                            user_id, event_type, terms_version, privacy_version, age_18_confirmed, channel
                         ) VALUES ($1, 'registration', $2, $3, true, 'device')
                         ON CONFLICT (user_id, event_type) DO NOTHING`,
                        [user.id, REGISTRATION_TERMS_VERSION, REGISTRATION_PRIVACY_VERSION]
                    );
                } catch (legalErr) {
                    console.warn('[DeviceAuth] Legal event recording non-fatal error:', legalErr);
                }
            }
        } else if (!user && req.body?.email && req.body?.password) {
            // Otherwise verify email/password credentials in body
            const email = String(req.body.email).trim().toLowerCase();
            const password = String(req.body.password);

            if (email.length > 255 || password.length > 128) {
                return sendError(res, 'Geçersiz e-posta veya şifre.', 401);
            }

            const userRes = await db.query(
                'SELECT * FROM users WHERE LOWER(email) = $1 AND COALESCE(is_banned, FALSE) = FALSE',
                [email]
            );
            const candidateUser = userRes.rows[0];
            const isValid = await verifyAccountPassword(password, candidateUser?.password_hash);
            if (candidateUser && isValid) {
                user = candidateUser;
            } else {
                return sendError(res, 'Geçersiz e-posta veya şifre.', 401);
            }
        }

        if (!user) {
            return sendError(res, 'Yetkilendirme için giriş yapmanız veya kayıt olmanız gerekmektedir.', 401);
        }

        // Issue tokens for the terminal device session
        const tokens = await createAuthSession(
            String(user.id),
            String(user.email),
            String(user.role || ROLES.USER)
        );

        // Update device authorization to approved atomically
        const updateResult = await db.query(
            `UPDATE device_authorizations
             SET status = 'approved',
                 user_id = $1,
                 access_token = $2,
                 refresh_token = $3
             WHERE id = $4
               AND status = 'pending'
               AND expires_at > NOW()
             RETURNING id`,
            [user.id, tokens.access_token, tokens.refresh_token, authRecord.id]
        );

        if (!updateResult.rows[0]) {
            return sendError(res, 'Oturum onaylanamaz: istek zaman aşımına uğramış veya önceden işlenmiş.', 409);
        }

        return sendSuccess(res, {
            approved: true,
            user_code: authRecord.user_code,
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
            }
        }, 'Terminal cihazı başarıyla yetkilendirildi.');
    } catch (error) {
        console.error('Failed to approve device flow:', error);
        return sendError(res, 'Cihaz yetkilendirme işlemi başarısız oldu.', 500);
    }
});

// Deny device authorization (Called by web page https://radiotedu.com/device)
router.post('/device/deny', deviceVerifyLimiter, async (req: Request, res: Response) => {
    try {
        const rawCode = String(req.body?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (rawCode.length !== 8) {
            return sendError(res, 'Geçersiz onay kodu.', 400);
        }
        const formattedCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;

        await db.query(
            `UPDATE device_authorizations
             SET status = 'denied'
             WHERE (user_code = $1 OR user_code = $2) AND status = 'pending'`,
            [formattedCode, rawCode]
        );

        return sendSuccess(res, { denied: true }, 'Oturum isteği reddedildi.');
    } catch (error) {
        console.error('Failed to deny device flow:', error);
        return sendError(res, 'Reddetme işlemi başarısız oldu.', 500);
    }
});

export default router;
