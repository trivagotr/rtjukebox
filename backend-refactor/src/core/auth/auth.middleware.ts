import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import type { AuthPrincipal, Role } from './auth.types.js';

function decodeSegment<T>(segment: string): T | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function verifyAccessToken(token: string, secret: string, issuer: string, audience: string, allowLegacyTokens: boolean): AuthPrincipal | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  const header = decodeSegment<{ alg?: string; typ?: string }>(encodedHeader);
  const claims = decodeSegment<{ id?: string; sub?: string; role?: string; iss?: string; aud?: string; exp?: number }>(encodedPayload);
  const userId = claims?.sub ?? claims?.id;
  const standardClaims = claims?.iss === issuer && claims.aud === audience;
  const legacyClaims = allowLegacyTokens && claims?.iss === undefined && claims?.aud === undefined;
  if (header?.alg !== 'HS256' || header.typ !== 'JWT' || !userId || !claims?.role
      || (!standardClaims && !legacyClaims)
      || !Number.isInteger(claims.exp) || (claims.exp ?? 0) <= Math.floor(Date.now() / 1000)) return null;

  const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { userId, roles: [claims.role.toUpperCase()] };
}

function readCookie(req: Parameters<RequestHandler>[0], name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function createRequireAuth(
  secret: string,
  issuer = 'radiotedu-api',
  audience = 'radiotedu-client',
  allowLegacyTokens = false,
): RequestHandler {
  return (req, _res, next) => {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
    const token = match?.[1] ?? readCookie(req, 'rtj_access');
    const principal = token ? verifyAccessToken(token, secret, issuer, audience, allowLegacyTokens) : null;
    if (!principal) {
      next(new UnauthorizedError());
      return;
    }
    req.user = principal;
    next();
  };
}

export function createOptionalAuth(
  secret: string,
  issuer = 'radiotedu-api',
  audience = 'radiotedu-client',
  allowLegacyTokens = false,
): RequestHandler {
  return (req, _res, next) => {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
    const token = match?.[1] ?? readCookie(req, 'rtj_access');
    const principal = token ? verifyAccessToken(token, secret, issuer, audience, allowLegacyTokens) : null;
    if (principal) req.user = principal;
    next();
  };
}

export function createRequireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.some((role) => req.user?.roles.includes(role))) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
