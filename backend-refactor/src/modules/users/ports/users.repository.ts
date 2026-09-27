export interface PublicLeaderboardUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  rankScore: number;
  totalSongsAdded: number;
}

export interface PublicUsersRepository {
  listLeaderboard(limit: number): Promise<PublicLeaderboardUser[]>;
}
