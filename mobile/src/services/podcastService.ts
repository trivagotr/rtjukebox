import api from './api';

export interface Podcast {
  id: string;
  title: string;
  date: string;
  description: string;
  audioUrl?: string;
  externalUrl?: string;
  imageUrl?: string;
  feedTitle?: string;
}

interface PodcastApiRecord {
  id: string | number;
  title?: string;
  description?: string;
  excerpt?: string;
  audio_url?: string;
  external_url?: string;
  image_url?: string;
  published_at?: string;
  feed_title?: string;
}

interface PodcastApiResponse {
  items?: PodcastApiRecord[];
  total?: number;
  total_pages?: number;
}

const PODCAST_DATE_LOCALE = 'tr-TR';
const PODCAST_DESCRIPTION_LIMIT = 180;

export async function fetchPodcasts(page: number = 1): Promise<{
  items: Podcast[];
  total: number;
  totalPages: number;
}> {
  const response = await api.get('/podcasts', {
    params: {
      page,
      per_page: 10,
    },
  });

  const payload: PodcastApiResponse = response.data?.data ?? {};
  const items = Array.isArray(payload.items) ? payload.items : [];

  return {
    items: items.map(mapPodcastRecord),
    total: payload.total ?? 0,
    totalPages: payload.total_pages ?? 0,
  };
}

export function resolvePodcastLaunchUrl(
  podcast: Pick<Podcast, 'audioUrl' | 'externalUrl'> & { url?: string },
): string | null {
  return podcast.audioUrl || podcast.externalUrl || podcast.url || null;
}

function mapPodcastRecord(record: PodcastApiRecord): Podcast {
  const podcast: Podcast = {
    id: String(record.id),
    title: normalizePodcastTitle(record.title),
    date: formatPodcastDate(record.published_at),
    description: shapePodcastDescription(record.excerpt ?? record.description),
  };

  if (record.audio_url) {
    podcast.audioUrl = record.audio_url;
  }

  if (record.external_url) {
    podcast.externalUrl = record.external_url;
  }

  if (record.image_url) {
    podcast.imageUrl = record.image_url;
  }

  if (record.feed_title) {
    podcast.feedTitle = record.feed_title;
  }

  return podcast;
}

function normalizePodcastTitle(title?: string): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle ? trimmedTitle : 'Untitled';
}

function formatPodcastDate(publishedAt?: string): string {
  if (!publishedAt) {
    return '';
  }

  const parsedDate = new Date(publishedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toLocaleDateString(PODCAST_DATE_LOCALE);
}

function shapePodcastDescription(source?: string): string {
  if (!source) {
    return '';
  }

  const strippedText = decodeHtmlEntities(
    source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  );

  if (strippedText.length <= PODCAST_DESCRIPTION_LIMIT) {
    return strippedText;
  }

  return `${strippedText.slice(0, PODCAST_DESCRIPTION_LIMIT).trimEnd()}...`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}
