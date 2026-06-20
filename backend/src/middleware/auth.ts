import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response';

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// In production these are asserted at startup (see server.ts). A deterministic
// default is only allowed under tests so the suite can run without secrets.
export const JWT_SECRET = process.env.JWT_SECRET || (IS_TEST_ENV ? 'test-secret-key' : '');

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

function extractBearerToken(authHeader?: string): string | null {
    if (!authHeader) {
        return null;
    }

    const [scheme, token, ...rest] = authHeader.trim().split(/\s+/);
    if (rest.length > 0 || !scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    return token;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
        return sendError(res, 'No token provided', 401);
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded as any;
        next();
    } catch (error) {
        return sendError(res, 'Invalid or expired token', 401);
    }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded as any;
    } catch (e) {
        // Just continue without user
    }
    next();
};
