import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
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
const REFRESH_TOKEN_HASH_PREFIX = 'sha256:';

export function createRefreshToken(userId: string, email: string, role: string) {
    return jwt.sign(
        { id: userId, email, role },
        JWT_REFRESH_SECRET,
        { expiresIn: '30d', jwtid: crypto.randomUUID() }
    );
}

export function getRefreshTokenHashInput(refreshToken: string) {
    return crypto.createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    display_name: z.string().min(2).max(100)
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
async function createAuthSession(userId: string, email: string, role: string) {
    const accessToken = jwt.sign(
        { id: userId, email, role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    const refreshToken = createRefreshToken(userId, email, role);

    const refreshTokenHash = REFRESH_TOKEN_HASH_PREFIX
        + await bcrypt.hash(getRefreshTokenHashInput(refreshToken), 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Store in DB
    await db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, refreshTokenHash, expiresAt]
    );

    return {
        access_token: accessToken,
        refresh_token: refreshToken
    };
}

async function findRefreshTokenSession(
    refreshToken: string,
    userId: string
): Promise<string | null> {
    const result = await db.query(
        `SELECT id, token_hash
         FROM refresh_tokens
         WHERE user_id = $1 AND expires_at > NOW()`,
        [userId]
    );

    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload | null;
    const canUseLegacyHash = !decoded?.jti;
    const hashInput = getRefreshTokenHashInput(refreshToken);

    for (const row of result.rows) {
        const storedHash = String(row.token_hash ?? '');
        const matchesCurrentHash = storedHash.startsWith(REFRESH_TOKEN_HASH_PREFIX)
            && await bcrypt.compare(hashInput, storedHash.slice(REFRESH_TOKEN_HASH_PREFIX.length));
        const matchesLegacyHash = canUseLegacyHash
            && !storedHash.startsWith(REFRESH_TOKEN_HASH_PREFIX)
            && await bcrypt.compare(refreshToken, storedHash);

        if (matchesCurrentHash || matchesLegacyHash) {
            return row.id;
        }
    }

    return null;
}

router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, display_name } = registerSchema.parse(req.body);
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
            return sendError(res, 'Email already registered', 400);
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
        console.error('Registration failed:', error);
        return sendError(res, 'Registration failed', 400);
    }
});

router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (!result.rows[0]) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid) {
            return sendError(res, 'Invalid credentials', 401);
        }

        // Update last IP and UA on login
        await db.query('UPDATE users SET last_ip = $1, user_agent = $2 WHERE id = $3', [req.ip, req.headers['user-agent'], user.id]);

        const tokens = await createAuthSession(user.id, user.email, user.role);
        return sendSuccess(res, {
            user: mapAuthSessionUser(user),
            ...tokens
        }, 'Login successful');
    } catch (error) {
        console.error('Login failed:', error);
        return sendError(res, 'Login failed', 500);
    }
});

router.post('/guest', async (req: Request, res: Response) => {
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
            [email, normalizedDisplayName, ROLES.GUEST, req.ip, req.headers['user-agent']]
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

router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

        const decoded = jwt.verify(
            refresh_token,
            JWT_REFRESH_SECRET
        ) as any;

        const matchedTokenId = decoded.id
            ? await findRefreshTokenSession(refresh_token, decoded.id)
            : null;

        if (!matchedTokenId) {
            return sendError(res, 'Invalid or expired refresh token', 401);
        }

        // Token Rotation: Delete old token, create new pair
        await db.query('DELETE FROM refresh_tokens WHERE id = $1', [matchedTokenId]);

        const tokens = await createAuthSession(decoded.id, decoded.email, decoded.role);
        return sendSuccess(res, tokens, 'Token refreshed');
    } catch (error) {
        return sendError(res, 'Invalid refresh token', 401);
    }
});

router.post('/logout', async (req: Request, res: Response) => {
    const logoutSucceeded = () => sendSuccess(
        res,
        { revoked: true },
        'Session logged out'
    );

    try {
        const refreshToken = String(req.body?.refresh_token ?? '').trim();
        if (!refreshToken) return logoutSucceeded();

        const decoded = jwt.verify(
            refreshToken,
            JWT_REFRESH_SECRET
        ) as { id?: string };

        if (!decoded.id) return logoutSucceeded();

        const matchedTokenId = await findRefreshTokenSession(refreshToken, decoded.id);
        if (matchedTokenId) {
            await db.query(
                'DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2',
                [matchedTokenId, decoded.id]
            );
        }

        return logoutSucceeded();
    } catch {
        // Logout is intentionally idempotent and does not reveal token state.
        return logoutSucceeded();
    }
});

router.post('/logout-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return sendError(res, 'Authentication required', 401);

        const result = await db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1',
            [userId]
        );

        return sendSuccess(
            res,
            { revoked_sessions: result.rowCount ?? 0 },
            'All sessions logged out'
        );
    } catch {
        return sendError(res, 'Failed to log out all sessions', 500);
    }
});

router.delete('/account', authMiddleware, async (req: AuthRequest, res: Response) => {
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

        if (!account.is_guest) {
            const password = String(req.body?.password ?? '');
            const passwordMatches = Boolean(account.password_hash)
                && await bcrypt.compare(password, account.password_hash);

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

export async function handleCurrentUserProfileRequest(req: AuthRequest, res: Response) {
    try {
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

export default router;
