import { describe, expect, it, vi } from 'vitest';
import {
    ensureDefaultPodcastFeeds,
    getDefaultPodcastFeeds,
    parseConfiguredPodcastFeeds,
} from './defaultPodcastFeeds';

describe('default podcast feeds', () => {
    it('provides the known Radio TEDU RSS feeds when no override is configured', () => {
        const feeds = getDefaultPodcastFeeds();

        expect(feeds).toHaveLength(3);
        expect(feeds.map((feed) => feed.feedUrl)).toEqual([
            'https://anchor.fm/s/1115478bc/podcast/rss',
            'https://anchor.fm/s/fb73f70c/podcast/rss',
            'https://anchor.fm/s/101050774/podcast/rss',
        ]);
    });

    it('parses JSON and comma-separated feed overrides', () => {
        expect(parseConfiguredPodcastFeeds('[{"title":"Show","feed_url":"https://example.com/rss"}]')).toEqual([
            { title: 'Show', feedUrl: 'https://example.com/rss' },
        ]);

        expect(parseConfiguredPodcastFeeds('https://one.example/rss, https://two.example/rss')).toEqual([
            { title: 'Podcast Feed 1', feedUrl: 'https://one.example/rss' },
            { title: 'Podcast Feed 2', feedUrl: 'https://two.example/rss' },
        ]);
    });

    it('upserts configured feeds and keeps existing rows active', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await ensureDefaultPodcastFeeds(
            { query },
            [
                { title: 'Show A', feedUrl: 'https://one.example/rss' },
                { title: 'Show B', feedUrl: 'https://two.example/rss' },
            ],
        );

        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][0]).toContain('ON CONFLICT (feed_url) DO UPDATE');
        expect(query.mock.calls[0][0]).toContain('is_active = TRUE');
        expect(query.mock.calls[0][1]).toEqual(['Show A', 'https://one.example/rss']);
        expect(query.mock.calls[1][1]).toEqual(['Show B', 'https://two.example/rss']);
    });
});
