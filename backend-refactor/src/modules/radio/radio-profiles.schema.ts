import { z } from 'zod';

export const profileIdSchema = z.object({ id: z.string().uuid() }).strict();
export const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  autoplay_spotify_playlist_uri: z.string().trim().max(255).nullable().optional(),
  jingle_every_n_songs: z.number().int().min(1).max(1000).nullable().optional(),
  ad_break_interval_minutes: z.number().int().min(1).max(1440).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();
export const updateProfileSchema = createProfileSchema.partial().strict();
export const attachAssetSchema = z.object({ song_id: z.string().uuid(), slot_type: z.enum(['jingle', 'ad']), sort_order: z.number().int().min(0).max(10000).nullable().optional() }).strict();
export const deviceProfileSchema = z.object({ radio_profile_id: z.string().uuid().nullable() }).strict();
export const deviceOverrideSchema = z.object({
  override_enabled: z.boolean(),
  autoplay_spotify_playlist_uri: z.string().trim().max(255).nullable().optional(),
  jingle_every_n_songs: z.number().int().min(1).max(1000).nullable().optional(),
  ad_break_interval_minutes: z.number().int().min(1).max(1440).nullable().optional(),
}).strict();
