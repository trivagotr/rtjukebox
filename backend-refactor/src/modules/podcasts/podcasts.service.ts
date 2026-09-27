import type { PodcastRepository } from './ports/podcast.repository.js';
import { toPodcastEpisodeDto } from './podcasts.dto.js';

export class PodcastsService {
  constructor(private readonly repository: PodcastRepository) {}

  async listEpisodes(page: number, perPage: number) {
    const offset = (page - 1) * perPage;
    const result = await this.repository.listEpisodes({ limit: perPage, offset });
    return {
      items: result.episodes.map(toPodcastEpisodeDto),
      total: result.total,
      total_pages: result.total === 0 ? 0 : Math.ceil(result.total / perPage),
    };
  }
}
