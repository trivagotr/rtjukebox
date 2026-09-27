import { describe, expect, it } from 'vitest';
import { isPublicFeedAddress, parseFeedEpisodes, validateFeedUrl } from './ssrf-safe-feed-fetcher.js';

describe('podcast feed target validation', () => {
  it('permits public unicast addresses and rejects private, loopback, and mapped addresses', () => {
    expect(isPublicFeedAddress('8.8.8.8')).toBe(true);
    expect(isPublicFeedAddress('2606:4700:4700::1111')).toBe(true);
    for (const address of ['127.0.0.1', '10.0.0.8', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fe80::1']) {
      expect(isPublicFeedAddress(address)).toBe(false);
    }
  });

  it('allows standard HTTP(S) targets without credentials and rejects unsafe URL forms', () => {
    expect(validateFeedUrl('https://feeds.example.org/rss').hostname).toBe('feeds.example.org');
    expect(() => validateFeedUrl('ftp://feeds.example.org/rss')).toThrow();
    expect(() => validateFeedUrl('http://user:pass@feeds.example.org/rss')).toThrow();
    expect(() => validateFeedUrl('http://feeds.example.org:8080/rss')).toThrow();
  });

  it('parses RSS and Atom episodes into bounded public fields', () => {
    const rss = '<rss><channel><item><guid>episode-1</guid><title>Show 1</title><enclosure url="https://cdn.example.org/1.mp3"/><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate><itunes:duration>01:02:03</itunes:duration></item></channel></rss>';
    expect(parseFeedEpisodes(rss)).toMatchObject([{ guid: 'episode-1', title: 'Show 1', audioUrl: 'https://cdn.example.org/1.mp3', durationSeconds: 3723 }]);
    const atom = '<feed><entry><id>atom-1</id><title>Atom show</title><link rel="alternate" href="https://pod.example.org/episode/1"/><link rel="enclosure" href="https://cdn.example.org/atom.mp3"/><published>2024-01-01T00:00:00Z</published></entry></feed>';
    expect(parseFeedEpisodes(atom)).toMatchObject([{ guid: 'atom-1', title: 'Atom show', episodeUrl: 'https://pod.example.org/episode/1', audioUrl: 'https://cdn.example.org/atom.mp3' }]);
  });

  it('rejects external XML entities instead of expanding them', () => {
    const xml = '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&secret;</title><enclosure url="https://cdn.example.org/1.mp3"/></item></channel></rss>';
    expect(() => parseFeedEpisodes(xml)).toThrow(/External entities are not supported/);
  });
});
