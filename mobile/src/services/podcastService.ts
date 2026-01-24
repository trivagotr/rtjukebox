import axios from 'axios';
import * as rssParser from 'react-native-rss-parser';
import {getStoredRssFeeds} from '../utils/storage';

export interface Podcast {
  id: string;
  title: string;
  date: string;
  description: string;
  url: string;
  spotifyUrl: string | null;
  source: 'web' | 'rss';
  audioUrl?: string; // Direct audio for RSS
  imageUrl?: string;
}

// Fetch podcasts from all sources
export async function fetchPodcasts(page: number = 1): Promise<Podcast[]> {
  try {
    // 1. Fetch from RadioTEDU Website (Scraping)
    const webPodcasts = await fetchWebPodcasts(page);

    // 2. Fetch from Stored RSS Feeds (Only on first page to avoid duplication)
    let rssPodcasts: Podcast[] = [];
    if (page === 1) {
      const storedFeeds = await getStoredRssFeeds();
      // You can add default Spotify RSS feeds here if found
      // storedFeeds.push('https://anchor.fm/s/radiotedu7/podcast/rss');

      const rssPromises = storedFeeds.map(fetchRssPodcast);
      const rssResults = await Promise.all(rssPromises);
      rssPodcasts = rssResults.flat();
    }

    // Merge and sort by date (newest first)
    const allPodcasts = [...rssPodcasts, ...webPodcasts];

    // Simple sort by assuming date string is standard or simple text (improvement needed for robust date parsing)
    // For now, we put RSS feeds at the top if they are recent
    return allPodcasts;
  } catch (error) {
    console.error('Failed to fetch podcasts:', error);
    return [];
  }
}

async function fetchRssPodcast(feedUrl: string): Promise<Podcast[]> {
  try {
    const response = await fetch(feedUrl);
    const responseText = await response.text();
    const feed = await rssParser.parse(responseText);

    return feed.items.map((item: rssParser.RSSItem) => ({
      id: item.id || item.links[0]?.url || Math.random().toString(),
      title: item.title || 'Untitled',
      date: item.published
        ? new Date(item.published).toLocaleDateString('tr-TR')
        : '',
      description: item.description || item.content || '',
      url: item.links[0]?.url || '',
      spotifyUrl: item.links[0]?.url || null, // RSS link is usually the playable one or deep link
      source: 'rss',
      audioUrl: item.enclosures[0]?.url,
      imageUrl: item.itunes?.image || feed.image?.url,
    }));
  } catch (e) {
    console.error(`Failed to parse RSS feed: ${feedUrl}`, e);
    return [];
  }
}

async function fetchWebPodcasts(page: number): Promise<Podcast[]> {
  try {
    const url =
      page === 1
        ? 'https://radiotedu.com/category/podcastler/'
        : `https://radiotedu.com/category/podcastler/page/${page}/`;

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'RadioTEDU-Mobile-App/1.0',
      },
    });

    const html = response.data as string;
    const podcasts: Podcast[] = [];

    const articlePattern =
      /<article[^>]*class="[^"]*post[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
    const articles = html.match(articlePattern) || [];

    for (const article of articles) {
      const titleMatch = article.match(
        /<h[234][^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i,
      );
      if (!titleMatch) {
        continue;
      }

      const podcastUrl = titleMatch[1];
      const title = titleMatch[2].trim();

      const dateMatch = article.match(
        /<time[^>]*datetime="([^"]*)"[^>]*>([^<]*)<\/time>/i,
      );
      const date = dateMatch ? dateMatch[2].trim() : '';

      const excerptMatch = article.match(
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      );
      let description = '';
      if (excerptMatch) {
        description = excerptMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/Bu Bölümü Dinlemek İçin Tıklayın/gi, '')
          .trim()
          .substring(0, 200);
      }

      const id =
        podcastUrl.split('/').filter(Boolean).pop() ||
        `podcast-${podcasts.length}`;

      podcasts.push({
        id,
        title,
        date,
        description,
        url: podcastUrl,
        spotifyUrl: null,
        source: 'web',
      });
    }

    return podcasts;
  } catch (error) {
    console.error('Failed to fetch web podcasts:', error);
    return [];
  }
}

export async function fetchSpotifyUrl(
  podcastUrl: string,
): Promise<string | null> {
  try {
    const response = await axios.get(podcastUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'RadioTEDU-Mobile-App/1.0',
      },
    });

    const html = response.data as string;

    const spotifyMatch = html.match(
      /href="(https:\/\/podcasters\.spotify\.com\/[^"]*)"/i,
    );
    if (spotifyMatch) {
      return spotifyMatch[1];
    }

    const anchorMatch = html.match(/href="(https:\/\/anchor\.fm\/[^"]*)"/i);
    if (anchorMatch) {
      return anchorMatch[1];
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch Spotify URL:', error);
    return null;
  }
}
