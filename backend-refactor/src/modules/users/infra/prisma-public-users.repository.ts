import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { PublicLeaderboardUser, PublicUsersRepository } from '../ports/users.repository.js';

export class PrismaPublicUsersRepository implements PublicUsersRepository {
  constructor(private readonly client: PrismaClient) {}

  async listLeaderboard(limit: number) {
    const users = await this.client.user.findMany({
      where: { isGuest: false, role: { not: 'admin' } },
      select: { id: true, displayName: true, avatarUrl: true, rankScore: true, totalSongsAdded: true },
      orderBy: [{ rankScore: 'desc' }, { displayName: 'asc' }],
      take: limit,
    });
    return users.map((user): PublicLeaderboardUser => ({
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      rankScore: user.rankScore ?? 0,
      totalSongsAdded: user.totalSongsAdded ?? 0,
    }));
  }
}
