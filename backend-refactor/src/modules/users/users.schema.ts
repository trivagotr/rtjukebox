import { z } from 'zod';

export const leaderboardQuerySchema = z.object({
  period: z.enum(['total']).optional(),
  category: z.enum(['total']).optional(),
}).strict();

export const meQuerySchema = z.object({ include: z.enum(['profile']).optional() }).strict();

export const profilePayloadSchema = z.object({
  favorite_song_title: z.string().max(255).nullable().optional(),
  favorite_song_artist: z.string().max(255).nullable().optional(),
  favorite_song_spotify_uri: z.string().max(120).nullable().optional(),
  favorite_artist_name: z.string().max(255).nullable().optional(),
  favorite_artist_spotify_id: z.string().max(120).nullable().optional(),
  favorite_podcast_id: z.string().uuid().nullable().optional(),
  favorite_podcast_title: z.string().max(500).nullable().optional(),
  profile_headline: z.string().max(180).nullable().optional(),
  featured_badge_id: z.string().uuid().nullable().optional(),
  theme_key: z.string().max(80).nullable().optional(),
}).strict().refine((payload) => Object.keys(payload).length > 0, 'At least one profile field is required');

export type ProfilePayload = z.infer<typeof profilePayloadSchema>;

export function normalizeProfilePayload(payload: ProfilePayload) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [
    key,
    typeof value === 'string' ? (value.trim() || null) : value,
  ])) as ProfilePayload;
}
