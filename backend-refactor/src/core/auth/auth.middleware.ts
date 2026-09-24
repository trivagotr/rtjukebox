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

function verifyAccessToken(token: string, secret: string): AuthPrincipal | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  const header = decodeSegment<{ alg?: string; typ?: string }>(encodedHeader);
  const claims = decodeSegment<{ sub?: string; role?: string; exp?: number }>(encodedPayload);
  if (header?.alg !== 'HS256' || header.typ !== 'JWT' || !claims?.sub || !claims.role
      || !Number.isInteger(claims.exp) || (claims.exp ?? 0) <= Math.floor(Date.now() / 1000)) return null;

  const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { userId: claims.sub, roles: [claims.role] };
}

export function createRequireAuth(secret: string): RequestHandler {
  return (req, _res, next) => {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
    const token = match?.[1];
    const principal = token ? verifyAccessToken(token, secret) : null;
    if (!principal) {
      next(new UnauthorizedError());
      return;
    }
    req.user = principal;
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
