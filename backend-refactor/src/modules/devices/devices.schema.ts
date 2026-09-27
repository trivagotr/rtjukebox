import { z } from 'zod';

export const emptyQuerySchema = z.object({}).strict();
export const adminDeviceIdSchema = z.object({ id: z.string().uuid() }).strict();
export const createAdminDeviceSchema = z.object({ device_code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(160), location: z.string().max(255).nullable().optional(), password: z.string().trim().min(1).max(50) }).strict();
export const updateAdminDeviceSchema = z.object({ name: z.string().trim().min(1).max(160).nullable().optional(), location: z.string().max(255).nullable().optional(), is_active: z.boolean().optional(), password: z.string().max(50).optional(), override_autoplay_spotify_playlist_uri: z.string().max(512).nullable().optional(), fallback_playlist_url: z.string().max(512).nullable().optional(), override_enabled: z.boolean().optional() }).strict().refine((body) => Object.keys(body).length > 0);
export const spotifyPlaybackTargetSchema = z.object({ spotify_playback_device_id: z.string().max(255).nullable().optional(), spotify_player_name: z.string().max(160).nullable().optional() }).strict();
export const playbackTargetSchema = z.object({ provider: z.literal('spotify'), target_id: z.string().trim().max(255).nullable(), player_name: z.string().trim().max(160).nullable().optional() }).strict();
export const kioskRegistrationSchema = z.object({
  device_code: z.string().trim().min(1).max(50),
  credential: z.string().trim().min(1).max(256).optional(),
  provisioning_code: z.string().trim().min(1).max(64).optional(),
}).strict().refine((value) => Boolean(value.credential) !== Boolean(value.provisioning_code), {
  message: 'Provide exactly one kiosk credential or provisioning code',
});
