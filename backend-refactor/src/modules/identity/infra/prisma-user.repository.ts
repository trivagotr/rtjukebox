import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { ValidationError } from '../../../core/errors/app-error.js';
import type {
  IdentityUserRecord,
  NewIdentityUser,
  NewRefreshToken,
  UserRepository,
} from '../ports/user.repository.js';

function toUserRecord(user: {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: string | null;
  isGuest: boolean | null;
  avatarUrl: string | null;
  rankScore: number | null;
  totalSongsAdded: number | null;
  totalUpvotesReceived: number | null;
  lastSuperVoteAt: Date | null;
}): IdentityUserRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    role: user.role ?? (user.isGuest ? 'guest' : 'user'),
    isGuest: user.isGuest ?? false,
    avatarUrl: user.avatarUrl,
    rankScore: user.rankScore ?? 0,
    totalSongsAdded: user.totalSongsAdded ?? 0,
    totalUpvotesReceived: user.totalUpvotesReceived ?? 0,
    lastSuperVoteAt: user.lastSuperVoteAt,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByEmail(email: string): Promise<IdentityUserRecord | null> {
    const user = await this.client.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    return user ? toUserRecord(user) : null;
  }

  async findByLoginIdentifier(identifier: string): Promise<IdentityUserRecord | null> {
    const normalized = identifier.trim().toLowerCase();
    const user = await this.client.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalized, mode: 'insensitive' } },
          { email: { equals: `${normalized}@radiotedu.com`, mode: 'insensitive' } },
          { displayName: { equals: identifier.trim(), mode: 'insensitive' } },
        ],
      },
    });
    return user ? toUserRecord(user) : null;
  }

  async findById(id: string): Promise<IdentityUserRecord | null> {
    const user = await this.client.user.findUnique({ where: { id } });
    return user ? toUserRecord(user) : null;
  }

  async create(input: NewIdentityUser): Promise<IdentityUserRecord> {
    try {
      const user = await this.client.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          role: input.role ?? 'USER',
          isGuest: input.isGuest ?? false,
        },
      });
      return toUserRecord(user);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ValidationError('Registration could not be completed');
      }
      throw error;
    }
  }

  async createRefreshToken(input: NewRefreshToken): Promise<void> {
    await this.client.refreshToken.create({ data: input });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.client.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async findActiveRefreshTokens(userId: string, now: Date) {
    return this.client.refreshToken.findMany({
      where: { userId, expiresAt: { gt: now } },
      select: { id: true, tokenHash: true, expiresAt: true },
    });
  }

  async rotateRefreshToken(tokenId: string, userId: string, nextToken: NewRefreshToken): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const deleted = await transaction.refreshToken.deleteMany({
        where: { id: tokenId, userId, expiresAt: { gt: new Date() } },
      });
      if (deleted.count !== 1) return false;
      await transaction.refreshToken.create({ data: nextToken });
      return true;
    });
  }

  async deleteRefreshToken(tokenId: string, userId: string): Promise<void> {
    await this.client.refreshToken.deleteMany({ where: { id: tokenId, userId } });
  }

  async deleteAllRefreshTokens(userId: string): Promise<void> {
    await this.client.refreshToken.deleteMany({ where: { userId } });
  }

  async isLoginLocked(identifierHash: string, now: Date): Promise<boolean> {
    const attempt = await this.client.authLoginAttempt.findUnique({ where: { identifierHash } });
    return Boolean(attempt?.lockedUntil && attempt.lockedUntil > now);
  }

  async recordLoginFailure(identifierHash: string, now: Date): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (tx) => {
          await tx.authLoginAttempt.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
          const current = await tx.authLoginAttempt.findUnique({ where: { identifierHash } });
          if (current?.lockedUntil && current.lockedUntil > now) return true;
          const failedAttempts = !current || (current.lockedUntil && current.lockedUntil <= now)
            ? 1
            : current.failedAttempts + 1;
          const lockedUntil = failedAttempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null;
          await tx.authLoginAttempt.upsert({
            where: { identifierHash },
            create: { identifierHash, failedAttempts, lockedUntil, updatedAt: now },
            update: { failedAttempts, lockedUntil, updatedAt: now },
          });
          return Boolean(lockedUntil);
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const retryable = typeof error === 'object' && error !== null && 'code' in error
          && (error.code === 'P2034' || error.code === 'P2002');
        if (!retryable || attempt === 2) throw error;
      }
    }
    return true;
  }

  async clearLoginFailures(identifierHash: string): Promise<void> {
    await this.client.authLoginAttempt.deleteMany({ where: { identifierHash } });
  }
}
