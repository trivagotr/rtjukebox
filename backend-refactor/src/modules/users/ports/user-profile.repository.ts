export type ProfileCustomizationInput = Partial<Record<
  'favorite_song_title' | 'favorite_song_artist' | 'favorite_song_spotify_uri' |
  'favorite_artist_name' | 'favorite_artist_spotify_id' | 'favorite_podcast_id' |
  'favorite_podcast_title' | 'profile_headline' | 'featured_badge_id' | 'theme_key',
  string | null
>>;

export interface UserProfileRepository {
  getProfile(userId: string): Promise<{ user: { id: string; displayName: string; avatarUrl: string | null }; profile: Record<string, unknown> | null } | null>;
  updateProfile(userId: string, input: ProfileCustomizationInput): Promise<Record<string, unknown>>;
  updateAvatar(userId: string, avatarUrl: string): Promise<{ previousAvatarUrl: string | null } | null>;
}
