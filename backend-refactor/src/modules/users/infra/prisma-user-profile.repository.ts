import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { ProfileCustomizationInput, UserProfileRepository } from '../ports/user-profile.repository.js';

const toPrismaData = (input: ProfileCustomizationInput) => ({
  ...(input.favorite_song_title !== undefined ? { favoriteSongTitle: input.favorite_song_title } : {}),
  ...(input.favorite_song_artist !== undefined ? { favoriteSongArtist: input.favorite_song_artist } : {}),
  ...(input.favorite_song_spotify_uri !== undefined ? { favoriteSongSpotifyUri: input.favorite_song_spotify_uri } : {}),
  ...(input.favorite_artist_name !== undefined ? { favoriteArtistName: input.favorite_artist_name } : {}),
  ...(input.favorite_artist_spotify_id !== undefined ? { favoriteArtistSpotifyId: input.favorite_artist_spotify_id } : {}),
  ...(input.favorite_podcast_id !== undefined ? { favoritePodcastId: input.favorite_podcast_id } : {}),
  ...(input.favorite_podcast_title !== undefined ? { favoritePodcastTitle: input.favorite_podcast_title } : {}),
  ...(input.profile_headline !== undefined ? { profileHeadline: input.profile_headline } : {}),
  ...(input.featured_badge_id !== undefined ? { featuredBadgeId: input.featured_badge_id } : {}),
  ...(input.theme_key !== undefined ? { themeKey: input.theme_key } : {}),
});

function toDtoRow(row: {
  favoriteSongTitle: string | null; favoriteSongArtist: string | null; favoriteSongSpotifyUri: string | null;
  favoriteArtistName: string | null; favoriteArtistSpotifyId: string | null; favoritePodcastId: string | null;
  favoritePodcastTitle: string | null; profileHeadline: string | null; featuredBadgeId: string | null;
  themeKey: string | null; updatedAt: Date | null;
}) {
  return {
    favorite_song_title: row.favoriteSongTitle,
    favorite_song_artist: row.favoriteSongArtist,
    favorite_song_spotify_uri: row.favoriteSongSpotifyUri,
    favorite_artist_name: row.favoriteArtistName,
    favorite_artist_spotify_id: row.favoriteArtistSpotifyId,
    favorite_podcast_id: row.favoritePodcastId,
    favorite_podcast_title: row.favoritePodcastTitle,
    profile_headline: row.profileHeadline,
    featured_badge_id: row.featuredBadgeId,
    theme_key: row.themeKey,
    updated_at: row.updatedAt,
  };
}

export class PrismaUserProfileRepository implements UserProfileRepository {
  constructor(private readonly client: PrismaClient) {}

  async getProfile(userId: string) {
    const user = await this.client.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, avatarUrl: true, profileCustomization: true },
    });
    if (!user) return null;
    return {
      user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      profile: user.profileCustomization ? toDtoRow(user.profileCustomization) : null,
    };
  }

  async updateProfile(userId: string, input: ProfileCustomizationInput) {
    const row = await this.client.userProfileCustomization.upsert({
      where: { userId },
      create: { userId, ...toPrismaData(input), updatedAt: new Date() },
      update: { ...toPrismaData(input), updatedAt: new Date() },
    });
    return toDtoRow(row);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.client.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
      if (!user) return null;
      await tx.user.update({ where: { id: userId }, data: { avatarUrl } });
      return { previousAvatarUrl: user.avatarUrl };
    });
  }
}
