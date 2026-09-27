import { z } from 'zod';

export const catalogQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
}).strict();
