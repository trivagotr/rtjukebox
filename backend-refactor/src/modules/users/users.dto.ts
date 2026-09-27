export function toProfileDto(user: { id: string; displayName: string; avatarUrl: string | null }, row: Record<string, unknown> | null) {
  return {
    user_id: user.id,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    favorite_song_title: row?.favorite_song_title ?? null,
    favorite_song_artist: row?.favorite_song_artist ?? null,
    favorite_song_spotify_uri: row?.favorite_song_spotify_uri ?? null,
    favorite_artist_name: row?.favorite_artist_name ?? null,
    favorite_artist_spotify_id: row?.favorite_artist_spotify_id ?? null,
    favorite_podcast_id: row?.favorite_podcast_id ?? null,
    favorite_podcast_title: row?.favorite_podcast_title ?? null,
    profile_headline: row?.profile_headline ?? null,
    featured_badge_id: row?.featured_badge_id ?? null,
    theme_key: row?.theme_key ?? null,
    updated_at: row?.updated_at ?? null,
  };
}
