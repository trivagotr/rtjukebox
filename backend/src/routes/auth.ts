import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';

const router = Router();

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    display_name: z.string().min(2).max(100)
});

// Helper to generate and store tokens
async function createAuthSession(userId: string, email: string, role: string) {
    const accessToken = jwt.sign(
        { userId, email, role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
        { userId, email, role },
        process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        { expiresIn: '30d' }
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
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

router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, display_name } = registerSchema.parse(req.body);

        // Check if user exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows[0]) {
            return sendError(res, 'Email already registered', 400);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, role) 
             VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, role`,
            [email, hashedPassword, display_name, ROLES.USER]
        );

        const user = result.rows[0];
        const tokens = await createAuthSession(user.id, user.email, user.role);

        return sendSuccess(res, { user, ...tokens }, 'Registration successful', null, 201);
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

        const tokens = await createAuthSession(user.id, user.email, user.role);
        return sendSuccess(res, {
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                rank_score: user.rank_score,
                is_guest: user.is_guest,
                role: user.role
            },
            ...tokens
        }, 'Login successful');
    } catch (error) {
        console.error('Login failed:', error);
        return sendError(res, 'Login failed', 500);
    }
});

router.post('/guest', async (req: Request, res: Response) => {
    try {
        const { display_name } = req.body;
        if (!display_name || display_name.length < 2) {
            return res.status(400).json({ error: 'Display name required' });
        }

        // Generate a random guest email
        const guestId = Math.random().toString(36).substring(7);
        const email = `guest_${guestId}@radiotedu.internal`;

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name, is_guest) 
             VALUES ($1, NULL, $2, TRUE) RETURNING *`,
            [email, display_name]
        );

        const user = result.rows[0];
        const tokens = await createAuthSession(user.id, user.email, ROLES.GUEST);

        return sendSuccess(res, {
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                is_guest: true,
                rank_score: 0,
                role: ROLES.GUEST
            },
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
            process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
        ) as any;

        // Verify token exists in DB
        const result = await db.query(
            'SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()',
            [decoded.userId]
        );

        // Find match (tokens are rotated, so there might be multiple if handled incorrectly, 
        // but here we rotate on match)
        let matchedTokenId = null;
        for (const row of result.rows) {
            const isValid = await bcrypt.compare(refresh_token, row.token_hash);
            if (isValid) {
                matchedTokenId = row.id;
                break;
            }
        }

        if (!matchedTokenId) {
            return sendError(res, 'Invalid or expired refresh token', 401);
        }

        // Token Rotation: Delete old token, create new pair
        await db.query('DELETE FROM refresh_tokens WHERE id = $1', [matchedTokenId]);

        const tokens = await createAuthSession(decoded.userId, decoded.email, decoded.role);
        return sendSuccess(res, tokens, 'Token refreshed');
    } catch (error) {
        return sendError(res, 'Invalid refresh token', 401);
    }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await db.query(
            'SELECT id, email, display_name, avatar_url, rank_score, total_songs_added, role FROM users WHERE id = $1',
            [req.user?.id]
        );

        if (!result.rows[0]) {
            return sendError(res, 'User not found', 404);
        }

        return sendSuccess(res, result.rows[0]);
    } catch (error) {
        return sendError(res, 'Failed to fetch profile', 500);
    }
});

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

        res.json({ avatar_url: avatarUrl });
    } catch (error) {
        console.error('Avatar upload failed:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

export default router;
