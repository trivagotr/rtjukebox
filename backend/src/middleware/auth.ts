import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthSessionQueryClient } from '../services/authSession';
import { isAuthSessionFamilyActive, isSessionFamilyId } from '../services/authSession';
import { sendError } from '../utils/response';

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// In production these are asserted at startup (see server.ts). A deterministic
// default is only allowed under tests so the suite can run without secrets.
export const JWT_SECRET = process.env.JWT_SECRET || (IS_TEST_ENV ? 'test-secret-key' : '');
export const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        sid?: string;
    };
}

export type AuthClaims = NonNullable<AuthRequest['user']> & jwt.JwtPayload;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function verifyAccessToken(token: string): AuthClaims {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (
        typeof decoded === 'string'
        || !isNonEmptyString(decoded.id)
        || !isNonEmptyString(decoded.email)
        || !isNonEmptyString(decoded.role)
        || (decoded.sid !== undefined && !isSessionFamilyId(decoded.sid))
    ) {
        throw new jwt.JsonWebTokenError('Invalid access token payload');
    }

    return decoded as AuthClaims;
}

export async function authenticateAccessToken(
    token: string,
    queryClient?: AuthSessionQueryClient,
): Promise<AuthClaims> {
    const claims = verifyAccessToken(token);
    if (
        claims.sid
        && !await isAuthSessionFamilyActive(
            claims.id,
            claims.sid,
            claims.role,
            queryClient,
        )
    ) {
        throw new jwt.JsonWebTokenError('Access token session has been revoked');
    }
    return claims;
}

export function extractBearerToken(authHeader?: string): string | null {
    if (!authHeader) {
        return null;
    }

    const [scheme, token, ...rest] = authHeader.trim().split(/\s+/);
    if (rest.length > 0 || !scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    return token;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
        return sendError(res, 'No token provided', 401);
    }

    try {
        req.user = await authenticateAccessToken(token);
        return next();
    } catch (error) {
        return sendError(res, 'Invalid or expired token', 401);
    }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return next();

    try {
        req.user = await authenticateAccessToken(token);
    } catch (e) {
        // Just continue without user
    }
    return next();
};
