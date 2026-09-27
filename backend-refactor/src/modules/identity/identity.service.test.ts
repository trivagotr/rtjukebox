import { describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import type { IdentityUserRecord, NewIdentityUser, UserRepository } from './ports/user.repository.js';
import { IdentityService } from './identity.service.js';
import { systemClock } from '../../core/infra/system-clock.js';
import { cryptoIdGenerator } from '../../core/infra/crypto-id-generator.js';

const user: IdentityUserRecord = {
  id: '2f3c19ca-a537-4d71-923e-1a386284dc10',
  email: 'orcu@tedu.edu.tr',
  displayName: 'Orçun',
  passwordHash: null,
  role: 'user',
  isGuest: false,
  avatarUrl: null,
  rankScore: 0,
  totalSongsAdded: 0,
  totalUpvotesReceived: 0,
  lastSuperVoteAt: null,
};

function createRepository(overrides: Partial<UserRepository> = {}) {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findByLoginIdentifier: vi.fn().mockResolvedValue({ ...user }),
    findById: vi.fn().mockResolvedValue({ ...user }),
    create: vi.fn(async (input: NewIdentityUser) => ({ ...user, email: input.email, displayName: input.displayName, passwordHash: input.passwordHash })),
    createRefreshToken: vi.fn().mockResolvedValue(undefined),
    updatePasswordHash: vi.fn().mockResolvedValue(undefined),
    findActiveRefreshTokens: vi.fn().mockResolvedValue([]),
    rotateRefreshToken: vi.fn().mockResolvedValue(true),
    deleteRefreshToken: vi.fn().mockResolvedValue(undefined),
    deleteAllRefreshTokens: vi.fn().mockResolvedValue(undefined),
    isLoginLocked: vi.fn().mockResolvedValue(false),
    recordLoginFailure: vi.fn().mockResolvedValue(false),
    clearLoginFailures: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UserRepository;
}

describe('IdentityService password storage', () => {
  it('creates new accounts with Argon2id hashes', async () => {
    const repository = createRepository();
    const service = new IdentityService(repository, 'a'.repeat(32), 'b'.repeat(32), 'radiotedu-api', 'radiotedu-client', false, systemClock, cryptoIdGenerator);

    await service.register({ email: 'orcu@tedu.edu.tr', password: 'A-secure-password-123', display_name: 'Orçun' });

    const input = vi.mocked(repository.create).mock.calls[0]?.[0];
    expect(input?.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(input!.passwordHash!, 'A-secure-password-123')).resolves.toBe(true);
  });

  it('rehashes a verified legacy bcrypt password to Argon2id on login', async () => {
    const legacyHash = await bcrypt.hash('A-secure-password-123', 10);
    const repository = createRepository({
      findByLoginIdentifier: vi.fn().mockResolvedValue({ ...user, passwordHash: legacyHash }),
    });
    const service = new IdentityService(repository, 'a'.repeat(32), 'b'.repeat(32), 'radiotedu-api', 'radiotedu-client', false, systemClock, cryptoIdGenerator);

    await service.login({ email: user.email, password: 'A-secure-password-123' });

    const nextHash = vi.mocked(repository.updatePasswordHash).mock.calls[0]?.[1];
    expect(nextHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(nextHash!, 'A-secure-password-123')).resolves.toBe(true);
  });
});
