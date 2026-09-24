import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConflictError, UnauthorizedError, ValidationError } from '../../core/errors/app-error.js';
import type {
  IdentityUserRecord,
  NewIdentityUser,
  UserRepository,
} from './ports/user.repository.js';

const scrypt = promisify(scryptCallback);
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'yahoo.com', 'yandex.com', 'proton.me',
  'protonmail.com', 'tedu.edu.tr', 'radiotedu.com',
]);

export interface IdentitySession {
  user: IdentityUserRecord;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function isAllowedRegistrationEmail(email: string) {
  const domain = email.split('@').pop() ?? '';
  return ALLOWED_EMAIL_DOMAINS.has(domain) || domain.endsWith('.edu.tr');
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  const [algorithm, saltValue, hashValue] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return timingSafeEqual(actual, expected);
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function signAccessToken(user: IdentityUserRecord, secret: string, now: Date) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    sub: user.id,
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly accessTokenSecret: string,
    private readonly refreshTokenSecret: string,
  ) {}

  async register(input: { email: string; password: string; display_name: string }): Promise<IdentitySession> {
    const email = input.email.trim().toLowerCase();
    if (!isAllowedRegistrationEmail(email)) throw new ValidationError('Unsupported email provider');
    const displayName = input.display_name.trim().normalize('NFKC');
    if (displayName.length < 2) throw new ValidationError('Display name required');
    if (await this.users.findByEmail(email)) throw new ConflictError('Email already registered');

    const userInput: NewIdentityUser = {
      email,
      displayName,
      passwordHash: await hashPassword(input.password),
      role: 'USER',
      isGuest: false,
    };
    return this.createSession(await this.users.create(userInput));
  }

  async login(input: { email: string; password: string }): Promise<IdentitySession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user || user.isGuest || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError();
    }
    return this.createSession(user);
  }

  async createGuest(displayName: string): Promise<IdentitySession> {
    const normalizedDisplayName = displayName.trim().normalize('NFKC');
    if (normalizedDisplayName.length < 2) throw new ValidationError('Display name required');
    const user = await this.users.create({
      email: `guest_${randomUUID()}@guest.radiotedu.internal`,
      displayName: normalizedDisplayName,
      passwordHash: null,
      role: 'GUEST',
      isGuest: true,
    });
    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<IdentitySession> {
    const oldHash = this.hashRefreshToken(refreshToken);
    const newToken = randomBytes(32).toString('base64url');
    const nextToken = {
      userId: '',
      tokenHash: this.hashRefreshToken(newToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    };
    const stored = await this.users.findRefreshTokenByHash(oldHash);
    if (!stored || stored.expiresAt <= new Date()) throw new UnauthorizedError('Invalid or expired refresh token');
    nextToken.userId = stored.user.id;
    const user = await this.users.rotateRefreshToken(oldHash, nextToken);
    if (!user) throw new UnauthorizedError('Invalid or expired refresh token');
    return {
      user,
      access_token: signAccessToken(user, this.accessTokenSecret, new Date()),
      refresh_token: newToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async logout(refreshToken: string) {
    await this.users.deleteRefreshToken(this.hashRefreshToken(refreshToken));
  }

  private async createSession(user: IdentityUserRecord): Promise<IdentitySession> {
    const now = new Date();
    const refreshToken = randomBytes(32).toString('base64url');
    await this.users.createRefreshToken({
      userId: user.id,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    });
    return {
      user,
      access_token: signAccessToken(user, this.accessTokenSecret, now),
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private hashRefreshToken(token: string) {
    return createHmac('sha256', this.refreshTokenSecret).update(token).digest('hex');
  }
}
