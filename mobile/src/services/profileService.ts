import api from './api';

export interface ProfileCustomization {
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  favorite_song_title?: string | null;
  favorite_song_artist?: string | null;
  favorite_song_spotify_uri?: string | null;
  favorite_artist_name?: string | null;
  favorite_artist_spotify_id?: string | null;
  favorite_podcast_id?: string | null;
  favorite_podcast_title?: string | null;
  profile_headline?: string | null;
  featured_badge_id?: string | null;
  theme_key?: string | null;
}

export interface UserBadge {
  id: string;
  slug?: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  category?: string | null;
  awarded_at?: string | null;
}

export interface ProfileCustomizationResponse {
  profile: ProfileCustomization;
  badges: UserBadge[];
}

function unwrapData<T>(response: {data?: {data?: T}}): T {
  return response.data?.data as T;
}

export async function fetchProfileCustomization(): Promise<ProfileCustomizationResponse> {
  const response = await api.get('/profile/me');
  return unwrapData<ProfileCustomizationResponse>(response);
}

export async function updateProfileCustomization(payload: ProfileCustomization) {
  const response = await api.put('/profile/me', payload);
  return unwrapData(response);
}

export async function updateProfileFavorites(payload: ProfileCustomization) {
  const response = await api.put('/profile/favorites', payload);
  return unwrapData(response);
}
