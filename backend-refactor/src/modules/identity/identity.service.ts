import { createHmac, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { TooManyRequestsError, UnauthorizedError, ValidationError } from '../../core/errors/app-error.js';
import type {
  IdentityUserRecord,
  NewIdentityUser,
  NewRefreshToken,
  UserRepository,
} from './ports/user.repository.js';
import type { Clock } from '../../core/ports/clock.port.js';
import type { IdGenerator } from '../../core/ports/id-generator.port.js';

const scrypt = promisify(scryptCallback);
const DUMMY_PASSWORD_HASH = argon2.hash(randomUUID(), { type: argon2.argon2id });
const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'yahoo.com', 'yandex.com', 'proton.me',
  'protonmail.com', 'tedu.edu.tr', 'radiotedu.com',
]);

export interface IdentitySession {
  user: IdentityUserRecord;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface JwtClaims {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

function normalizeRole(role: string) {
  return role.trim().toLowerCase();
}

function isAllowedRegistrationEmail(email: string) {
  const domain = email.split('@').pop() ?? '';
  return ALLOWED_EMAIL_DOMAINS.has(domain) || domain.endsWith('.edu.tr');
}

async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function verifyPassword(password: string, passwordHash: string | null): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!passwordHash) return { valid: false, needsRehash: false };
  if (passwordHash.startsWith('$argon2id$')) {
    try { return { valid: await argon2.verify(passwordHash, password), needsRehash: false }; }
    catch { return { valid: false, needsRehash: false }; }
  }
  if (/^\$2[aby]\$/.test(passwordHash)) return { valid: await bcrypt.compare(password, passwordHash), needsRehash: true };

  // Keep passwords created by the short-lived scaffold readable during migration.
  const [algorithm, saltValue, hashValue] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return { valid: false, needsRehash: false };
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  if (!expected.length || expected.length > 128 || !salt.length) return { valid: false, needsRehash: false };
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return { valid: timingSafeEqual(actual, expected), needsRehash: true };
}

function encode(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function signToken(
  claims: Omit<JwtClaims, 'iss' | 'aud' | 'iat' | 'exp'>,
  secret: string,
  issuer: string,
  audience: string,
  now: Date,
  ttlSeconds: number,
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({
    ...claims,
    iss: issuer,
    aud: audience,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function verifyToken(token: string, secret: string, issuer: string, audience: string, now: Date, allowLegacyTokens: boolean): JwtClaims | null {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra !== undefined) return null;
  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtClaims;
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const standardClaims = claims.iss === issuer && claims.aud === audience;
    const legacyClaims = allowLegacyTokens && claims.iss === undefined && claims.aud === undefined;
    if (!standardClaims && !legacyClaims) return null;
    if (!Number.isInteger(claims.exp) || (claims.exp ?? 0) <= Math.floor(now.getTime() / 1000)) return null;
    if (!(claims.sub || claims.id) || !claims.role) return null;
    const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
    const actual = Buffer.from(encodedSignature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return claims;
  } catch {
    return null;
  }
}

export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly accessTokenSecret: string,
    private readonly refreshTokenSecret: string,
    private readonly issuer = 'radiotedu-api',
    private readonly audience = 'radiotedu-client',
    private readonly allowLegacyTokens = false,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async register(input: { email: string; password: string; display_name: string }): Promise<IdentitySession> {
    const email = input.email.trim().toLowerCase();
    if (!isAllowedRegistrationEmail(email)) throw new ValidationError('Unsupported email provider');
    const displayName = input.display_name.trim().normalize('NFKC');
    if (displayName.length < 2) throw new ValidationError('Display name required');
    if (await this.users.findByEmail(email)) {
      await hashPassword(input.password);
      // Preserve the active API's generic 400 response for duplicate/invalid registrations.
      throw new ValidationError('Registration could not be completed');
    }

    const userInput: NewIdentityUser = {
      email,
      displayName,
      passwordHash: await hashPassword(input.password),
      role: 'user',
      isGuest: false,
    };
    return this.createSession(await this.users.create(userInput));
  }

  async login(input: { email: string; password: string }): Promise<IdentitySession> {
    const identifier = input.email.trim().toLowerCase();
    const user = await this.users.findByLoginIdentifier(identifier);
    const identifierHash = this.loginIdentifierHash(user?.id ?? null, identifier);
    const now = this.clock.now();
    if (await this.users.isLoginLocked(identifierHash, now)) throw new TooManyRequestsError();

    const passwordHash = user?.passwordHash ?? await DUMMY_PASSWORD_HASH;
    const verification = await verifyPassword(input.password, passwordHash);
    if (!user || user.isGuest || !verification.valid) {
      const locked = await this.users.recordLoginFailure(identifierHash, now);
      if (locked) throw new TooManyRequestsError();
      throw new UnauthorizedError();
    }
    if (verification.needsRehash) await this.users.updatePasswordHash(user.id, await hashPassword(input.password));
    await this.users.clearLoginFailures(identifierHash);
    return this.createSession(user);
  }

  async createGuest(displayName: string): Promise<IdentitySession> {
    const normalizedDisplayName = displayName.trim().normalize('NFKC');
    if (normalizedDisplayName.length < 2) throw new ValidationError('Display name required');
    const user = await this.users.create({
      email: `guest_${this.ids.generate()}@radiotedu.internal`,
      displayName: normalizedDisplayName,
      passwordHash: null,
      role: 'guest',
      isGuest: true,
    });
    return this.createGuestSession(user);
  }

  async refresh(refreshToken: string): Promise<IdentitySession> {
    const now = this.clock.now();
    const claims = verifyToken(refreshToken, this.refreshTokenSecret, this.issuer, 'radiotedu-refresh', now, this.allowLegacyTokens);
    const userId = claims?.sub ?? claims?.id;
    if (!claims || !userId) throw new UnauthorizedError('Invalid or expired refresh token');

    const candidates = await this.users.findActiveRefreshTokens(userId, now);
    let matchedTokenId: string | null = null;
    for (const candidate of candidates) {
      if (await bcrypt.compare(refreshToken, candidate.tokenHash)) {
        matchedTokenId = candidate.id;
        break;
      }
    }
    if (!matchedTokenId) {
      await this.users.deleteAllRefreshTokens(userId);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await this.users.findById(userId);
    if (!user || user.isGuest || normalizeRole(claims.role ?? '') === 'guest') {
      await this.users.deleteAllRefreshTokens(userId);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
    const next = this.createRefreshToken(user, now);
    next.record.tokenHash = await bcrypt.hash(next.token, 10);
    const rotated = await this.users.rotateRefreshToken(matchedTokenId, user.id, next.record);
    if (!rotated) {
      await this.users.deleteAllRefreshTokens(userId);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
    return {
      user,
      access_token: this.createAccessToken(user, now),
      refresh_token: next.token,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async logout(refreshToken: string) {
    const now = this.clock.now();
    const claims = verifyToken(refreshToken, this.refreshTokenSecret, this.issuer, 'radiotedu-refresh', now, this.allowLegacyTokens);
    const userId = claims?.sub ?? claims?.id;
    if (!claims || !userId) return;
    const candidates = await this.users.findActiveRefreshTokens(userId, now);
    for (const candidate of candidates) {
      if (await bcrypt.compare(refreshToken, candidate.tokenHash)) {
        await this.users.deleteRefreshToken(candidate.id, userId);
        return;
      }
    }
  }

  async findById(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError('User session is no longer valid');
    return user;
  }

  private createAccessToken(user: IdentityUserRecord, now: Date) {
    return signToken(
      { id: user.id, sub: user.id, email: user.email, role: normalizeRole(user.role) },
      this.accessTokenSecret,
      this.issuer,
      this.audience,
      now,
      ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  private loginIdentifierHash(userId: string | null, normalizedIdentifier: string) {
    const key = userId ? `user:${userId}` : `identifier:${normalizedIdentifier}`;
    return createHmac('sha256', this.accessTokenSecret).update(key).digest('hex');
  }

  private createRefreshToken(user: IdentityUserRecord, now: Date) {
    const token = signToken(
      { id: user.id, sub: user.id, email: user.email, role: normalizeRole(user.role) },
      this.refreshTokenSecret,
      this.issuer,
      'radiotedu-refresh',
      now,
      REFRESH_TOKEN_TTL_SECONDS,
    );
    const record: NewRefreshToken = {
      userId: user.id,
      tokenHash: '',
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    };
    return { token, record };
  }

  private async createSession(user: IdentityUserRecord): Promise<IdentitySession> {
    const now = this.clock.now();
    const accessToken = this.createAccessToken(user, now);
    if (normalizeRole(user.role) === 'guest' || user.isGuest) {
      return { user, access_token: accessToken, expires_in: ACCESS_TOKEN_TTL_SECONDS };
    }

    const refresh = this.createRefreshToken(user, now);
    refresh.record.tokenHash = await bcrypt.hash(refresh.token, 10);
    await this.users.createRefreshToken(refresh.record);
    return {
      user,
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async createGuestSession(user: IdentityUserRecord): Promise<IdentitySession> {
    const now = this.clock.now();
    return {
      user,
      access_token: this.createAccessToken(user, now),
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
