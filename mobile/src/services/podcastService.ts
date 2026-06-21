import * as rssParser from 'react-native-rss-parser';

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
const PODCAST_PAGE_SIZE = 15;

// The real RadioTEDU podcast shows, hosted on Spotify for Podcasters (anchor.fm)
// and surfaced on radiotedu.com. Their RSS feeds carry direct MP3 enclosures, so
// episodes play in-app (the anchor URL redirects to the CloudFront audio, which
// react-native-track-player / ExoPlayer follows).
const RADIOTEDU_PODCAST_FEEDS = [
  'https://anchor.fm/s/1115478bc/podcast/rss', // Keşke Biri Bana Söyleseydi!
  'https://anchor.fm/s/fb73f70c/podcast/rss', // hemen bi'şey söyle
  'https://anchor.fm/s/101050774/podcast/rss', // Zıt Kutuplar
];

// Cached, date-sorted merge of all RadioTEDU episodes (refreshed on page 1).
let cachedFeedEpisodes: Podcast[] | null = null;

export async function fetchPodcasts(page: number = 1): Promise<{
  items: Podcast[];
  total: number;
  totalPages: number;
}> {
  // Primary source: the real RadioTEDU shows from radiotedu.com (anchor.fm RSS).
  if (page <= 1 || !cachedFeedEpisodes) {
    const episodes = await fetchRadioteduFeedEpisodes();
    if (episodes.length > 0) {
      cachedFeedEpisodes = episodes;
    }
  }

  if (cachedFeedEpisodes && cachedFeedEpisodes.length > 0) {
    return paginatePodcasts(cachedFeedEpisodes, page);
  }

  // Fallback: backend-managed podcast registry.
  return fetchPodcastsFromBackend(page);
}

export function resolvePodcastLaunchUrl(
  podcast: Pick<Podcast, 'audioUrl' | 'externalUrl'> & { url?: string },
): string | null {
  return podcast.audioUrl || podcast.externalUrl || podcast.url || null;
}

function paginatePodcasts(
  all: Podcast[],
  page: number,
): {items: Podcast[]; total: number; totalPages: number} {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * PODCAST_PAGE_SIZE;
  return {
    items: all.slice(start, start + PODCAST_PAGE_SIZE),
    total: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / PODCAST_PAGE_SIZE)),
  };
}

async function fetchRadioteduFeedEpisodes(): Promise<Podcast[]> {
  try {
    const perFeed = await Promise.all(RADIOTEDU_PODCAST_FEEDS.map(fetchFeedEpisodes));
    return perFeed
      .flat()
      .sort((a, b) => b.ts - a.ts)
      .map(entry => entry.podcast);
  } catch {
    return [];
  }
}

async function fetchFeedEpisodes(
  url: string,
): Promise<Array<{podcast: Podcast; ts: number}>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    const xml = await response.text();
    const feed = await rssParser.parse(xml);
    const showImage = feed.image?.url || feed.itunes?.image || '';
    const showTitle = feed.title || '';

    return (feed.items || [])
      .map(item => {
        const podcast = mapFeedItem(item, showTitle, showImage);
        if (!podcast) {
          return null;
        }
        return {podcast, ts: Date.parse(item.published || '') || 0};
      })
      .filter((entry): entry is {podcast: Podcast; ts: number} => entry !== null);
  } catch {
    return [];
  }
}

function mapFeedItem(
  item: rssParser.RSSItem,
  showTitle: string,
  showImage: string,
): Podcast | null {
  const enclosures = item.enclosures || [];
  const audio =
    enclosures.find(e => (e.mimeType || '').startsWith('audio'))?.url ||
    enclosures[0]?.url;

  if (!audio) {
    return null; // episode without playable audio
  }

  const podcast: Podcast = {
    id: item.id || audio,
    title: normalizePodcastTitle(item.title),
    date: formatPodcastDate(item.published),
    description: shapePodcastDescription(item.itunes?.summary || item.description),
    audioUrl: audio,
  };

  if (showTitle) {
    podcast.feedTitle = showTitle;
  }

  const image = item.itunes?.image || showImage;
  if (image) {
    podcast.imageUrl = image;
  }

  const link = item.links?.find(l => !!l.url)?.url;
  if (link) {
    podcast.externalUrl = link;
  }

  return podcast;
}

async function fetchPodcastsFromBackend(page: number): Promise<{
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
