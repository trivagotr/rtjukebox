import type { IdentityUserRecord } from '../identity/ports/user.repository.js';
import type { PublicUsersRepository } from './ports/users.repository.js';

export interface UserReader {
  findById(userId: string): Promise<IdentityUserRecord>;
}

export class UsersService {
  constructor(private readonly users: UserReader, private readonly publicUsers: PublicUsersRepository) {}

  getCurrentUser(userId: string) {
    return this.users.findById(userId);
  }

  async getLeaderboard() {
    const leaderboard = await this.publicUsers.listLeaderboard(50);
    return {
      leaderboard: leaderboard.map((user) => ({
        id: user.id,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        score: user.rankScore,
        total_rank_score: user.rankScore,
        monthly_rank_score: 0,
        total_songs_added: user.totalSongsAdded,
      })),
      period: 'total' as const,
      category: 'total' as const,
    };
  }
}
