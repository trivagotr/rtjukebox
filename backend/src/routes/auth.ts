import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';

const router = Router();

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    display_name: z.string().min(2).max(100)
});

router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, display_name } = registerSchema.parse(req.body);
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (email, password_hash, display_name) 
       VALUES ($1, $2, $3) RETURNING id, email, display_name`,
            [email, hashedPassword, display_name]
        );

        const user = result.rows[0];
        const tokens = generateTokens(user.id, user.email);

        res.status(201).json({ user, ...tokens });
    } catch (error) {
        res.status(400).json({ error: 'Registration failed' });
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
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokens = generateTokens(user.id, user.email);
        res.json({
            user: { id: user.id, email: user.email, display_name: user.display_name },
            ...tokens
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refresh_token } = req.body;
        const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as any;
        const tokens = generateTokens(decoded.userId, decoded.email);
        res.json(tokens);
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

function generateTokens(userId: string, email: string) {
    const access_token = jwt.sign(
        { userId, email },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
    );
    const refresh_token = jwt.sign(
        { userId, email },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '30d' }
    );
    return { access_token, refresh_token };
}

export default router;
