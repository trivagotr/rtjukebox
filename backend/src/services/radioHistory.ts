import axios from 'axios';
import { db } from '../db';

export interface NowPlayingInput {
    title: string;
    artist?: string | null;
    coverUrl?: string | null;
}

interface RadioHistorySource {
    channelId: string;
    metadataUrl: string;
}

const METADATA_REQUEST_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 30_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * Records the currently playing song for a channel.
 * Skips insertion if the most recent row for the channel already has the same
 * title + artist (dedupe), so polling does not create duplicate rows.
 */
export async function recordNowPlaying(channelId: string, input: NowPlayingInput): Promise<boolean> {
    const title = normalizeText(input.title);
    if (!channelId || !title) {
        return false;
    }

    const artist = input.artist != null ? normalizeText(input.artist) || null : null;
    const coverUrl = input.coverUrl != null ? normalizeText(input.coverUrl) || null : null;

    const latest = await db.query(
        `SELECT title, artist
         FROM song_history
         WHERE channel_id = $1
         ORDER BY played_at DESC
         LIMIT 1`,
        [channelId],
    );

    const previous = latest.rows[0];
    if (previous && normalizeText(previous.title) === title && (previous.artist ?? null) === artist) {
        // Same song as last recorded entry; skip to avoid duplicates.
        return false;
    }

    await db.query(
        `INSERT INTO song_history (channel_id, title, artist, cover_url)
         VALUES ($1, $2, $3, $4)`,
        [channelId, title, artist, coverUrl],
    );

    return true;
}

/**
 * Deletes song history rows older than 24 hours.
 */
export async function cleanupOldHistory(): Promise<number> {
    const result = await db.query(
        `DELETE FROM song_history
         WHERE played_at < now() - interval '24 hours'`,
    );

    return result.rowCount ?? 0;
}

function parseHistorySources(raw: string | undefined): RadioHistorySource[] {
    if (!raw || !raw.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry: any) => ({
                channelId: normalizeText(entry?.channelId),
                metadataUrl: normalizeText(entry?.metadataUrl),
            }))
            .filter((entry) => entry.channelId && entry.metadataUrl);
    } catch (error) {
        console.error('[radioHistory] Failed to parse RADIO_HISTORY_SOURCES:', error);
        return [];
    }
}

/**
 * Parses a now-playing metadata payload that may be ICY (Icecast/Shoutcast)
 * JSON or a generic JSON now-playing document.
 */
export function parseNowPlayingPayload(data: unknown): NowPlayingInput | null {
    if (data == null) {
        return null;
    }

    // Plain string payload (e.g. ICY "Artist - Title" stream title).
    if (typeof data === 'string') {
        const text = data.trim();
        if (!text) {
            return null;
        }

        const separatorIndex = text.indexOf(' - ');
        if (separatorIndex > 0) {
            return {
                artist: text.slice(0, separatorIndex).trim() || null,
                title: text.slice(separatorIndex + 3).trim(),
            };
        }

        return { title: text };
    }

    if (typeof data !== 'object') {
        return null;
    }

    const record = data as Record<string, any>;

    // Icecast status-json.xsl shape: { icestats: { source: { title, ... } } }
    const icestatsSource = record.icestats?.source;
    const icySource = Array.isArray(icestatsSource) ? icestatsSource[0] : icestatsSource;
    if (icySource && typeof icySource === 'object') {
        return parseNowPlayingPayload(icySource);
    }

    // Common now-playing shapes.
    const now = record.now_playing ?? record.nowplaying ?? record.current ?? record;
    const song = now?.song ?? now;

    const title = normalizeText(
        song?.title ?? song?.track ?? song?.streamTitle ?? song?.name ?? now?.title,
    );
    if (!title) {
        return null;
    }

    return {
        title,
        artist: normalizeText(song?.artist ?? song?.artist_name ?? now?.artist) || null,
        coverUrl:
            normalizeText(song?.cover_url ?? song?.coverUrl ?? song?.art ?? song?.artwork_url ?? song?.image) ||
            null,
    };
}

async function pollSource(source: RadioHistorySource): Promise<void> {
    try {
        const response = await axios.get(source.metadataUrl, {
            timeout: METADATA_REQUEST_TIMEOUT_MS,
        });

        const nowPlaying = parseNowPlayingPayload(response.data);
        if (!nowPlaying) {
            return;
        }

        await recordNowPlaying(source.channelId, nowPlaying);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error(`[radioHistory] Failed to poll channel "${source.channelId}":`, message);
    }
}

/**
 * Starts the background radio history watcher.
 *
 * Reads the OPTIONAL env var RADIO_HISTORY_SOURCES (a JSON array of
 * { channelId, metadataUrl }) and, when set, polls each source roughly every
 * 30 seconds and records the now-playing track. When the env var is unset the
 * watcher stays idle (it only schedules history cleanup).
 *
 * Returns the list of timers it created so callers/tests can clear them.
 */
export function startRadioHistoryWatcher(): NodeJS.Timeout[] {
    const timers: NodeJS.Timeout[] = [];

    const cleanupTimer = setInterval(() => {
        cleanupOldHistory().catch((error) => {
            console.error('[radioHistory] Cleanup failed:', error);
        });
    }, CLEANUP_INTERVAL_MS);
    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }
    timers.push(cleanupTimer);

    const sources = parseHistorySources(process.env.RADIO_HISTORY_SOURCES);
    if (sources.length === 0) {
        console.log('[radioHistory] RADIO_HISTORY_SOURCES not set; watcher idle (history cleanup still scheduled).');
        return timers;
    }

    console.log(`[radioHistory] Watching ${sources.length} radio source(s) for now-playing metadata.`);
    const pollTimer = setInterval(() => {
        for (const source of sources) {
            void pollSource(source);
        }
    }, POLL_INTERVAL_MS);
    if (typeof pollTimer.unref === 'function') {
        pollTimer.unref();
    }
    timers.push(pollTimer);

    // Kick off an initial poll shortly after startup.
    for (const source of sources) {
        void pollSource(source);
    }

    return timers;
}
