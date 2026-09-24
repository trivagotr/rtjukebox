import axios from 'axios';

export interface SyncedLyricLine {
    time: number; // in seconds
    text: string;
}

export interface LyricsResponse {
    synced: boolean;
    lines: SyncedLyricLine[];
    plainLyrics: string | null;
    title: string;
    artist: string;
}

const LYRICS_CACHE_TTL_MS = 60 * 60 * 1000;
const LYRICS_MISS_TTL_MS = 5 * 60 * 1000;
const LYRICS_CACHE_MAX_ENTRIES = 1000;
const lyricsCache = new Map<string, { value: LyricsResponse | null; expiresAt: number }>();

function readLyricsCache(key: string): LyricsResponse | null | undefined {
    const cached = lyricsCache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
        lyricsCache.delete(key);
        return undefined;
    }
    lyricsCache.delete(key);
    lyricsCache.set(key, cached);
    return cached.value;
}

function writeLyricsCache(key: string, value: LyricsResponse | null) {
    lyricsCache.delete(key);
    lyricsCache.set(key, {
        value,
        expiresAt: Date.now() + (value ? LYRICS_CACHE_TTL_MS : LYRICS_MISS_TTL_MS),
    });
    while (lyricsCache.size > LYRICS_CACHE_MAX_ENTRIES) {
        const oldestKey = lyricsCache.keys().next().value;
        if (oldestKey === undefined) break;
        lyricsCache.delete(oldestKey);
    }
}

export function parseLrc(lrcText: string): SyncedLyricLine[] {
    const lines: SyncedLyricLine[] = [];
    const regex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;

    const rawLines = lrcText.split('\n');
    for (const rawLine of rawLines) {
        const match = regex.exec(rawLine.trim());
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseFloat(match[2]);
            const time = Math.round((minutes * 60 + seconds) * 100) / 100;
            const text = match[3].trim();
            if (text.length > 0) {
                lines.push({ time, text });
            }
        }
    }

    return lines.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(params: {
    title: string;
    artist: string;
    durationSeconds?: number;
    album?: string;
}): Promise<LyricsResponse | null> {
    const title = params.title.trim();
    const artist = params.artist.trim();
    const cacheKey = `${artist.normalize('NFKC').trim()} - ${title.normalize('NFKC').trim()}`.toLocaleLowerCase('en-US');

    const cached = readLyricsCache(cacheKey);
    if (cached !== undefined) return cached;

    try {
        // Clean title from common Spotify suffixes like "(Remastered)", "- Live", etc.
        const cleanTitle = title
            .replace(/\s*-\s*Remastered.*/i, '')
            .replace(/\s*\(feat\..*?\)/i, '')
            .replace(/\s*\(with.*?\)/i, '')
            .trim();

        // 1. Try exact match on lrclib.net
        let res = await axios.get('https://lrclib.net/api/get', {
            params: {
                track_name: cleanTitle,
                artist_name: artist,
                duration: params.durationSeconds ? Math.round(params.durationSeconds) : undefined,
            },
            timeout: 4000,
        }).catch(() => null);

        // 2. If not found, try search endpoint
        if (!res?.data?.syncedLyrics && !res?.data?.plainLyrics) {
            const searchRes = await axios.get('https://lrclib.net/api/search', {
                params: {
                    q: `${artist} ${cleanTitle}`,
                },
                timeout: 4000,
            }).catch(() => null);

            if (Array.isArray(searchRes?.data) && searchRes.data.length > 0) {
                const bestMatch = searchRes.data.find((item: any) => item.syncedLyrics) || searchRes.data[0];
                res = { data: bestMatch } as any;
            }
        }

        if (!res?.data) {
            writeLyricsCache(cacheKey, null);
            return null;
        }

        const syncedLyrics = res.data.syncedLyrics;
        const plainLyrics = res.data.plainLyrics || null;

        let lines: SyncedLyricLine[] = [];
        let synced = false;

        if (syncedLyrics && typeof syncedLyrics === 'string') {
            lines = parseLrc(syncedLyrics);
            synced = lines.length > 0;
        }

        const result: LyricsResponse = {
            synced,
            lines,
            plainLyrics,
            title: res.data.trackName || title,
            artist: res.data.artistName || artist,
        };

        writeLyricsCache(cacheKey, result);
        return result;
    } catch (error) {
        console.warn(`[Lyrics] Failed to fetch lyrics for ${artist} - ${title}:`, error);
        writeLyricsCache(cacheKey, null);
        return null;
    }
}
