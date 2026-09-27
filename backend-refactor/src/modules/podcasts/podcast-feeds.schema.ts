import { z } from 'zod';

export const createFeedSchema = z.object({ title: z.string().trim().min(1).max(160), feed_url: z.string().trim().url().max(2048) }).strict();
export const syncFeedSchema = z.object({ feed_id: z.string().uuid().optional() }).strict();
export const feedIdSchema = z.object({ id: z.string().uuid() }).strict();
export const emptyRequestSchema = z.object({}).strict();
