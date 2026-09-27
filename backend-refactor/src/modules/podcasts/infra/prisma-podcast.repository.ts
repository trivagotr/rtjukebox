import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { PodcastEpisodeRecord, PodcastRepository } from '../ports/podcast.repository.js';

export class PrismaPodcastRepository implements PodcastRepository {
  constructor(private readonly client: PrismaClient) {}

  async listEpisodes(input: { limit: number; offset: number }) {
    const where = { feed: { isActive: true } };
    const [total, episodes] = await Promise.all([
      this.client.podcastEpisode.count({ where }),
      this.client.podcastEpisode.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: input.offset,
        take: input.limit,
        select: {
          id: true,
          title: true,
          description: true,
          audioUrl: true,
          episodeUrl: true,
          imageUrl: true,
          publishedAt: true,
          feed: { select: { title: true } },
        },
      }),
    ]);
    return {
      total,
      episodes: episodes.map((episode): PodcastEpisodeRecord => ({
        id: episode.id,
        title: episode.title,
        description: episode.description,
        audio_url: episode.audioUrl,
        episode_url: episode.episodeUrl,
        image_url: episode.imageUrl,
        published_at: episode.publishedAt,
        feed_title: episode.feed.title,
      })),
    };
  }
}
