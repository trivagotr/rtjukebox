import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaPodcastRepository } from './infra/prisma-podcast.repository.js';
import { createPodcastsRouter } from './podcasts.router.js';
import { PodcastsService } from './podcasts.service.js';

export function createPodcastsModule(client: PrismaClient) {
  const repository = new PrismaPodcastRepository(client);
  const service = new PodcastsService(repository);
  return { router: createPodcastsRouter(service), service };
}
