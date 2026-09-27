import { z } from 'zod';

export const queueParamsSchema = z.object({ deviceId: z.string().uuid() }).strict();
export const emptyQuerySchema = z.object({}).strict();
export const connectBodySchema = z.object({
  device_code: z.string().trim().min(1).max(50),
  password: z.string().max(100).optional(),
}).strict();
export const disconnectBodySchema = z.object({ device_id: z.string().uuid() }).strict();
export const queueAddBodySchema = z.object({ device_id: z.string().uuid(), song_id: z.string().uuid().optional(), spotify_uri: z.string().trim().min(1).max(255).optional() }).strict().refine((body) => Boolean(body.song_id) !== Boolean(body.spotify_uri));
export const queueVoteBodySchema = z.object({ queue_item_id: z.string().uuid().nullable().optional(), song_id: z.string().uuid().optional(), vote: z.union([z.literal(-1), z.literal(1)]), device_id: z.string().uuid(), is_super: z.boolean().optional() }).strict().refine((body) => Boolean(body.queue_item_id) || Boolean(body.song_id));
export const kioskHeartbeatBodySchema = z.object({ device_id: z.string().uuid(), device_pwd: z.string().trim().min(1).max(256).optional() }).strict();
export const kioskNowPlayingBodySchema = z.object({ device_id: z.string().uuid(), song_id: z.string().uuid().nullable(), device_pwd: z.string().trim().min(1).max(256).optional() }).strict();
export const kioskAutoplayBodySchema = z.object({ device_id: z.string().uuid(), device_pwd: z.string().trim().min(1).max(256).optional() }).strict();
export const adminSkipBodySchema = z.object({ device_id: z.string().uuid() }).strict();
