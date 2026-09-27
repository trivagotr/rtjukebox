import { z } from 'zod';

export const catalogAdminIdSchema = z.object({ id: z.string().uuid() }).strict();
export const catalogAdminEmptySchema = z.object({}).strict();
export const playlistPreviewQuerySchema = z.object({ url: z.string().trim().max(2048).regex(/^(?:spotify:playlist:[A-Za-z0-9]{22}|https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]{22}(?:\?.*)?)$/) }).strict();
export const songClassificationSchema = z.object({
  visibility: z.enum(['public', 'hidden']).optional(),
  asset_role: z.enum(['music', 'jingle', 'ad']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
