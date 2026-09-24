import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { ConflictError } from '../../../core/errors/app-error.js';
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
  role: string;
  isGuest: boolean;
}): IdentityUserRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    role: user.role,
    isGuest: user.isGuest,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByEmail(email: string): Promise<IdentityUserRecord | null> {
    const user = await this.client.user.findUnique({ where: { email } });
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
        throw new ConflictError('Email already registered');
      }
      throw error;
    }
  }

  async createRefreshToken(input: NewRefreshToken): Promise<void> {
    await this.client.refreshToken.create({ data: input });
  }

  async findRefreshTokenByHash(tokenHash: string) {
    const token = await this.client.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!token) return null;
    return {
      user: toUserRecord(token.user),
      tokenId: token.id,
      expiresAt: token.expiresAt,
    };
  }

  async rotateRefreshToken(oldTokenHash: string, nextToken: NewRefreshToken): Promise<IdentityUserRecord | null> {
    return this.client.$transaction(async (transaction) => {
      const oldToken = await transaction.refreshToken.findUnique({
        where: { tokenHash: oldTokenHash },
        include: { user: true },
      });
      if (!oldToken || oldToken.expiresAt <= new Date()) return null;

      const deleted = await transaction.refreshToken.deleteMany({
        where: { id: oldToken.id, tokenHash: oldTokenHash, expiresAt: { gt: new Date() } },
      });
      if (deleted.count !== 1) return null;
      await transaction.refreshToken.create({ data: nextToken });
      return toUserRecord(oldToken.user);
    });
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.client.refreshToken.deleteMany({ where: { tokenHash } });
  }
}
