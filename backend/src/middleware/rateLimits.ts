import rateLimit, { Options } from 'express-rate-limit';
import { AuthRequest } from './auth';

type RateLimitConfig = Pick<Options, 'windowMs' | 'limit'> & Partial<Pick<Options, 'keyGenerator'>>;

function createRateLimit(options: RateLimitConfig) {
    return rateLimit({
        ...options,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({
            success: false,
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            requestId: req.requestId,
        }),
    });
}

const userKey = (req: AuthRequest) => `user:${req.user!.id}`;

export const authRateLimit = createRateLimit({ windowMs: 60_000, limit: 5 });
export const guestRateLimit = createRateLimit({ windowMs: 60 * 60_000, limit: 3 });
export const writeRateLimit = createRateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (req) => userKey(req as AuthRequest) });
export const heartbeatRateLimit = createRateLimit({ windowMs: 60_000, limit: 1, keyGenerator: (req) => userKey(req as AuthRequest) });
export const adminRateLimit = createRateLimit({ windowMs: 60_000, limit: 100, keyGenerator: (req) => userKey(req as AuthRequest) });
export const readRateLimit = createRateLimit({ windowMs: 60_000, limit: 120 });
