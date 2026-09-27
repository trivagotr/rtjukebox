import { z } from 'zod';

export const podcastListQuerySchema = z.object({
  page: z.string().regex(/^\d{1,6}$/).optional(),
  per_page: z.string().regex(/^\d{1,3}$/).optional(),
}).strict();

export function normalizePodcastListQuery(input: { page?: string; per_page?: string }) {
  const page = Math.min(100_000, Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1));
  const perPage = Math.min(50, Math.max(1, Number.parseInt(input.per_page ?? '10', 10) || 10));
  return { page, perPage };
}
