import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbQuery, mockFetchPodcastFeedXml } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
  mockFetchPodcastFeedXml: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: {},
  },
}));

import { fetchPodcastFeedXml, isPublicFeedAddress, listPodcastEpisodes, syncPodcastFeed, validatePodcastFeedTarget } from './podcastFeeds';

describe('podcastFeeds service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  it('allows only public unicast feed addresses', () => {
    expect(isPublicFeedAddress('8.8.8.8')).toBe(true);
    expect(isPublicFeedAddress('127.0.0.1')).toBe(false);
    expect(isPublicFeedAddress('10.2.3.4')).toBe(false);
    expect(isPublicFeedAddress('169.254.169.254')).toBe(false);
    expect(isPublicFeedAddress('::1')).toBe(false);
    expect(isPublicFeedAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicFeedAddress('fd00::1')).toBe(false);
  });

  it('rejects feed schemes, embedded credentials, and nonstandard ports', () => {
    expect(() => validatePodcastFeedTarget('file:///etc/passwd')).toThrow('HTTP or HTTPS');
    expect(() => validatePodcastFeedTarget('https://user:pass@example.com/feed.xml')).toThrow('credentials');
    expect(() => validatePodcastFeedTarget('http://example.com:8080/feed.xml')).toThrow('standard');
    expect(validatePodcastFeedTarget('https://example.com/feed.xml').hostname).toBe('example.com');
  });

  it('revalidates every redirect and pins each request to its resolved public address', async () => {
    const resolveAddress = vi.fn(async () => ({ address: '93.184.216.34', family: 4 }));
    const requestOnce = vi.fn()
      .mockResolvedValueOnce({ body: Buffer.alloc(0), location: '/redirected.xml' })
      .mockResolvedValueOnce({ body: Buffer.from('<rss/>'), location: null });

    await expect(fetchPodcastFeedXml('https://feeds.example.com/start.xml', { resolveAddress, requestOnce }))
      .resolves.toBe('<rss/>');

    expect(resolveAddress).toHaveBeenCalledTimes(2);
    expect(requestOnce).toHaveBeenNthCalledWith(1, new URL('https://feeds.example.com/start.xml'), { address: '93.184.216.34', family: 4 });
    expect(requestOnce).toHaveBeenNthCalledWith(2, new URL('https://feeds.example.com/redirected.xml'), { address: '93.184.216.34', family: 4 });
  });

  it('rejects a private address returned during feed DNS resolution before making a request', async () => {
    const requestOnce = vi.fn();
    await expect(fetchPodcastFeedXml('https://feeds.example.com/feed.xml', {
      resolveAddress: async () => ({ address: '127.0.0.1', family: 4 }),
      requestOnce,
    })).rejects.toThrow('non-public IP');
    expect(requestOnce).not.toHaveBeenCalled();
  });

  it('migrates an existing episode when a later sync adds a guid for a row matched by audio_url', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <guid>ep-1</guid>
            <title>Episode 1</title>
            <link>https://example.com/episode-1</link>
            <pubDate>Mon, 14 Apr 2026 10:00:00 GMT</pubDate>
            <enclosure url="https://cdn.example.com/episode-1.mp3" type="audio/mpeg" length="12345" />
          </item>
        </channel>
      </rss>`;

    mockFetchPodcastFeedXml.mockResolvedValueOnce(xml);
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'episode-row-guid',
          guid: 'ep-1',
          audio_url: null,
          episode_url: 'https://example.com/episode-1',
        },
        {
          id: 'episode-row-audio',
          guid: null,
          audio_url: 'https://cdn.example.com/episode-1.mp3',
          episode_url: 'https://example.com/episode-1',
        },
      ],
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await syncPodcastFeed(
      { query: mockDbQuery },
      { id: 'feed-1', feedUrl: 'https://feeds.example.com/show.rss' },
      mockFetchPodcastFeedXml,
    );

    expect(result).toEqual({ processed: 1, upserted: 1, skipped: 0 });
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      1,
      'BEGIN',
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT id, guid, audio_url, episode_url'),
      ['feed-1', 'ep-1', 'https://cdn.example.com/episode-1.mp3', 'https://example.com/episode-1'],
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('DELETE FROM podcast_episodes'),
      [['episode-row-audio']],
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE podcast_episodes'),
      expect.arrayContaining([
        'episode-row-guid',
        'feed-1',
        'ep-1',
        'https://example.com/episode-1',
        'https://cdn.example.com/episode-1.mp3',
        'Episode 1',
      ]),
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('UPDATE podcast_feeds'),
      ['feed-1'],
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      6,
      'COMMIT',
    );
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('INSERT INTO podcast_episodes')
      && Array.isArray(params)
      && params[0] === 'feed-1'
      && params[1] === 'ep-1'
    )).toBe(false);
  });

  it('serializes a feed sync and status update with a feed advisory lock when a pool client is available', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <guid>ep-1</guid>
            <title>Episode 1</title>
            <link>https://example.com/episode-1</link>
            <pubDate>Mon, 14 Apr 2026 10:00:00 GMT</pubDate>
            <enclosure url="https://cdn.example.com/episode-1.mp3" type="audio/mpeg" length="12345" />
          </item>
        </channel>
      </rss>`;

    const txQuery = vi.fn();
    txQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const connect = vi.fn(async () => ({ query: txQuery, release }));

    mockFetchPodcastFeedXml.mockResolvedValueOnce(xml);

    const result = await syncPodcastFeed(
      {
        query: mockDbQuery,
        pool: { connect } as any,
      },
      { id: 'feed-1', feedUrl: 'https://feeds.example.com/show.rss' },
      mockFetchPodcastFeedXml,
    );

    expect(result).toEqual({ processed: 1, upserted: 1, skipped: 0 });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(String(txQuery.mock.calls[0]?.[0])).toContain('pg_advisory_lock');
    expect(txQuery.mock.calls[1]?.[0]).toBe('BEGIN');
    expect(String(txQuery.mock.calls[2]?.[0])).toContain('SELECT id, guid, audio_url, episode_url');
    expect(String(txQuery.mock.calls[3]?.[0])).toContain('INSERT INTO podcast_episodes');
    expect(String(txQuery.mock.calls[4]?.[0])).toContain('UPDATE podcast_feeds');
    expect(txQuery.mock.calls[5]?.[0]).toBe('COMMIT');
    expect(String(txQuery.mock.calls[6]?.[0])).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockDbQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE podcast_feeds'),
      ['feed-1'],
    );
  });

  it('normalizes playable RSS items and skips items without audio', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <guid>ep-1</guid>
            <title>Episode 1</title>
            <link>https://example.com/episode-1</link>
            <pubDate>Mon, 14 Apr 2026 10:00:00 GMT</pubDate>
            <enclosure url="https://cdn.example.com/episode-1.mp3" type="audio/mpeg" length="12345" />
            <itunes:image href="https://cdn.example.com/episode-1.jpg" />
          </item>
          <item>
            <guid>ep-2</guid>
            <title>Episode 2</title>
            <link>https://example.com/episode-2</link>
            <pubDate>Mon, 14 Apr 2026 11:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;

    mockFetchPodcastFeedXml.mockResolvedValueOnce(xml);
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await syncPodcastFeed(
      { query: mockDbQuery },
      { id: 'feed-1', feedUrl: 'https://feeds.example.com/show.rss' },
      mockFetchPodcastFeedXml,
    );

    expect(result).toEqual({ processed: 2, upserted: 1, skipped: 1 });
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      1,
      'BEGIN',
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT id, guid, audio_url, episode_url'),
      ['feed-1', 'ep-1', 'https://cdn.example.com/episode-1.mp3', 'https://example.com/episode-1'],
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO podcast_episodes'),
      expect.arrayContaining([
        'feed-1',
        'ep-1',
        'https://example.com/episode-1',
        'https://cdn.example.com/episode-1.mp3',
        'Episode 1',
        'https://cdn.example.com/episode-1.jpg',
      ]),
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE podcast_feeds'),
      ['feed-1'],
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      5,
      'COMMIT',
    );
  });

  it('stores last_sync_error when sync fails', async () => {
    const failure = new Error('request timed out');
    mockFetchPodcastFeedXml.mockRejectedValueOnce(failure);

    await expect(
      syncPodcastFeed(
        { query: mockDbQuery },
        { id: 'feed-1', feedUrl: 'https://feeds.example.com/show.rss' },
        mockFetchPodcastFeedXml,
      ),
    ).rejects.toThrow('request timed out');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE podcast_feeds'),
      ['feed-1', 'request timed out'],
    );
  });

  it('rolls back the transaction and records last_sync_error when a write fails', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <guid>ep-1</guid>
            <title>Episode 1</title>
            <link>https://example.com/episode-1</link>
            <pubDate>Mon, 14 Apr 2026 10:00:00 GMT</pubDate>
            <enclosure url="https://cdn.example.com/episode-1.mp3" type="audio/mpeg" length="12345" />
          </item>
        </channel>
      </rss>`;

    const txError = new Error('unique violation');
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(txError)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const connect = vi.fn(async () => ({ query: txQuery, release }));

    mockFetchPodcastFeedXml.mockResolvedValueOnce(xml);

    await expect(
      syncPodcastFeed(
        {
          query: mockDbQuery,
          pool: { connect } as any,
        },
        { id: 'feed-1', feedUrl: 'https://feeds.example.com/show.rss' },
        mockFetchPodcastFeedXml,
      ),
    ).rejects.toThrow('unique violation');

    expect(String(txQuery.mock.calls[0]?.[0])).toContain('pg_advisory_lock');
    expect(txQuery.mock.calls[1]?.[0]).toBe('BEGIN');
    expect(String(txQuery.mock.calls[2]?.[0])).toContain('SELECT id, guid, audio_url, episode_url');
    expect(String(txQuery.mock.calls[3]?.[0])).toContain('INSERT INTO podcast_episodes');
    expect(txQuery.mock.calls[4]?.[0]).toBe('ROLLBACK');
    expect(txQuery.mock.calls[5]?.[0]).toBe('BEGIN');
    expect(String(txQuery.mock.calls[6]?.[0])).toContain('UPDATE podcast_feeds');
    expect(txQuery.mock.calls[7]?.[0]).toBe('COMMIT');
    expect(String(txQuery.mock.calls[8]?.[0])).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockDbQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE podcast_feeds'),
      ['feed-1', 'unique violation'],
    );
  });

  it('returns podcast episodes newest-first from the database query', async () => {
    const rows = [
      {
        id: 'episode-2',
        title: 'Episode 2',
        published_at: new Date('2026-04-14T11:00:00.000Z'),
      },
      {
        id: 'episode-1',
        title: 'Episode 1',
        published_at: new Date('2026-04-14T10:00:00.000Z'),
      },
    ];

    mockDbQuery.mockResolvedValueOnce({ rows });

    const result = await listPodcastEpisodes(
      { query: mockDbQuery },
      { page: 1, perPage: 10 },
    );

    expect(result).toEqual(rows);
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM podcast_episodes pe'),
      [10, 0],
    );
    expect(mockDbQuery.mock.calls[0]?.[0]).toContain('ORDER BY pe.published_at DESC NULLS LAST, pe.created_at DESC');
  });
});
