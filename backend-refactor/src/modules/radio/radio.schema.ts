import { z } from 'zod';

export const emptyQuerySchema = z.object({}).strict();
export const historyParamsSchema = z.object({
  channelId: z.string().trim().min(1).max(120),
}).strict();
