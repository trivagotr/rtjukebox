import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaPodcastFeedsRepository } from './infra/prisma-podcast-feeds.repository.js';
import { SsrfSafeFeedFetcher } from './infra/ssrf-safe-feed-fetcher.js';
import { PodcastFeedsService } from './podcast-feeds.service.js';
import { createPodcastFeedsRouter } from './podcast-feeds.router.js';
import type { JobQueue } from '../../core/ports/job-queue.port.js';

export function createPodcastFeedsModule(client: PrismaClient) {
  const repository = new PrismaPodcastFeedsRepository(client);
  const service = new PodcastFeedsService(repository, new SsrfSafeFeedFetcher());
  return { service, createAdminRouter: (jobs: JobQueue) => createPodcastFeedsRouter(service, jobs) };
}
