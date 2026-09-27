import { z } from 'zod';

export const moderationIdSchema = z.object({ id: z.string().uuid() }).strict();
export const blockArtistSchema = z.object({ artist_name: z.string().trim().min(1).max(255), spotify_artist_id: z.string().trim().max(255).nullable().optional(), reason: z.string().max(500).nullable().optional() }).strict();
export const moderationSettingsSchema = z.object({ lyrics_filter_enabled: z.boolean().optional(), block_unverified_obscure_tracks: z.boolean().optional(), min_popularity_without_lyrics: z.number().finite().min(0).max(100).optional() }).strict().refine((body) => Object.keys(body).length > 0);
export const blockedKeywordSchema = z.object({ word: z.string().trim().min(1).max(100), category: z.string().trim().min(1).max(50).optional() }).strict();
export const moderationTestSchema = z.object({ text: z.string().max(100_000).optional(), title: z.string().trim().min(1).max(500).optional(), artist: z.string().trim().min(1).max(500).optional() }).strict().refine((body) => Boolean(body.text?.trim()) || Boolean(body.title && body.artist));
export const emptyModerationQuerySchema = z.object({}).strict();
export const emptyModerationBodySchema = z.object({}).strict();
