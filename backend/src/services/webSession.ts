import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { authMiddleware, optionalAuth, type AuthRequest } from '../middleware/auth';
import { sendError } from '../utils/response';

export const WEB_ACCESS_COOKIE = 'rt_access';
export const WEB_REFRESH_COOKIE = 'rt_refresh';
export const WEB_CSRF_COOKIE = 'rt_csrf';

type AuthTokens = {
    access_token: string;
    refresh_token: string;
};

type CookieAuthRequest = AuthRequest & {
    webCookieAuth?: boolean;
};

function cookieMap(req: Request): Record<string, string> {
    const header = String(req.headers.cookie ?? '');
    return header.split(';').reduce<Record<string, string>>((result, part) => {
        const separator = part.indexOf('=');
        if (separator < 1) return result;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        try {
            result[key] = decodeURIComponent(value);
        } catch {
            result[key] = value;
        }
        return result;
    }, {});
}

function cookieOptions(httpOnly: boolean, maxAge: number): string {
    const secure = process.env.NODE_ENV === 'production'
        || (process.env.WEB_COOKIE_SECURE !== 'false' && process.env.NODE_ENV !== 'test');
    return [
        'Path=/',
        `Max-Age=${maxAge}`,
        'SameSite=Lax',
        secure ? 'Secure' : '',
        httpOnly ? 'HttpOnly' : '',
    ].filter(Boolean).join('; ');
}

export function setAuthNoStore(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return next();
}

function serializeCookie(name: string, value: string, httpOnly: boolean, maxAge: number): string {
    return `${name}=${encodeURIComponent(value)}; ${cookieOptions(httpOnly, maxAge)}`;
}

export function getWebRefreshToken(req: Request): string {
    return cookieMap(req)[WEB_REFRESH_COOKIE] ?? '';
}

export function setWebSessionCookies(res: Response, tokens: AuthTokens): string {
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    res.append('Set-Cookie', serializeCookie(WEB_ACCESS_COOKIE, tokens.access_token, true, 60 * 60 * 24));
    res.append('Set-Cookie', serializeCookie(WEB_REFRESH_COOKIE, tokens.refresh_token, true, 60 * 60 * 24 * 30));
    res.append('Set-Cookie', serializeCookie(WEB_CSRF_COOKIE, csrfToken, false, 60 * 60 * 24 * 30));
    return csrfToken;
}

export function ensureWebCsrfCookie(req: Request, res: Response): string {
    const existingToken = cookieMap(req)[WEB_CSRF_COOKIE] ?? '';
    if (existingToken) return existingToken;

    const csrfToken = crypto.randomBytes(32).toString('base64url');
    res.append('Set-Cookie', serializeCookie(WEB_CSRF_COOKIE, csrfToken, false, 60 * 60 * 24 * 30));
    return csrfToken;
}

export function clearWebSessionCookies(res: Response): void {
    res.append('Set-Cookie', serializeCookie(WEB_ACCESS_COOKIE, '', true, 0));
    res.append('Set-Cookie', serializeCookie(WEB_REFRESH_COOKIE, '', true, 0));
    res.append('Set-Cookie', serializeCookie(WEB_CSRF_COOKIE, '', false, 0));
}

function trustedOrigins(req: Request): Set<string> {
    const configured = String(process.env.WEB_AUTH_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);
    const defaults = ['https://radiotedu.com', 'https://www.radiotedu.com'];
    if (process.env.NODE_ENV !== 'production') {
        const host = req.get('host');
        if (host) defaults.push(`http://${host}`, `https://${host}`);
    }
    return new Set([...defaults, ...configured]);
}

export function requireTrustedWebOrigin(req: Request, res: Response, next: NextFunction) {
    const origin = String(req.get('origin') ?? '').replace(/\/$/, '');
    if (!origin || !trustedOrigins(req).has(origin)) {
        return sendError(res, 'Untrusted request origin', 403);
    }
    return next();
}

export function webAuthMiddleware(req: CookieAuthRequest, res: Response, next: NextFunction) {
    const hasBearer = /^Bearer\s+/i.test(String(req.headers.authorization ?? ''));
    if (!hasBearer) {
        const token = cookieMap(req)[WEB_ACCESS_COOKIE];
        if (token) {
            req.headers.authorization = `Bearer ${token}`;
            req.webCookieAuth = true;
        }
    }
    return authMiddleware(req, res, next);
}

export function optionalWebAuthMiddleware(req: CookieAuthRequest, res: Response, next: NextFunction) {
    const hasBearer = /^Bearer\s+/i.test(String(req.headers.authorization ?? ''));
    if (!hasBearer) {
        const token = cookieMap(req)[WEB_ACCESS_COOKIE];
        if (token) {
            req.headers.authorization = `Bearer ${token}`;
            req.webCookieAuth = true;
        }
    }
    return optionalAuth(req, res, next);
}

export function requireWebCsrf(req: CookieAuthRequest, res: Response, next: NextFunction) {
    if (!req.webCookieAuth) return next();
    const method = String(req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const origin = String(req.get('origin') ?? '').replace(/\/$/, '');
    if (!origin || !trustedOrigins(req).has(origin)) {
        return sendError(res, 'Untrusted request origin', 403);
    }
    const cookies = cookieMap(req);
    const cookieToken = cookies[WEB_CSRF_COOKIE] ?? '';
    const headerToken = String(req.get('X-RadioTEDU-CSRF') ?? '');
    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
        return sendError(res, 'CSRF validation failed', 403);
    }
    const valid = crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
    if (!valid) return sendError(res, 'CSRF validation failed', 403);
    return next();
}

export function currentWebCsrf(req: Request): string {
    return cookieMap(req)[WEB_CSRF_COOKIE] ?? '';
}
