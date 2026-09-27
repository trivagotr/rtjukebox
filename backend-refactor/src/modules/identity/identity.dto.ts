import type { IdentityUserRecord } from './ports/user.repository.js';

export interface IdentityUserDto {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_guest: boolean;
  avatar_url: string | null;
  rank_score: number;
  total_songs_added: number;
  total_upvotes_received: number;
  last_super_vote_at: string | null;
}

export function toIdentityUserDto(user: IdentityUserRecord): IdentityUserDto {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    role: user.role,
    is_guest: user.isGuest,
    avatar_url: user.avatarUrl,
    rank_score: user.rankScore,
    total_songs_added: user.totalSongsAdded,
    total_upvotes_received: user.totalUpvotesReceived,
    last_super_vote_at: user.lastSuperVoteAt?.toISOString() ?? null,
  };
}
