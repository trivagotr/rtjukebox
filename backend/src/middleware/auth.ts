import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response';

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// In production these are asserted at startup (see server.ts). A deterministic
// default is only allowed under tests so the suite can run without secrets.
export const JWT_SECRET = process.env.JWT_SECRET || (IS_TEST_ENV ? 'test-secret-key' : '');
export const JWT_ISSUER = process.env.JWT_ISSUER?.trim() || 'radiotedu-api';
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE?.trim() || 'radiotedu-client';
export const JWT_ALLOW_LEGACY_TOKENS = process.env.JWT_ALLOW_LEGACY_TOKENS === 'true' || IS_TEST_ENV;

export function verifyAccessToken(token: string) {
    try {
        return jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
        });
    } catch (error) {
        if (!JWT_ALLOW_LEGACY_TOKENS) throw error;
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        if (decoded.iss !== undefined || decoded.aud !== undefined) throw error;
        return decoded;
    }
}

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

function extractAccessCookie(cookieHeader?: string) {
    if (!cookieHeader) return null;
    for (const entry of cookieHeader.split(';')) {
        const separator = entry.indexOf('=');
        if (separator < 0 || entry.slice(0, separator).trim() !== 'rtj_access') continue;
        return entry.slice(separator + 1).trim() || null;
    }
    return null;
}

function extractAccessToken(req: AuthRequest) {
    return extractBearerToken(req.headers.authorization) ?? extractAccessCookie(req.headers.cookie);
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractAccessToken(req);

    if (!token) {
        return sendError(res, 'No token provided', 401);
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded as any;
        next();
    } catch (error) {
        return sendError(res, 'Invalid or expired token', 401);
    }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractAccessToken(req);
    if (!token) return next();

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded as any;
    } catch (e) {
        // Just continue without user
    }
    next();
};
