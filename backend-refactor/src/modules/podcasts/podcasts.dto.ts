import type { PodcastEpisodeRecord } from './ports/podcast.repository.js';

function stripHtml(value: string | null) {
  return String(value ?? '').replace(/<[^>]*>?/gm, '').trim();
}

export function toPodcastEpisodeDto(row: PodcastEpisodeRecord) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    excerpt: stripHtml(row.description),
    audio_url: row.audio_url,
    episode_url: row.episode_url,
    external_url: row.episode_url ?? row.audio_url ?? null,
    featured_image: row.image_url,
    image_url: row.image_url,
    published_at: row.published_at,
    feed_title: row.feed_title,
  };
}
