export interface PodcastEpisodeRecord {
  id: string;
  title: string;
  description: string | null;
  audio_url: string | null;
  episode_url: string | null;
  image_url: string | null;
  published_at: Date | null;
  feed_title: string | null;
}

export interface PodcastRepository {
  listEpisodes(input: { limit: number; offset: number }): Promise<{ total: number; episodes: PodcastEpisodeRecord[] }>;
}
