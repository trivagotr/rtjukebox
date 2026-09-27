export interface FeedFetcher {
  fetchEpisodes(url: string): Promise<ParsedFeedEpisode[]>;
}

export interface ParsedFeedEpisode { guid: string | null; episodeUrl: string | null; audioUrl: string | null; title: string; description: string | null; imageUrl: string | null; publishedAt: Date | null; author: string | null; durationSeconds: number | null }
