import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { upload, validateAvatarUpload } from '../middleware/upload';
import { authRateLimit, guestRateLimit } from '../middleware/rateLimits';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';
import { normalizeText } from '../utils/textNormalization';
import { getIstanbulYearMonth } from '../services/jukeboxScoring';
import { JWT_SECRET } from '../middleware/auth';

const router = Router();

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// In production these are asserted at startup (see server.ts). A deterministic
// default is only allowed under tests so the suite can run without secrets.
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (IS_TEST_ENV ? 'test-refresh-secret-key' : '');

const registerSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(10).max(1024),
    display_name: z.string().trim().min(2).max(100)
}).strict();
const loginSchema = z.object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(1024),
}).strict();
const guestSchema = z.object({ display_name: z.string().max(200) }).strict();
const refreshSchema = z.object({ refresh_token: z.string().min(1).max(4096) }).strict();
const emptyQuerySchema = z.object({}).strict();
const DUMMY_PASSWORD_HASH = bcrypt.hash(randomUUID(), 10);
const LOGIN_FAILURE_LIMIT = 5;

function getLoginIdentifierHash(userId: string | null, normalizedIdentifier: string) {
    const value = userId ? `user:${userId}` : `identifier:${normalizedIdentifier}`;
    return createHmac('sha256', JWT_SECRET).update(value).digest('hex');
}

async function isLoginLocked(identifierHash: string) {
    const result = await db.query(
        'SELECT locked_until > NOW() AS locked FROM auth_login_attempts WHERE identifier_hash = $1',
        [identifierHash],
    );
    return Boolean(result.rows[0]?.locked);
}

async function recordLoginFailure(identifierHash: string) {
    await db.query("DELETE FROM auth_login_attempts WHERE updated_at < NOW() - INTERVAL '24 hours'");
    const result = await db.query(
        `INSERT INTO auth_login_attempts (identifier_hash, failed_attempts, locked_until)
         VALUES ($1, 1, NULL)
         ON CONFLICT (identifier_hash) DO UPDATE SET
           failed_attempts = CASE
             WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= NOW() THEN 1
             ELSE auth_login_attempts.failed_attempts + 1
           END,
           locked_until = CASE
             WHEN (CASE
               WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= NOW() THEN 1
               ELSE auth_login_attempts.failed_attempts + 1
             END) >= $2 THEN NOW() + INTERVAL '15 minutes'
             ELSE NULL
           END,
           updated_at = NOW()
         RETURNING locked_until > NOW() AS locked`,
        [identifierHash, LOGIN_FAILURE_LIMIT],
    );
    return Boolean(result.rows[0]?.locked);
}

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

export function normalizeDisplayNameInput(displayName: string): string {
    return normalizeText(displayName);
}

export function mapCurrentUserProfile(row: Record<string, unknown>) {
    return {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        avatar_url: row.avatar_url ?? null,
        rank_score: Number(row.rank_score ?? 0),
        monthly_rank_score: Number(row.monthly_rank_score ?? 0),
        total_songs_added: Number(row.total_songs_added ?? 0),
        role: row.role,
        last_super_vote_at: row.last_super_vote_at ?? null,
    };
}

export function mapAuthSessionUser(row: Record<string, unknown>) {
    const isGuest = Boolean(row.is_guest);
    return {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        avatar_url: row.avatar_url ?? null,
        rank_score: Number(row.rank_score ?? 0),
        is_guest: isGuest,
        role: row.role ?? (isGuest ? ROLES.GUEST : ROLES.USER),
        total_songs_added: Number(row.total_songs_added ?? 0),
        total_upvotes_received: Number(row.total_upvotes_received ?? 0),
        last_super_vote_at: row.last_super_vote_at ?? null,
    };
}

// Helper to generate and store tokens
async function createAuthSession(userId: string, email: string, role: string, dbClient: Pick<typeof db, 'query'> = db) {
    const accessToken = jwt.sign(
        { id: userId, email, role },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
        { id: userId, email, role },
        JWT_REFRESH_SECRET,
        { algorithm: 'HS256', expiresIn: '30d' }
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Store in DB
    await dbClient.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, refreshTokenHash, expiresAt]
    );

    return {
        access_token: accessToken,
        refresh_token: refreshToken
    };
}

router.post('/register', authRateLimit, async (req: Request, res: Response) => {
    try {
        if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Invalid registration query', 400, 'INVALID_REGISTRATION');
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) return sendError(res, 'Invalid registration payload', 400, 'INVALID_REGISTRATION');
        const { email, password, display_name } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedDisplayName = normalizeDisplayNameInput(display_name);

        if (!isAllowedRegistrationEmail(normalizedEmail)) {
            return sendError(res, 'Unsupported email provider', 400);
        }

        if (normalizedDisplayName.length < 2) {
            return sendError(res, 'Display name required', 400);
        }

        // Check if user exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existing.rows[0]) {
            return sendError(res, 'Registration could not be completed', 400, 'REGISTRATION_UNAVAILABLE');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, role, last_ip, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [normalizedEmail, hashedPassword, normalizedDisplayName, ROLES.USER, req.ip, req.headers['user-agent']]
        );

        const user = result.rows[0];
        const tokens = await createAuthSession(user.id, user.email, user.role);

        return sendSuccess(res, { user: mapAuthSessionUser(user), ...tokens }, 'Registration successful', null, 201);
    } catch (error) {
        console.error('Registration failed:', error instanceof Error ? error.name : 'Error');
        return sendError(res, 'Registration failed', 500);
    }
});

router.post('/login', authRateLimit, async (req: Request, res: Response) => {
    try {
        if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Invalid login query', 400, 'INVALID_CREDENTIALS');
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendError(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }
        const { email, password } = parsed.data;
        const inputIdentifier = email;
        if (!inputIdentifier) {
            return sendError(res, 'Invalid credentials', 401);
        }

        const normalizedIdentifier = inputIdentifier.trim().toLowerCase();
        const result = await db.query(
            `SELECT * FROM users 
             WHERE LOWER(TRIM(email)) = $1 
                OR LOWER(TRIM(email)) = $1 || '@radiotedu.com'
                OR LOWER(TRIM(display_name)) = $1
             LIMIT 1`,
            [normalizedIdentifier]
        );

        const user = result.rows[0] ?? null;
        const identifierHash = getLoginIdentifierHash(user?.id ?? null, normalizedIdentifier);
        if (await isLoginLocked(identifierHash)) {
            return sendError(res, 'Invalid credentials', 429, 'LOGIN_TEMPORARILY_LOCKED');
        }

        const passwordHash = user?.password_hash ?? await DUMMY_PASSWORD_HASH;
        const valid = await bcrypt.compare(password, passwordHash);

        if (!user || !valid) {
            const locked = await recordLoginFailure(identifierHash);
            if (locked) return sendError(res, 'Invalid credentials', 429, 'LOGIN_TEMPORARILY_LOCKED');
            return sendError(res, 'Invalid credentials', 401);
        }

        await db.query('DELETE FROM auth_login_attempts WHERE identifier_hash = $1', [identifierHash]);

        // Update last IP and UA on login (best-effort)
        try {
            const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
            const cleanIp = rawIp?.replace(/^::ffff:/, '').replace(/:\d+$/, '');
            await db.query('UPDATE users SET last_ip = $1, user_agent = $2 WHERE id = $3', [cleanIp || null, req.headers['user-agent'] || null, user.id]);
        } catch (ipErr) {
            console.warn('Failed to update user last_ip/user_agent:', ipErr);
        }

        const tokens = await createAuthSession(user.id, user.email, user.role);
        return sendSuccess(res, {
            user: mapAuthSessionUser(user),
            ...tokens
        }, 'Login successful');
    } catch (error) {
        console.error('Login failed:', error instanceof Error ? error.name : 'Error');
        return sendError(res, 'Login failed', 500);
    }
});

router.post('/guest', guestRateLimit, async (req: Request, res: Response) => {
    try {
        if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Invalid guest query', 400, 'INVALID_GUEST_PROFILE');
        const parsed = guestSchema.safeParse(req.body);
        if (!parsed.success) return sendError(res, 'Invalid guest profile payload', 400, 'INVALID_GUEST_PROFILE');
        const normalizedDisplayName = normalizeDisplayNameInput(parsed.data.display_name);
        if (!normalizedDisplayName || normalizedDisplayName.length < 2) {
            return res.status(400).json({ error: 'Display name required' });
        }

        // Generate a random guest email
        const guestId = randomUUID();
        const email = `guest_${guestId}@radiotedu.internal`;

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, is_guest, role, last_ip, user_agent)
             VALUES ($1, NULL, $2, TRUE, $3, $4, $5) RETURNING *`,
            [email, normalizedDisplayName, ROLES.GUEST, req.ip, req.headers['user-agent']]
        );

        const user = result.rows[0];
        const tokens = await createAuthSession(user.id, user.email, ROLES.GUEST);

        return sendSuccess(res, {
            user: mapAuthSessionUser(user),
            ...tokens
        }, 'Guest login successful', null, 201);
    } catch (error) {
        console.error('Guest login failed:', error instanceof Error ? error.name : 'Error');
        return sendError(res, 'Guest login failed', 500);
    }
});

router.post('/refresh', authRateLimit, async (req: Request, res: Response) => {
    try {
        if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Invalid refresh query', 400, 'INVALID_REFRESH_TOKEN');
        const parsed = refreshSchema.safeParse(req.body);
        if (!parsed.success) return sendError(res, 'Refresh token required', 400, 'INVALID_REFRESH_TOKEN');
        const { refresh_token } = parsed.data;

        const decoded = jwt.verify(refresh_token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload & {
            id?: string;
            email?: string;
            role?: string;
        };
        if (!decoded.id || !z.string().uuid().safeParse(decoded.id).success || !decoded.email || !decoded.role) {
            return sendError(res, 'Invalid or expired refresh token', 401);
        }

        const rotation = await db.transaction(async (client) => {
            const result = await client.query(
                'SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW() FOR UPDATE',
                [decoded.id],
            );
            let matchedTokenId: string | null = null;
            for (const row of result.rows) {
                if (await bcrypt.compare(refresh_token, row.token_hash)) {
                    matchedTokenId = row.id;
                    break;
                }
            }

            if (!matchedTokenId) {
                await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [decoded.id]);
                return null;
            }

            const deleted = await client.query(
                'DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
                [matchedTokenId, decoded.id],
            );
            if (deleted.rows.length !== 1) {
                await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [decoded.id]);
                return null;
            }

            return createAuthSession(decoded.id!, decoded.email!, decoded.role!, client);
        });

        if (!rotation) return sendError(res, 'Invalid or expired refresh token', 401);
        return sendSuccess(res, rotation, 'Token refreshed');
    } catch (error) {
        return sendError(res, 'Invalid refresh token', 401);
    }
});

export async function handleCurrentUserProfileRequest(req: AuthRequest, res: Response) {
    try {
        if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Unexpected profile query parameters', 400, 'INVALID_QUERY');
        const currentYearMonth = getIstanbulYearMonth(new Date());
        const result = await db.query(
            `SELECT u.id,
                    u.email,
                    u.display_name,
                    u.avatar_url,
                    u.rank_score,
                    u.total_songs_added,
                    u.role,
                    u.last_super_vote_at,
                    COALESCE(ums.score, 0) AS monthly_rank_score
             FROM users u
             LEFT JOIN user_monthly_rank_scores ums
               ON ums.user_id = u.id AND ums.year_month = $2
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

router.post('/upload-avatar', authMiddleware, upload.single('avatar'), validateAvatarUpload, async (req: AuthRequest, res: Response) => {
    try {
        if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Unexpected avatar upload query parameters', 400, 'INVALID_QUERY');
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

export default router;
