import {describe, expect, it, jest, beforeEach} from '@jest/globals';

import api from '../src/services/api';
import {
  fetchPodcasts,
  resolvePodcastLaunchUrl,
} from '../src/services/podcastService';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('podcastService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The RadioTEDU RSS feeds are unreachable under tests, so fetchPodcasts
    // falls back to the backend registry that the cases below assert.
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('no network')));
  });

  it('fetchPodcasts calls the shared api client and maps backend records', async () => {
    const getMock = api.get as jest.MockedFunction<
      (path: string, config?: {params?: {page?: number; per_page?: number}}) => Promise<any>
    >;
    getMock.mockResolvedValueOnce({
      data: {
        data: {
          items: [
            {
              id: 'episode-1',
              title: '',
              excerpt: '<p>Featured <strong>summary</strong></p>',
              description: '<p>Ignored backend description</p>',
              audio_url: 'https://cdn.example.com/audio-1.mp3',
              external_url: 'https://example.com/episode-1',
              image_url: 'https://cdn.example.com/image-1.jpg',
              published_at: '2026-04-01T10:00:00Z',
              feed_title: 'Main Feed',
            },
            {
              id: 'episode-2',
              title: 'Episode Two',
              description: `<div>${'a'.repeat(220)}</div>`,
              external_url: 'https://example.com/episode-2',
              published_at: '2026-04-02T10:00:00Z',
            },
          ],
          total: 42,
          total_pages: 5,
        },
      },
    });

    await expect(fetchPodcasts(3)).resolves.toEqual({
      items: [
        {
          id: 'episode-1',
          title: 'Untitled',
          date: '01.04.2026',
          description: 'Featured summary',
          audioUrl: 'https://cdn.example.com/audio-1.mp3',
          externalUrl: 'https://example.com/episode-1',
          imageUrl: 'https://cdn.example.com/image-1.jpg',
          feedTitle: 'Main Feed',
        },
        {
          id: 'episode-2',
          title: 'Episode Two',
          date: '02.04.2026',
          description: `${'a'.repeat(180)}...`,
          externalUrl: 'https://example.com/episode-2',
        },
      ],
      total: 42,
      totalPages: 5,
    });

    expect(getMock).toHaveBeenCalledWith('/podcasts', {
      params: {
        page: 3,
        per_page: 10,
      },
    });
  });

  it('resolvePodcastLaunchUrl prefers direct audio playback over external url', () => {
    expect(
      resolvePodcastLaunchUrl({
        audioUrl: 'https://cdn.example.com/audio-1.mp3',
        externalUrl: 'https://example.com/episode-1',
        url: 'https://example.com/legacy',
      }),
    ).toBe('https://cdn.example.com/audio-1.mp3');
  });

  it('fetchPodcasts maps playable episodes from RSS feeds', async () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
          <title>RadioTEDU Show</title>
          <image><url>https://cdn.example.com/show.jpg</url></image>
          <item>
            <guid>episode-guid</guid>
            <title>Feed Episode</title>
            <pubDate>Wed, 01 Apr 2026 10:00:00 GMT</pubDate>
            <description><![CDATA[<p>Feed <strong>summary</strong></p>]]></description>
            <link>https://example.com/feed-episode</link>
            <itunes:image href="https://cdn.example.com/episode.jpg" />
            <enclosure url="https://cdn.example.com/feed.mp3" type="audio/mpeg" />
          </item>
          <item>
            <guid>text-only</guid>
            <title>Text Only</title>
            <description>No audio</description>
          </item>
        </channel>
      </rss>`;
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(rss),
      })
      .mockResolvedValue({
        ok: false,
        text: () => Promise.resolve(''),
      });

    await expect(fetchPodcasts()).resolves.toEqual({
      items: [
        {
          id: 'episode-guid',
          title: 'Feed Episode',
          date: '01.04.2026',
          description: 'Feed summary',
          audioUrl: 'https://cdn.example.com/feed.mp3',
          externalUrl: 'https://example.com/feed-episode',
          imageUrl: 'https://cdn.example.com/episode.jpg',
          feedTitle: 'RadioTEDU Show',
        },
      ],
      total: 1,
      totalPages: 1,
    });
  });
});
