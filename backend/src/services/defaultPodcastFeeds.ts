export type PodcastFeedDbClient = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export type DefaultPodcastFeed = {
    title: string;
    feedUrl: string;
};

const RADIO_TEDU_DEFAULT_PODCAST_FEEDS: DefaultPodcastFeed[] = [
    {
        title: 'Keske Biri Bana Soyleseydi',
        feedUrl: 'https://anchor.fm/s/1115478bc/podcast/rss',
    },
    {
        title: 'Hemen Bi Sey Soyle',
        feedUrl: 'https://anchor.fm/s/fb73f70c/podcast/rss',
    },
    {
        title: 'Zit Kutuplar',
        feedUrl: 'https://anchor.fm/s/101050774/podcast/rss',
    },
];

function normalizeFeedUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const feedUrl = value.trim();
    return /^https?:\/\//i.test(feedUrl) ? feedUrl : null;
}

function normalizeFeedTitle(value: unknown, fallback: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function uniqueFeeds(feeds: DefaultPodcastFeed[]) {
    const seen = new Set<string>();
    return feeds.filter((feed) => {
        if (seen.has(feed.feedUrl)) {
            return false;
        }

        seen.add(feed.feedUrl);
        return true;
    });
}

export function parseConfiguredPodcastFeeds(rawConfig: string | null | undefined): DefaultPodcastFeed[] {
    const raw = rawConfig?.trim();
    if (!raw) {
        return [];
    }

    if (raw.startsWith('[')) {
        const parsed = JSON.parse(raw) as Array<string | {
            title?: unknown;
            name?: unknown;
            feed_url?: unknown;
            feedUrl?: unknown;
        }>;

        return uniqueFeeds(parsed
            .map((entry, index) => {
                if (typeof entry === 'string') {
                    const feedUrl = normalizeFeedUrl(entry);
                    return feedUrl ? { title: `Podcast Feed ${index + 1}`, feedUrl } : null;
                }

                const feedUrl = normalizeFeedUrl(entry.feed_url ?? entry.feedUrl);
                return feedUrl
                    ? { title: normalizeFeedTitle(entry.title ?? entry.name, `Podcast Feed ${index + 1}`), feedUrl }
                    : null;
            })
            .filter((feed): feed is DefaultPodcastFeed => feed !== null));
    }

    return uniqueFeeds(raw
        .split(',')
        .map((entry, index) => {
            const feedUrl = normalizeFeedUrl(entry);
            return feedUrl ? { title: `Podcast Feed ${index + 1}`, feedUrl } : null;
        })
        .filter((feed): feed is DefaultPodcastFeed => feed !== null));
}

export function getDefaultPodcastFeeds(rawConfig: string | null | undefined = process.env.DEFAULT_PODCAST_FEEDS) {
    const configuredFeeds = parseConfiguredPodcastFeeds(rawConfig);
    return configuredFeeds.length > 0 ? configuredFeeds : RADIO_TEDU_DEFAULT_PODCAST_FEEDS;
}

export async function ensureDefaultPodcastFeeds(
    dbClient: PodcastFeedDbClient,
    feeds: DefaultPodcastFeed[] = getDefaultPodcastFeeds(),
) {
    for (const feed of uniqueFeeds(feeds)) {
        await dbClient.query(
            `INSERT INTO podcast_feeds (title, feed_url, is_active)
             VALUES ($1, $2, TRUE)
             ON CONFLICT (feed_url) DO UPDATE
             SET title = EXCLUDED.title,
                 is_active = TRUE,
                 updated_at = NOW()`,
            [feed.title, feed.feedUrl],
        );
    }
}
