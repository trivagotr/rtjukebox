// Jukebox Routes - Updated for Metadata Sync
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import { db } from '../db';
import { getIO } from '../socket';
import { MetadataService } from '../services/metadata';
import { authMiddleware, optionalAuth, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { rbacMiddleware, ROLES } from '../middleware/rbac';
import { adminRateLimit, writeRateLimit } from '../middleware/rateLimits';
import { AudioService } from '../services/audio';
import { songUpload, songUploadDir, normalizeUploadedSongFilename, validateSongUpload } from '../middleware/upload';
import path from 'path';
import { buildSongFileUrl, normalizeText } from '../utils/textNormalization';
import { CatalogSongSearchItem, parseSpotifyPlaylistId, spotifyService, toCatalogSongSearchItem, toContentFilterTrack, upsertSpotifyTrack } from '../services/spotify';
import { fetchLyrics } from '../services/lyrics';
import { randomBytes } from 'crypto';
import { generateKioskCredential, generateKioskProvisioningCode, hashKioskSecret, kioskSecretMatches } from '../services/kioskCredentials';
import { buildAutoplaySelection, buildSystemQueueInsertions, loadEffectiveRadioProfileConfig } from '../services/radioProfiles';
import { createDefaultFilterService, SpotifyTrack as ContentFilterTrack } from '../services/contentFilter';
import {
    getContentFilterSettings,
    getDbBlockedKeywords,
    invalidateBlockedKeywordsCache,
    invalidateContentFilterSettingsCache,
    checkProfanityText,
} from '../services/profanityFilter';
import {
    getInitialSongScore,
    getIstanbulDayKey,
    getIstanbulYearMonth,
    getRequesterRankDelta,
    getSongScoreDelta,
    normalizeVoteKind,
} from '../services/jukeboxScoring';

const GUEST_QUEUE_FINGERPRINT_HEADER = 'x-guest-fingerprint';
type QueueVoteKind = ReturnType<typeof normalizeVoteKind>;

const queueAddBodySchema = z.object({
    device_id: z.string().uuid(),
    song_id: z.string().uuid().optional(),
    spotify_uri: z.string().trim().min(1).max(255).optional(),
}).strict().refine((body) => Boolean(body.song_id) !== Boolean(body.spotify_uri), {
    message: 'Provide exactly one of song_id or spotify_uri',
});

const queueVoteBodySchema = z.object({
    queue_item_id: z.string().uuid().nullable().optional(),
    song_id: z.string().uuid().optional(),
    vote: z.union([z.literal(-1), z.literal(1)]),
    device_id: z.string().uuid(),
    is_super: z.boolean().optional(),
}).strict().refine((body) => Boolean(body.queue_item_id) || Boolean(body.song_id), {
    message: 'A queue item or song is required',
});

export function normalizeDeviceAdminInput(input: { name: string; location?: string | null }) {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
        throw new Error('Device name required');
    }

    return {
        name: normalizeText(trimmedName),
        location: input.location === undefined || input.location === null ? null : normalizeText(input.location)
    };
}

export function readGuestQueueFingerprint(req: Pick<Request, 'headers'>) {
    const headerValue = req.headers[GUEST_QUEUE_FINGERPRINT_HEADER];

    if (Array.isArray(headerValue)) {
        const firstValue = headerValue[0]?.trim();
        return firstValue || null;
    }

    if (typeof headerValue === 'string') {
        const fingerprint = headerValue.trim();
        return fingerprint || null;
    }

    return null;
}

export function getQueueInsertPriorityScore() {
    return getInitialSongScore();
}

export function getStoredVoteValue(voteKind: QueueVoteKind) {
    switch (voteKind) {
        case 'upvote':
            return 1;
        case 'downvote':
            return -1;
        case 'supervote':
            return 3;
        default:
            return 0;
    }
}

export function resolveFinalQueueVoteKind(params: {
    previousVote: unknown;
    requestedVote?: unknown;
    isSuper?: boolean;
}) {
    if (params.isSuper) {
        return 'supervote' as const;
    }

    const previousVoteKind = normalizeVoteKind(params.previousVote);
    const requestedVoteKind = normalizeVoteKind(params.requestedVote);
    if (requestedVoteKind === 'none') {
        return 'none' as const;
    }

    if (previousVoteKind === requestedVoteKind) {
        return 'none' as const;
    }

    return requestedVoteKind;
}

export function canUseDailySupervote(params: {
    isGuest: boolean;
    lastSuperVoteAt?: Date | string | null;
    now?: Date;
}) {
    if (params.isGuest) {
        return { allowed: false as const, reason: 'guest' as const };
    }

    if (!params.lastSuperVoteAt) {
        return { allowed: true as const };
    }

    const lastSuperVoteAt = params.lastSuperVoteAt instanceof Date
        ? params.lastSuperVoteAt
        : new Date(params.lastSuperVoteAt);
    const now = params.now ?? new Date();

    if (getIstanbulDayKey(lastSuperVoteAt) === getIstanbulDayKey(now)) {
        return { allowed: false as const, reason: 'cooldown' as const };
    }

    return { allowed: true as const };
}

export function buildQueueVoteScoreUpdate(params: {
    previousVote: unknown;
    nextVote: unknown;
}) {
    const previousVoteKind = normalizeVoteKind(params.previousVote);
    const nextVoteKind = normalizeVoteKind(params.nextVote);

    return {
        previousVoteKind,
        nextVoteKind,
        storedVoteValue: getStoredVoteValue(nextVoteKind),
        songDelta: getSongScoreDelta(previousVoteKind, nextVoteKind),
        requesterRankDelta: getRequesterRankDelta(previousVoteKind, nextVoteKind),
    };
}

export function buildQueueVoteSkipDecision(params: {
    status?: string | null;
    songScore: number;
}) {
    if (params.songScore > -5) {
        return null;
    }

    const isPlaying = params.status === 'playing';
    return {
        skipped: true as const,
        clearCurrentSong: isPlaying,
        emitSongRejected: !isPlaying,
        emitSongSkipped: isPlaying,
    };
}

export async function applyRequesterVoteRankDelta(params: {
    dbClient: Pick<typeof db, 'query'>;
    requesterId: string;
    requesterRankDelta: number;
    now?: Date;
}) {
    if (params.requesterRankDelta === 0) {
        return;
    }

    const now = params.now ?? new Date();
    const requesterRes = await params.dbClient.query(
        'SELECT is_guest FROM users WHERE id = $1',
        [params.requesterId]
    );

    if (!requesterRes.rows[0] || requesterRes.rows[0].is_guest) {
        return;
    }

    await params.dbClient.query(
        'UPDATE users SET rank_score = rank_score + $1 WHERE id = $2',
        [params.requesterRankDelta, params.requesterId]
    );
    await params.dbClient.query(
        `INSERT INTO user_monthly_rank_scores (user_id, year_month, score)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, year_month)
         DO UPDATE SET score = user_monthly_rank_scores.score + EXCLUDED.score,
                       updated_at = NOW()`,
        [params.requesterId, getIstanbulYearMonth(now), params.requesterRankDelta]
    );
}

export async function enforceGuestDailySongLimit(params: {
    dbClient: Pick<typeof db, 'query'>;
    isGuest: boolean;
    guestFingerprint?: string | null;
    now?: Date;
}) {
    if (!params.isGuest) {
        return;
    }

    const guestFingerprint = params.guestFingerprint?.trim();
    if (!guestFingerprint) {
        throw new Error('Guest fingerprint required');
    }

    const dayKey = getIstanbulDayKey(params.now ?? new Date());
    const result = await params.dbClient.query(
        `SELECT songs_added
         FROM guest_daily_song_limits
         WHERE fingerprint = $1 AND day_key = $2`,
        [guestFingerprint, dayKey]
    );

    const songsAdded = Number.parseInt(result.rows[0]?.songs_added ?? '0', 10);
    if (songsAdded >= 1) {
        throw new Error('Guest daily song limit reached');
    }
}

export async function applyQueueAddStats(params: {
    dbClient: Pick<typeof db, 'query'>;
    userId: string;
    isGuest: boolean;
    guestFingerprint?: string | null;
    now?: Date;
}) {
    const now = params.now ?? new Date();
    await params.dbClient.query(
        'UPDATE users SET total_songs_added = total_songs_added + 1 WHERE id = $1',
        [params.userId]
    );

    if (params.isGuest) {
        const guestFingerprint = params.guestFingerprint?.trim();
        if (!guestFingerprint) {
            throw new Error('Guest fingerprint required');
        }

        await params.dbClient.query(
            `INSERT INTO guest_daily_song_limits (fingerprint, day_key, songs_added)
             VALUES ($1, $2, 1)
             ON CONFLICT (fingerprint, day_key)
             DO UPDATE SET songs_added = guest_daily_song_limits.songs_added + 1,
                           updated_at = NOW()`,
            [guestFingerprint, getIstanbulDayKey(now)]
        );
        return;
    }

    await params.dbClient.query(
        'UPDATE users SET rank_score = rank_score + 2 WHERE id = $1',
        [params.userId]
    );
    await params.dbClient.query(
        `INSERT INTO user_monthly_rank_scores (user_id, year_month, score)
         VALUES ($1, $2, 2)
         ON CONFLICT (user_id, year_month)
         DO UPDATE SET score = user_monthly_rank_scores.score + EXCLUDED.score,
                       updated_at = NOW()`,
        [params.userId, getIstanbulYearMonth(now)]
    );
}

export function normalizeDeviceAdminUpdateInput(input: { name?: string | null; location?: string | null }) {
    const location = input.location === undefined || input.location === null ? undefined : normalizeText(input.location);

    if (input.name === undefined || input.name === null) {
        return {
            name: undefined,
            location,
        };
    }

    const trimmedName = input.name.trim();
    if (!trimmedName) {
        throw new Error('Device name required');
    }

    return {
        name: normalizeText(trimmedName),
        location,
    };
}

export function prepareNormalizedDeviceAdminInput(
    mode: 'create',
    input: { name: string; location?: string | null }
): ReturnType<typeof normalizeDeviceAdminInput>;
export function prepareNormalizedDeviceAdminInput(
    mode: 'update',
    input: { name?: string | null; location?: string | null }
): ReturnType<typeof normalizeDeviceAdminUpdateInput>;
export function prepareNormalizedDeviceAdminInput(
    mode: 'create' | 'update',
    input: { name?: string | null; location?: string | null }
) {
    return mode === 'create'
        ? normalizeDeviceAdminInput(input as { name: string; location?: string | null })
        : normalizeDeviceAdminUpdateInput(input);
}

export function parseSongDetailsFromFilename(filename: string) {
    const normalizedFilename = normalizeUploadedSongFilename(filename);
    const rawBaseName = filename.replace(/\.(mp3|m4a|wav)$/i, '');
    let title = normalizeText(rawBaseName);
    let artist = 'Unknown';

    if (rawBaseName.includes(' - ')) {
        const firstDashIndex = rawBaseName.indexOf(' - ');
        artist = normalizeText(rawBaseName.substring(0, firstDashIndex).trim());
        title = normalizeText(rawBaseName.substring(firstDashIndex + 3).trim());
    }

    return {
        title,
        artist,
        fileUrl: buildSongFileUrl(normalizedFilename)
    };
}

export function normalizeAdminSongClassificationInput(input: {
    visibility?: unknown;
    asset_role?: unknown;
}) {
    const normalized: {
        visibility?: 'public' | 'hidden';
        assetRole?: 'music' | 'jingle' | 'ad';
    } = {};

    if (input.visibility !== undefined) {
        if (input.visibility !== 'public' && input.visibility !== 'hidden') {
            throw new Error('visibility must be public or hidden');
        }
        normalized.visibility = input.visibility;
    }

    if (input.asset_role !== undefined) {
        if (input.asset_role !== 'music' && input.asset_role !== 'jingle' && input.asset_role !== 'ad') {
            throw new Error('asset_role must be music, jingle, or ad');
        }
        normalized.assetRole = input.asset_role;
    }

    if (normalized.visibility === undefined && normalized.assetRole === undefined) {
        throw new Error('visibility or asset_role is required');
    }

    if (normalized.visibility === 'public' && (normalized.assetRole === 'jingle' || normalized.assetRole === 'ad')) {
        throw new Error('jingle and ad assets must remain hidden');
    }

    return normalized;
}

export function normalizeSpotifyKioskRegistrationInput(input: {
    device_id: string;
    spotify_device_id?: string | null;
    player_name?: string | null;
    is_active?: boolean;
}) {
    const deviceId = input.device_id.trim();
    const isActive = input.is_active !== false;
    const spotifyDeviceId = typeof input.spotify_device_id === 'string' ? input.spotify_device_id.trim() : '';
    if (!deviceId) {
        throw new Error('device_id is required');
    }
    if (isActive && !spotifyDeviceId) {
        throw new Error('spotify_device_id is required');
    }

    const playerName = input.player_name === undefined || input.player_name === null
        ? null
        : normalizeText(input.player_name.trim()) || null;

    return {
        deviceId,
        spotifyDeviceId: spotifyDeviceId || null,
        playerName,
        isActive,
    };
}

export function buildSpotifyKioskDeviceUpdate(input: {
    deviceId: string;
    spotifyDeviceId?: string | null;
    playerName?: string | null;
    connectedAt?: Date;
    isActive?: boolean;
}) {
    const connectedAt = input.connectedAt ?? new Date();
    const isActive = input.isActive !== false;
    const playerName = input.playerName === undefined || input.playerName === null
        ? null
        : normalizeText(input.playerName.trim()) || null;

    return {
        spotify_playback_device_id: isActive ? (input.spotifyDeviceId ?? null) : null,
        spotify_player_name: playerName,
        spotify_player_connected_at: connectedAt,
        spotify_player_is_active: isActive,
        is_active: true,
        last_heartbeat: connectedAt,
    };
}

export function resolveSpotifyKioskPlaybackDeviceId(input: {
    spotify_playback_device_id?: string | null;
    spotify_player_is_active?: boolean | null;
}) {
    if (input.spotify_player_is_active === false) {
        return null;
    }

    const playbackDeviceId = input.spotify_playback_device_id?.trim();
    return playbackDeviceId ? playbackDeviceId : null;
}

export function shouldImmediatelyStartSpotifyQueueItem(params: {
    song: SpotifyPlaybackDispatchSong;
    currentSongId?: string | null;
    pendingCount: number;
    playbackTarget?: {
        spotify_playback_device_id?: string | null;
        spotify_player_is_active?: boolean | null;
    } | null;
}) {
    if (params.song.source_type !== 'spotify' || !params.song.spotify_uri) {
        return false;
    }

    if (params.currentSongId) {
        return false;
    }

    if (params.pendingCount !== 1) {
        return false;
    }

    return resolveSpotifyKioskPlaybackDeviceId(params.playbackTarget ?? {}) !== null;
}

async function loadSpotifyKioskPlaybackTarget(deviceId: string) {
    const result = await db.query(
        `SELECT spotify_playback_device_id, spotify_player_is_active
         FROM devices
         WHERE id = $1`,
        [deviceId]
    );

    return result.rows[0] ?? null;
}

function isSpotifyMissingPlaybackDeviceError(error: unknown): boolean {
    const response = (error as { response?: { status?: number; data?: { error?: { reason?: string; message?: string } } } } | null)?.response;
    const reason = response?.data?.error?.reason;
    const message = response?.data?.error?.message;
    return response?.status === 404 && (
        reason === 'NO_ACTIVE_DEVICE' ||
        reason === 'DEVICE_NOT_FOUND' ||
        message?.toLowerCase().includes('device not found') === true
    );
}

function isSpotifyUnauthorizedAccessTokenError(error: unknown): boolean {
    const response = (error as { response?: { status?: number; data?: { error?: { status?: number; message?: string } | string } } } | null)?.response;
    return response?.status === 401;
}

async function markSpotifyKioskPlaybackDeviceInactive(deviceId: string) {
    await db.query(
        `UPDATE devices
         SET spotify_playback_device_id = NULL,
             spotify_player_is_active = false,
             spotify_player_connected_at = NULL
         WHERE id = $1`,
        [deviceId]
    );
}

type SpotifyPlaybackDispatchService = Pick<typeof spotifyService, 'getKioskPlaybackToken' | 'refreshDeviceAccessToken' | 'transferPlayback' | 'playTrack'>;

type SpotifyPlaybackDispatchSong = {
    source_type?: 'spotify' | 'local' | null;
    spotify_uri?: string | null;
};

export async function dispatchSpotifyPlaybackForSong(params: {
    deviceId: string;
    song: SpotifyPlaybackDispatchSong;
    spotifyService?: SpotifyPlaybackDispatchService;
}) {
    if (params.song.source_type !== 'spotify' || !params.song.spotify_uri) {
        return false;
    }

    const spotifyUri = params.song.spotify_uri;
    const playbackTarget = await loadSpotifyKioskPlaybackTarget(params.deviceId);
    let playbackDeviceId = resolveSpotifyKioskPlaybackDeviceId(playbackTarget ?? {});

    const service = params.spotifyService ?? spotifyService;

    if (!playbackDeviceId && !params.spotifyService) {
        try {
            const token = await service.getKioskPlaybackToken(params.deviceId);
            const availableDevices = typeof (service as any).getAvailableDevices === 'function'
                ? await (service as any).getAvailableDevices(token.accessToken)
                : await spotifyService.getAvailableDevices(token.accessToken);
            const chosen = availableDevices.find((d: any) => d.is_active)
                || availableDevices.find((d: any) => d.name?.toUpperCase().startsWith('WIN-'))
                || availableDevices[0];
            if (chosen?.id) {
                playbackDeviceId = chosen.id;
                await db.query(
                    `UPDATE devices
                     SET spotify_playback_device_id = $2,
                         spotify_player_name = $3,
                         spotify_player_is_active = true,
                         spotify_player_connected_at = NOW()
                     WHERE id = $1`,
                    [params.deviceId, chosen.id, chosen.name || 'Spotify Connect']
                );
            }
        } catch (autoDiscoverErr) {
            console.warn('[Spotify Playback] Auto-discovery of active player failed:', autoDiscoverErr);
        }
    }

    if (!playbackDeviceId) {
        throw new Error('No active Spotify kiosk playback device registered');
    }

    const token = await service.getKioskPlaybackToken(params.deviceId);

    try {
        await service.transferPlayback(playbackDeviceId, true, token.accessToken);
        await service.playTrack(playbackDeviceId, spotifyUri, token.accessToken);
    } catch (error) {
        if (isSpotifyMissingPlaybackDeviceError(error)) {
            await markSpotifyKioskPlaybackDeviceInactive(params.deviceId);
        }
        if (isSpotifyUnauthorizedAccessTokenError(error)) {
            const refreshedAccessToken = await service.refreshDeviceAccessToken(params.deviceId);
            try {
                await service.transferPlayback(playbackDeviceId, true, refreshedAccessToken);
                await service.playTrack(playbackDeviceId, spotifyUri, refreshedAccessToken);
            } catch (retryError) {
                if (isSpotifyMissingPlaybackDeviceError(retryError)) {
                    await markSpotifyKioskPlaybackDeviceInactive(params.deviceId);
                }
                throw retryError;
            }
            return true;
        }
        throw error;
    }
    return true;
}

type SpotifyPlaybackSnapshot = {
    deviceId?: string | null;
    isPlaying?: boolean | null;
    progressMs?: number | null;
    itemUri?: string | null;
};

type StoppedSpotifyPlaybackContext = {
    currentSong: {
        source_type?: 'spotify' | 'local' | null;
        spotify_uri?: string | null;
        duration_ms?: number | null;
    } | null;
    playbackTargetDeviceId?: string | null;
    playbackTargetIsActive?: boolean | null;
};

type RecoverableQueueItem = {
    id: string;
    song_id: string;
    source_type?: 'spotify' | 'local' | null;
    spotify_uri?: string | null;
};

type ReconcileStoppedSpotifyPlaybackDeps = {
    loadContext: (deviceId: string) => Promise<StoppedSpotifyPlaybackContext | null>;
    getPlaybackSnapshot: () => Promise<SpotifyPlaybackSnapshot | null>;
    finalizeCurrentPlayingItem: (deviceId: string) => Promise<void>;
    loadNextPendingQueueItem: (deviceId: string) => Promise<RecoverableQueueItem | null>;
    enqueueAutoplay: (deviceId: string) => Promise<void>;
    startQueueItem: (deviceId: string, queueItem: RecoverableQueueItem) => Promise<boolean | void>;
    emitQueueUpdated: (deviceId: string) => Promise<void>;
};

export function shouldRecoverStoppedSpotifyPlayback(params: {
    context: StoppedSpotifyPlaybackContext | null;
    playbackSnapshot: SpotifyPlaybackSnapshot | null;
}) {
    const currentSong = params.context?.currentSong;
    const playbackTargetDeviceId = params.context?.playbackTargetDeviceId?.trim();
    const playbackTargetIsActive = params.context?.playbackTargetIsActive !== false;
    const snapshot = params.playbackSnapshot;
    if (!playbackTargetDeviceId || !playbackTargetIsActive) {
        return false;
    }

    if (!currentSong) {
        return !snapshot?.isPlaying;
    }

    if (currentSong.source_type !== 'spotify' || !currentSong.spotify_uri) {
        return false;
    }

    if (!snapshot) {
        return true;
    }

    if (snapshot.deviceId && snapshot.deviceId !== playbackTargetDeviceId) {
        return false;
    }

    // If Spotify has moved away from the current jukebox song, it finished!
    if (snapshot.itemUri && snapshot.itemUri !== currentSong.spotify_uri) {
        return true;
    }

    if (snapshot.isPlaying) {
        return false;
    }

    const progressMs = snapshot.progressMs;
    if (typeof progressMs !== 'number') {
        return false;
    }

    const durationMs = currentSong.duration_ms ?? null;
    const nearEndThreshold = typeof durationMs === 'number'
        ? Math.max(0, durationMs - 1500)
        : 0;

    return progressMs <= 1500 || progressMs >= nearEndThreshold;
}

async function loadStoppedSpotifyPlaybackContext(deviceId: string): Promise<StoppedSpotifyPlaybackContext | null> {
    const result = await db.query(
        `SELECT d.spotify_playback_device_id,
                d.spotify_player_is_active,
                s.source_type,
                s.spotify_uri,
                s.duration_ms
         FROM devices d
         LEFT JOIN songs s ON s.id = d.current_song_id
         WHERE d.id = $1`,
        [deviceId]
    );

    const row = result.rows[0] ?? null;
    if (!row) {
        return null;
    }

    return {
        currentSong: row.source_type ? {
            source_type: row.source_type,
            spotify_uri: row.spotify_uri ?? null,
            duration_ms: row.duration_ms ?? null,
        } : null,
        playbackTargetDeviceId: row.spotify_playback_device_id ?? null,
        playbackTargetIsActive: row.spotify_player_is_active ?? null,
    };
}

async function finalizeCurrentPlayingQueueItem(deviceId: string) {
    await db.query('UPDATE devices SET current_song_id = NULL WHERE id = $1', [deviceId]);

    const prevPlaying = await db.query(
        `SELECT qi.id, qi.added_by, qi.queue_reason, s.asset_role
         FROM queue_items qi
         JOIN songs s ON s.id = qi.song_id
         WHERE qi.device_id = $1 AND qi.status = 'playing'`,
        [deviceId]
    );

    if (prevPlaying.rows.length === 0) {
        return;
    }

    const previousItem = prevPlaying.rows[0];
    await db.query("UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1", [previousItem.id]);

    await maybeEnqueueProfileSystemItems({
        deviceId,
        completedNormalMusicItem: isCompletedNormalMusicItem(previousItem),
    });
}

async function loadNextRecoverableQueueItem(deviceId: string): Promise<RecoverableQueueItem | null> {
    const result = await db.query(
        `SELECT qi.id, qi.song_id, s.source_type, s.spotify_uri
         FROM queue_items qi
         JOIN songs s ON s.id = qi.song_id
         WHERE qi.device_id = $1 AND qi.status = 'pending'
         ORDER BY qi.priority_score DESC, qi.added_at ASC
         LIMIT 1`,
        [deviceId]
    );

    return result.rows[0] ?? null;
}

async function startRecoverableQueueItem(deviceId: string, queueItem: RecoverableQueueItem) {
    if (queueItem.source_type === 'spotify' && queueItem.spotify_uri) {
        try {
            await dispatchSpotifyPlaybackForSong({
                deviceId,
                song: {
                    source_type: 'spotify',
                    spotify_uri: queueItem.spotify_uri,
                },
            });
        } catch (error) {
            console.warn('[Spotify Recovery] Failed to start recoverable queue item:', error);
            return false;
        }
    }

    await db.query("UPDATE queue_items SET status = 'playing' WHERE id = $1", [queueItem.id]);
    await db.query(
        'UPDATE devices SET current_song_id = $2, last_heartbeat = NOW() WHERE id = $1',
        [deviceId, queueItem.song_id]
    );

    if (queueItem.source_type === 'spotify' && queueItem.spotify_uri) {
        await recordAutoplayPlaybackStart({ queueItemId: queueItem.id });
    }

    return true;
}

async function emitQueueUpdatedForDevice(deviceId: string) {
    getIO()?.to(`device:${deviceId}`).emit('queue_updated', await getQueueForDevice(deviceId, undefined, { skipRecovery: true }));
}

async function getSpotifyKioskPlaybackSnapshotForDevice(deviceId: string) {
    const token = await spotifyService.getKioskPlaybackToken(deviceId);
    try {
        return await spotifyService.getCurrentPlaybackSnapshot(token.accessToken);
    } catch (error) {
        if (isSpotifyUnauthorizedAccessTokenError(error)) {
            const refreshedAccessToken = await spotifyService.refreshDeviceAccessToken(deviceId);
            return spotifyService.getCurrentPlaybackSnapshot(refreshedAccessToken);
        }
        throw error;
    }
}

export async function reconcileStoppedSpotifyPlaybackForDevice(params: {
    deviceId: string;
    deps?: Partial<ReconcileStoppedSpotifyPlaybackDeps>;
}) {
    const deps: ReconcileStoppedSpotifyPlaybackDeps = {
        loadContext: loadStoppedSpotifyPlaybackContext,
        getPlaybackSnapshot: async () => getSpotifyKioskPlaybackSnapshotForDevice(params.deviceId),
        finalizeCurrentPlayingItem: finalizeCurrentPlayingQueueItem,
        loadNextPendingQueueItem: loadNextRecoverableQueueItem,
        enqueueAutoplay: async (deviceId: string) => {
            await enqueueAutoplayForDevice({ deviceId });
        },
        startQueueItem: startRecoverableQueueItem,
        emitQueueUpdated: emitQueueUpdatedForDevice,
        ...params.deps,
    };

    const context = await deps.loadContext(params.deviceId);
    const playbackSnapshot = await deps.getPlaybackSnapshot();
    if (!shouldRecoverStoppedSpotifyPlayback({ context, playbackSnapshot })) {
        return { recovered: false as const };
    }

    await deps.finalizeCurrentPlayingItem(params.deviceId);

    let nextQueueItem = await deps.loadNextPendingQueueItem(params.deviceId);
    if (!nextQueueItem) {
        await deps.enqueueAutoplay(params.deviceId);
        nextQueueItem = await deps.loadNextPendingQueueItem(params.deviceId);
    }

    if (nextQueueItem) {
        const started = await deps.startQueueItem(params.deviceId, nextQueueItem);
        if (started === false) {
            return {
                recovered: false as const,
                reason: 'spotify_dispatch_failed',
            };
        }
    }

    await deps.emitQueueUpdated(params.deviceId);

    return {
        recovered: true as const,
        nextQueueItemId: nextQueueItem?.id ?? null,
    };
}

function readSpotifyKioskDeviceId(req: Request) {
    const bodyDeviceId = typeof (req.body as { device_id?: unknown } | undefined)?.device_id === 'string'
        ? ((req.body as { device_id?: string }).device_id || null)
        : null;

    const raw = bodyDeviceId?.trim();
    if (!raw || raw === 'undefined' || raw === 'null') {
        return null;
    }
    return raw;
}

function readSpotifyKioskDevicePassword(req: Request) {
    const bodyPassword = typeof (req.body as { device_pwd?: unknown } | undefined)?.device_pwd === 'string'
        ? ((req.body as { device_pwd?: string }).device_pwd || null)
        : null;
    return (bodyPassword ?? '').trim();
}

async function loadValidatedSpotifyKioskDevice(deviceId: string, devicePassword: string) {
    try {
        const deviceResult = await db.query(
            `SELECT kc.credential_hash
             FROM kiosk_credentials kc
             JOIN devices d ON d.id = kc.device_id
             WHERE kc.device_id = $1
               AND d.is_active = true
               AND kc.revoked_at IS NULL
               AND kc.expires_at > NOW()`,
            [deviceId]
        );

        if (deviceResult.rows.length === 0) {
            return { ok: false as const, statusCode: 403, error: 'Kiosk credential is missing, expired, or revoked' };
        }

        if (!kioskSecretMatches(deviceResult.rows[0].credential_hash, devicePassword)) {
            return { ok: false as const, statusCode: 403, error: 'Invalid kiosk credential' };
        }

        return { ok: true as const };
    } catch (error: any) {
        if (error?.code === '22P02') {
            return { ok: false as const, statusCode: 404, error: 'Device not found' };
        }
        throw error;
    }
}

function buildSpotifyKioskTokenResponse(params: {
    deviceId: string;
    accessToken: string;
    tokenExpiresAt: Date;
    scopes: string;
}) {
    return {
        device_id: params.deviceId,
        access_token: params.accessToken,
        token_expires_at: params.tokenExpiresAt.toISOString(),
        scopes: params.scopes,
    };
}

function readSpotifyErrorDetails(error: unknown) {
    const response = (error as {
        response?: {
            status?: number;
            data?: {
                error?: string | {
                    status?: number;
                    reason?: string;
                    message?: string;
                };
                error_description?: string;
            };
        };
    } | null)?.response;
    const spotifyError = response?.data?.error;

    return {
        status: response?.status,
        reason: typeof spotifyError === 'object' ? spotifyError.reason : null,
        message: typeof spotifyError === 'object'
            ? spotifyError.message
            : typeof spotifyError === 'string' ? spotifyError : null,
        description: response?.data?.error_description ?? null,
    };
}

function getSpotifyKioskAuthSetupRequiredMessage(error: unknown): string | null {
    const fallbackMessage = error instanceof Error ? error.message : String(error || '');
    const details = readSpotifyErrorDetails(error);
    const combinedMessage = [
        fallbackMessage,
        details.reason,
        details.message,
        details.description,
    ].filter(Boolean).join(' ');
    const normalized = combinedMessage.toLowerCase();

    if (fallbackMessage.includes('No Spotify authorization found') ||
        fallbackMessage.includes('Spotify authorization expired for device') ||
        fallbackMessage.includes('Spotify bağlantısı gerekli') ||
        fallbackMessage.includes('Please reconnect Spotify for this kiosk')) {
        return fallbackMessage;
    }

    if (fallbackMessage.includes('Spotify Premium hesabı gerekli') ||
        (details.status === 403 && normalized.includes('premium'))) {
        return 'Spotify Premium hesabı gerekli';
    }

    if (fallbackMessage.includes('Spotify yetkileri eksik') ||
        (details.status === 403 && (normalized.includes('scope') || normalized.includes('insufficient')))) {
        return fallbackMessage.includes('Spotify yetkileri eksik')
            ? fallbackMessage
            : 'Spotify yetkileri eksik';
    }

    return null;
}

export async function handleSpotifyKioskTokenRequest(req: Request, res: Response) {
    try {
        const deviceId = typeof (req.body as { device_id?: unknown } | undefined)?.device_id === 'string'
            ? (req.body as { device_id: string }).device_id.trim()
            : '';
        if (!deviceId) {
            return sendError(res, 'Missing device_id', 400);
        }

        const devicePassword = typeof (req.body as { device_pwd?: unknown } | undefined)?.device_pwd === 'string'
            ? (req.body as { device_pwd: string }).device_pwd.trim()
            : '';
        const validation = await loadValidatedSpotifyKioskDevice(deviceId, devicePassword);
        if (!validation.ok) {
            return sendError(res, validation.error, validation.statusCode);
        }

        const token = await spotifyService.getKioskPlaybackToken(deviceId);
        return sendSuccess(
            res,
            buildSpotifyKioskTokenResponse({
                deviceId,
                accessToken: token.accessToken,
                tokenExpiresAt: token.tokenExpiresAt,
                scopes: token.scopes,
            }),
            'Spotify kiosk token ready'
        );
    } catch (error) {
        console.error('Spotify kiosk token error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Spotify kiosk token';
        const authSetupMessage = getSpotifyKioskAuthSetupRequiredMessage(error);
        return sendError(
            res,
            authSetupMessage ?? errorMessage,
            authSetupMessage ? 503 : 500
        );
    }
}

export async function handleSpotifyKioskDeviceAuthStatusRequest(req: Request, res: Response) {
    try {
        const deviceId = readSpotifyKioskDeviceId(req);
        const devicePassword = readSpotifyKioskDevicePassword(req);

        if (!deviceId) {
            return sendError(res, 'Missing device_id', 400);
        }

        const validation = await loadValidatedSpotifyKioskDevice(deviceId, devicePassword);
        if (!validation.ok) {
            return sendError(res, validation.error, validation.statusCode);
        }

        const status = await spotifyService.getDeviceAuthStatus(deviceId);
        return sendSuccess(res, status, 'Spotify device auth status fetched');
    } catch (error) {
        console.error('Spotify kiosk device auth status error:', error);
        return sendError(res, 'Failed to fetch Spotify device auth status', 500);
    }
}

export async function handleSpotifyKioskDeviceAuthStartRequest(req: Request, res: Response) {
    try {
        const deviceId = readSpotifyKioskDeviceId(req);
        const devicePassword = readSpotifyKioskDevicePassword(req);

        if (!deviceId) {
            return sendError(res, 'Missing device_id', 400);
        }

        const validation = await loadValidatedSpotifyKioskDevice(deviceId, devicePassword);
        if (!validation.ok) {
            return sendError(res, validation.error, validation.statusCode);
        }

        const returnOrigin = typeof req.body?.return_origin === 'string' ? req.body.return_origin : null;
        const authUrl = await spotifyService.getDeviceAuthStartUrl(deviceId, returnOrigin);
        return sendSuccess(res, { deviceId, authUrl }, 'Spotify device auth url ready');
    } catch (error) {
        console.error('Spotify kiosk device auth start error:', error);
        return sendError(res, 'Failed to initiate Spotify device authorization', 500);
    }
}

export async function handleSpotifyKioskDeviceRegistration(req: Request, res: Response) {
    try {
        const normalized = normalizeSpotifyKioskRegistrationInput({
            device_id: typeof req.body?.device_id === 'string' ? req.body.device_id : '',
            spotify_device_id: typeof req.body?.spotify_device_id === 'string' ? req.body.spotify_device_id : null,
            player_name: typeof req.body?.player_name === 'string' ? req.body.player_name : null,
            is_active: req.body?.is_active !== false,
        });

        const devicePassword = readSpotifyKioskDevicePassword(req);
        const validation = await loadValidatedSpotifyKioskDevice(normalized.deviceId, devicePassword);
        if (!validation.ok) {
            return sendError(res, validation.error, validation.statusCode);
        }

        const update = buildSpotifyKioskDeviceUpdate({
            deviceId: normalized.deviceId,
            spotifyDeviceId: normalized.spotifyDeviceId,
            playerName: normalized.playerName,
            connectedAt: new Date(),
            isActive: normalized.isActive,
        });

        if (!normalized.isActive) {
            await db.query(
                `UPDATE queue_items qi
                 SET status = 'pending'
                 FROM songs s
                 WHERE qi.song_id = s.id
                   AND qi.device_id = $1
                   AND qi.status = 'playing'
                   AND s.source_type = 'spotify'
                 RETURNING qi.id`,
                [normalized.deviceId]
            );
        }

        const updatedDevice = await db.query(
            `UPDATE devices
             SET spotify_playback_device_id = $2,
                 spotify_player_name = $3,
                 spotify_player_connected_at = $4,
                 spotify_player_is_active = $5,
                 is_active = $6,
                 last_heartbeat = $7,
                 current_song_id = CASE
                     WHEN $5 = false AND EXISTS (
                         SELECT 1
                         FROM songs s
                         WHERE s.id = devices.current_song_id
                           AND s.source_type = 'spotify'
                     )
                     THEN NULL
                     ELSE current_song_id
                 END
             WHERE id = $1
             RETURNING id,
                       spotify_playback_device_id,
                       spotify_player_name,
                       spotify_player_connected_at,
                       spotify_player_is_active,
                       is_active,
                       last_heartbeat`,
            [
                normalized.deviceId,
                update.spotify_playback_device_id,
                update.spotify_player_name,
                update.spotify_player_connected_at,
                update.spotify_player_is_active,
                update.is_active,
                update.last_heartbeat,
            ]
        );

        getIO()?.to(`device:${normalized.deviceId}`).emit('queue_updated', await getQueueForDevice(normalized.deviceId));

        return sendSuccess(res, { device: updatedDevice.rows[0] }, 'Kiosk Spotify device registered');
    } catch (error) {
        console.error('Spotify kiosk device registration error:', error);
        return sendError(
            res,
            error instanceof Error ? error.message : 'Failed to register Spotify kiosk device',
            400
        );
    }
}

type StoredCatalogSongRow = {
    id: string;
    source_type?: 'spotify' | 'local' | null;
    visibility?: 'public' | 'hidden' | null;
    asset_role?: 'music' | 'jingle' | 'ad' | null;
    spotify_uri?: string | null;
    spotify_id?: string | null;
    title: string;
    artist: string;
    artist_id?: string | null;
    album?: string | null;
    cover_url?: string | null;
    duration_ms?: number | null;
    duration_seconds?: number | null;
    is_explicit?: boolean | null;
    is_blocked?: boolean | null;
    file_url?: string | null;
    play_count?: number | null;
    is_active?: boolean | null;
};

function toStoredCatalogSongSearchItem(song: StoredCatalogSongRow): CatalogSongSearchItem {
    return {
        id: song.id,
        source_type: song.source_type === 'spotify' ? 'spotify' : 'local',
        visibility: song.visibility === 'hidden' ? 'hidden' : 'public',
        asset_role: song.asset_role === 'jingle' || song.asset_role === 'ad' ? song.asset_role : 'music',
        spotify_uri: song.spotify_uri ?? null,
        spotify_id: song.spotify_id ?? null,
        title: song.title,
        artist: song.artist,
        artist_id: song.artist_id ?? null,
        album: song.album ?? null,
        cover_url: song.cover_url ?? null,
        duration_ms: song.duration_ms ?? (song.duration_seconds ? song.duration_seconds * 1000 : null),
        is_explicit: song.is_explicit ?? false,
        is_blocked: song.is_blocked ?? false,
        file_url: song.file_url ?? null,
        play_count: song.play_count ?? 0,
    };
}

export function mergeSongCatalogSearchResults(params: {
    spotifyTracks: ContentFilterTrack[];
    localSongs: StoredCatalogSongRow[];
}): CatalogSongSearchItem[] {
    const spotifyItems = params.spotifyTracks.map(toCatalogSongSearchItem);
    const localItems = params.localSongs
        .filter((song) => (song.visibility ?? 'public') === 'public')
        .map(toStoredCatalogSongSearchItem);

    return [...spotifyItems, ...localItems];
}

type QueueSongSelectionRequest = {
    song_id?: string;
    spotify_uri?: string;
};

type QueueSongSelectionRow = Pick<StoredCatalogSongRow, 'id' | 'source_type' | 'visibility' | 'asset_role'>;

export async function resolveQueueSongSelection(params: {
    request: QueueSongSelectionRequest;
    requesterRole: string;
    loadSongById: (songId: string) => Promise<QueueSongSelectionRow | null>;
    resolveSpotifyTrackByUri: (spotifyUri: string) => Promise<ContentFilterTrack>;
    upsertSpotifyTrack: (track: ContentFilterTrack) => Promise<string>;
    validateTrack?: (track: ContentFilterTrack) => Promise<{ allowed: boolean; reason?: string }>;
}): Promise<{ songId: string; sourceType: 'spotify' | 'local'; queueReason: 'user' | 'admin' }> {
    const queueReason = params.requesterRole === ROLES.ADMIN ? 'admin' : 'user';

    if (params.request.spotify_uri) {
        const track = await params.resolveSpotifyTrackByUri(params.request.spotify_uri);
        if (params.validateTrack && params.requesterRole !== ROLES.ADMIN) {
            const validation = await params.validateTrack(track);
            if (!validation.allowed) {
                throw new Error(validation.reason || 'Track rejected by content policy');
            }
        }
        const songId = await params.upsertSpotifyTrack(track);
        return {
            songId,
            sourceType: 'spotify',
            queueReason,
        };
    }

    if (!params.request.song_id) {
        throw new Error('A song_id or spotify_uri is required');
    }

    const song = await params.loadSongById(params.request.song_id);
    if (!song) {
        throw new Error('Song not found');
    }

    if (song.source_type !== 'spotify' && song.visibility === 'hidden' && params.requesterRole !== ROLES.ADMIN) {
        throw new Error('Hidden local assets cannot be queued by non-admin users');
    }

    return {
        songId: song.id,
        sourceType: song.source_type === 'spotify' ? 'spotify' : 'local',
        queueReason,
    };
}

type QueueStateRow = {
    id: string;
    status: 'pending' | 'playing' | 'played' | 'skipped' | string;
    queue_reason?: 'user' | 'admin' | 'autoplay' | 'jingle' | 'ad' | string | null;
    [key: string]: any;
};

type PlaybackDescriptorInput = {
    source_type?: 'spotify' | 'local' | null;
    spotify_uri?: string | null;
    file_url?: string | null;
    asset_role?: 'music' | 'jingle' | 'ad' | null;
};

type CurrentSongFallbackInput = Pick<
    StoredCatalogSongRow,
    'id' | 'title' | 'artist' | 'cover_url' | 'duration_ms' | 'spotify_uri' | 'spotify_id' | 'source_type' | 'file_url' | 'asset_role'
>;

export function buildPlaybackDescriptor(item: PlaybackDescriptorInput) {
    const sourceType = item.source_type === 'spotify' ? 'spotify' : 'local';

    return {
        source_type: sourceType,
        playback_type: sourceType,
        spotify_uri: sourceType === 'spotify' ? item.spotify_uri ?? null : null,
        file_url: sourceType === 'local' ? item.file_url ?? null : null,
        asset_role: item.asset_role === 'jingle' || item.asset_role === 'ad' ? item.asset_role : 'music',
    };
}

function decorateQueuePlaybackItem<T extends Record<string, any>>(item: T) {
    return {
        ...item,
        ...buildPlaybackDescriptor(item),
    };
}

function isQueueItemVisible(row: QueueStateRow) {
    return row.queue_reason !== 'jingle' && row.queue_reason !== 'ad';
}

export function buildVisibleQueueState<T extends QueueStateRow>(rows: T[], nowPlayingOverride?: T | null) {
    const nowPlaying = nowPlayingOverride ?? rows.find((row) => row.status === 'playing') ?? null;
    const queue = rows.filter((row) => row.status === 'pending' && isQueueItemVisible(row));

    return {
        now_playing: nowPlaying,
        queue,
    };
}

export function buildCurrentSongFallbackItem(song: CurrentSongFallbackInput) {
    return decorateQueuePlaybackItem({
        id: `current-${song.id}`,
        song_id: song.id,
        title: song.title,
        artist: song.artist,
        cover_url: song.cover_url ?? null,
        duration_ms: song.duration_ms ?? null,
        spotify_uri: song.spotify_uri ?? null,
        spotify_id: song.spotify_id ?? null,
        source_type: song.source_type === 'spotify' ? 'spotify' : 'local',
        file_url: song.file_url ?? null,
        asset_role: song.asset_role ?? 'music',
        added_by_name: 'Radio TEDU (Otomatik)',
        status: 'playing',
        is_autoplay: true,
    });
}

type SongUploadDbClient = {
    query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
    release?: () => Promise<void> | void;
};

type SongUploadDbSession = {
    client: SongUploadDbClient;
    release: () => Promise<void> | void;
};

type SongUploadFsClient = {
    existsSync: (path: string) => boolean;
    renameSync: (from: string, to: string) => void;
    unlinkSync: (path: string) => void;
};

type SongUploadMetadataService = {
    syncSongMetadata: (songId: string) => Promise<any>;
};

type UploadedSongFile = {
    filename: string;
    originalname: string;
    path?: string;
};

function getUploadedSongFilePath(file: UploadedSongFile, uploadsPath: string) {
    return file.path ?? path.join(uploadsPath, file.filename);
}

function removeFileIfPresent(fsImpl: SongUploadFsClient, filePath: string) {
    if (!fsImpl.existsSync(filePath)) {
        return;
    }

    fsImpl.unlinkSync(filePath);
}

async function acquireSongUploadDbSession(dbClient?: SongUploadDbClient): Promise<SongUploadDbSession> {
    if (dbClient) {
        return {
            client: dbClient,
            release: () => dbClient.release?.() ?? undefined,
        };
    }

    const client = await db.pool.connect();
    return {
        client,
        release: () => client.release(),
    };
}

type AutomationQueueReason = 'autoplay' | 'jingle' | 'ad';
type AutomationQueueInsertion = {
    songId: string;
    queueReason: AutomationQueueReason;
    autoplayRadioProfileId?: string | null;
};

type SystemAutomationDeps = {
    loadEffectiveConfig: typeof loadEffectiveRadioProfileConfig;
    countCompletedMusic: (deviceId: string) => Promise<number>;
    loadProfilePoolSongs: typeof loadProfilePoolSongs;
    enqueueQueueItems: (params: { deviceId: string; insertions: AutomationQueueInsertion[] }) => Promise<void>;
    updateLastAdBreakAt: (deviceId: string, at: Date) => Promise<void>;
    now: () => Date;
    random: () => number;
};

type AutoplayAutomationDeps = {
    loadEffectiveConfig: typeof loadEffectiveRadioProfileConfig;
    getPlaylistTracks: (playlistUri: string) => Promise<ContentFilterTrack[]>;
    filterTracks: (tracks: ContentFilterTrack[]) => Promise<ContentFilterTrack[]>;
    loadAutoplayStats: (radioProfileId: string, spotifyUris: string[]) => Promise<Array<{
        spotify_uri: string;
        play_count: number | null;
        last_played_at?: Date | string | null;
    }>>;
    upsertTrack: typeof upsertSpotifyTrack;
    enqueueQueueItems: (params: { deviceId: string; insertions: AutomationQueueInsertion[] }) => Promise<void>;
    loadFallbackLocalSong: (deviceId: string) => Promise<{ id: string; title: string; source_type: 'local' } | null>;
    random: () => number;
};

async function ensureSystemUserId() {
    const systemUser = await db.query("SELECT id FROM users WHERE email = $1", ['system@radiotedu.com']);
    if (systemUser.rows.length > 0) {
        return systemUser.rows[0].id as string;
    }

    const createdUser = await db.query(
        "INSERT INTO users (email, display_name, role) VALUES ($1, $2, $3) RETURNING id",
        ['system@radiotedu.com', 'Radio TEDU', 'user']
    );
    return createdUser.rows[0].id as string;
}

async function loadProfilePoolSongs(profileId: string, slotType: 'jingle' | 'ad') {
    const result = await db.query(
        `SELECT s.id
         FROM radio_profile_assets rpa
         JOIN songs s ON s.id = rpa.song_id
         WHERE rpa.radio_profile_id = $1
           AND rpa.slot_type = $2
           AND s.source_type = 'local'
           AND s.visibility = 'hidden'
           AND s.asset_role = $2
           AND COALESCE(s.is_blocked, false) = false
           AND COALESCE(s.is_active, true) = true
         ORDER BY COALESCE(rpa.sort_order, 0), s.title`,
        [profileId, slotType]
    );

    return result.rows as Array<{ id: string }>;
}

async function getPendingQueuePriorityBase(deviceId: string) {
    const result = await db.query(
        "SELECT COALESCE(MAX(priority_score), 0) AS max_priority FROM queue_items WHERE device_id = $1 AND status = 'pending'",
        [deviceId]
    );
    return Number(result.rows[0]?.max_priority ?? 0);
}

async function enqueueAutomationQueueItems(params: {
    deviceId: string;
    insertions: AutomationQueueInsertion[];
}) {
    if (params.insertions.length === 0) {
        return;
    }

    const systemUserId = await ensureSystemUserId();
    const basePriority = await getPendingQueuePriorityBase(params.deviceId);

    for (const [index, insertion] of params.insertions.entries()) {
        const priorityScore = basePriority + params.insertions.length - index;
        await db.query(
            `INSERT INTO queue_items (
                 device_id,
                 song_id,
                 added_by,
                 priority_score,
                 status,
                 queue_reason,
                 autoplay_radio_profile_id
             )
             VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
            [params.deviceId, insertion.songId, systemUserId, priorityScore, insertion.queueReason, insertion.autoplayRadioProfileId ?? null]
        );
    }
}

async function countCompletedNormalMusicItems(deviceId: string) {
    const result = await db.query(
        `SELECT COUNT(*) AS played_count
         FROM queue_items qi
         JOIN songs s ON s.id = qi.song_id
         WHERE qi.device_id = $1
           AND qi.status = 'played'
           AND qi.queue_reason IN ('user', 'admin', 'autoplay')
           AND COALESCE(s.asset_role, 'music') = 'music'`,
        [deviceId]
    );

    return Number(result.rows[0]?.played_count ?? 0);
}

async function updateLastAdBreakAt(deviceId: string, at: Date) {
    await db.query('UPDATE devices SET last_ad_break_at = $2 WHERE id = $1', [deviceId, at]);
}

async function loadFallbackLocalAutoplaySong(deviceId: string) {
    const result = await db.query(
        `SELECT s.id, s.title
         FROM songs s
         LEFT JOIN devices d ON d.id = $1
         WHERE s.source_type = 'local'
           AND s.visibility = 'public'
           AND COALESCE(s.asset_role, 'music') = 'music'
           AND COALESCE(s.is_blocked, false) = false
           AND COALESCE(s.is_active, true) = true
           AND (d.current_song_id IS NULL OR s.id <> d.current_song_id)
         ORDER BY RANDOM()
         LIMIT 1`,
        [deviceId]
    );

    const song = result.rows[0];
    if (!song) {
        return null;
    }

    return {
        id: song.id,
        title: song.title,
        source_type: 'local' as const,
    };
}

export async function loadAutoplayStatsForProfile(params: {
    radioProfileId: string;
    spotifyUris: string[];
    dbClient?: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> };
}) {
    if (params.spotifyUris.length === 0) {
        return [];
    }

    const uniqueSpotifyUris = Array.from(new Set(
        params.spotifyUris.filter((spotifyUri): spotifyUri is string => typeof spotifyUri === 'string' && spotifyUri.length > 0)
    ));

    if (uniqueSpotifyUris.length === 0) {
        return [];
    }

    const dbClient = params.dbClient ?? db;
    const result = await dbClient.query(
        `SELECT spotify_uri, play_count, last_played_at
         FROM radio_profile_playlist_stats
         WHERE radio_profile_id = $1
           AND spotify_uri = ANY($2::text[])
         ORDER BY spotify_uri`,
        [params.radioProfileId, uniqueSpotifyUris]
    );

    return result.rows.map((row: any) => ({
        spotify_uri: row.spotify_uri,
        play_count: Number(row.play_count ?? 0),
        last_played_at: row.last_played_at ?? null,
    }));
}

export async function recordAutoplayPlaybackStart(params: {
    queueItemId: string;
    dbClient?: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> };
}) {
    const dbClient = params.dbClient ?? db;
    const result = await dbClient.query(
        `SELECT qi.id,
                qi.queue_reason,
                qi.autoplay_radio_profile_id,
                s.source_type,
                s.spotify_uri,
                d.radio_profile_id AS device_radio_profile_id
         FROM queue_items qi
         JOIN songs s ON s.id = qi.song_id
         JOIN devices d ON d.id = qi.device_id
         WHERE qi.id = $1
         LIMIT 1`,
        [params.queueItemId]
    );

    const row = result?.rows?.[0] ?? null;
    if (!row) {
        return false;
    }

    const autoplayRadioProfileId = row.autoplay_radio_profile_id ?? row.device_radio_profile_id ?? null;
    if (row.queue_reason !== 'autoplay' || row.source_type !== 'spotify' || !row.spotify_uri || !autoplayRadioProfileId) {
        return false;
    }

    await dbClient.query(
        `INSERT INTO radio_profile_playlist_stats (
             radio_profile_id,
             spotify_uri,
             play_count,
             last_played_at,
             updated_at
         ) VALUES ($1, $2, 1, NOW(), NOW())
         ON CONFLICT (radio_profile_id, spotify_uri)
         DO UPDATE SET
             play_count = radio_profile_playlist_stats.play_count + 1,
             last_played_at = NOW(),
             updated_at = NOW()`,
        [autoplayRadioProfileId, row.spotify_uri]
    );

    return true;
}

export function isCompletedNormalMusicItem(item: { queue_reason?: string | null; asset_role?: string | null }) {
    return ['user', 'admin', 'autoplay'].includes(item.queue_reason ?? '')
        && (item.asset_role ?? 'music') === 'music';
}

export async function maybeEnqueueProfileSystemItems(params: {
    deviceId: string;
    completedNormalMusicItem: boolean;
    deps?: Partial<SystemAutomationDeps>;
}) {
    if (!params.completedNormalMusicItem) {
        return [];
    }

    const deps: SystemAutomationDeps = {
        loadEffectiveConfig: loadEffectiveRadioProfileConfig,
        countCompletedMusic: countCompletedNormalMusicItems,
        loadProfilePoolSongs,
        enqueueQueueItems: enqueueAutomationQueueItems,
        updateLastAdBreakAt,
        now: () => new Date(),
        random: Math.random,
        ...params.deps,
    };

    const effectiveConfig = await deps.loadEffectiveConfig({ deviceId: params.deviceId });
    if (!effectiveConfig?.radioProfileId) {
        return [];
    }

    const completedMusicCount = await deps.countCompletedMusic(params.deviceId);
    const [jinglePool, adPool] = await Promise.all([
        deps.loadProfilePoolSongs(effectiveConfig.radioProfileId, 'jingle'),
        deps.loadProfilePoolSongs(effectiveConfig.radioProfileId, 'ad'),
    ]);

    const now = deps.now();
    const insertions = buildSystemQueueInsertions({
        effectiveConfig,
        completedNormalMusicItem: params.completedNormalMusicItem,
        completedMusicCount,
        now,
        jinglePool,
        adPool,
        random: deps.random,
    });

    if (insertions.length === 0) {
        return [];
    }

    await deps.enqueueQueueItems({
        deviceId: params.deviceId,
        insertions,
    });

    if (insertions.some((insertion) => insertion.queueReason === 'ad')) {
        await deps.updateLastAdBreakAt(params.deviceId, now);
    }

    return insertions;
}

export async function enqueueAutoplayForDevice(params: {
    deviceId: string;
    deps?: Partial<AutoplayAutomationDeps>;
}) {
    const deps: AutoplayAutomationDeps = {
        loadEffectiveConfig: loadEffectiveRadioProfileConfig,
        getPlaylistTracks: (playlistUri) => spotifyService.getPlaylistTracks(playlistUri, 'TR', 50),
        filterTracks: async (tracks) => createDefaultFilterService().filterTracks(tracks),
        loadAutoplayStats: (radioProfileId, spotifyUris) => loadAutoplayStatsForProfile({ radioProfileId, spotifyUris }),
        upsertTrack: upsertSpotifyTrack,
        enqueueQueueItems: enqueueAutomationQueueItems,
        loadFallbackLocalSong: loadFallbackLocalAutoplaySong,
        random: Math.random,
        ...params.deps,
    };

    const enqueueFallbackLocalSong = async () => {
        const fallbackSong = await deps.loadFallbackLocalSong(params.deviceId);
        if (!fallbackSong) {
            return null;
        }

        await deps.enqueueQueueItems({
            deviceId: params.deviceId,
            insertions: [{ songId: fallbackSong.id, queueReason: 'autoplay', autoplayRadioProfileId: effectiveConfig?.radioProfileId ?? null }],
        });

        return {
            ...fallbackSong,
            source_type: 'local' as const,
        };
    };

    const effectiveConfig = await deps.loadEffectiveConfig({ deviceId: params.deviceId });
    if (!effectiveConfig?.autoplaySpotifyPlaylistUri) {
        return enqueueFallbackLocalSong();
    }

    let playlistTracks: ContentFilterTrack[];
    try {
        playlistTracks = await deps.getPlaylistTracks(effectiveConfig.autoplaySpotifyPlaylistUri);
    } catch (error) {
        console.warn('[Jukebox] Autoplay playlist fetch skipped:', error);
        return enqueueFallbackLocalSong();
    }

    const filteredTracks = await deps.filterTracks(playlistTracks);
    const autoplayStats = effectiveConfig.radioProfileId
        ? await deps.loadAutoplayStats(
            effectiveConfig.radioProfileId,
            filteredTracks.map((track) => track.spotify_uri).filter((spotifyUri): spotifyUri is string => typeof spotifyUri === 'string' && spotifyUri.length > 0)
        )
        : [];
    const selection = buildAutoplaySelection({
        playlistUri: effectiveConfig.autoplaySpotifyPlaylistUri,
        tracks: filteredTracks,
        autoplayStats,
        random: deps.random,
    });

    if (!selection) {
        return enqueueFallbackLocalSong();
    }

    const songId = await deps.upsertTrack(selection.track);
    await deps.enqueueQueueItems({
        deviceId: params.deviceId,
        insertions: [{ songId, queueReason: selection.queueReason, autoplayRadioProfileId: effectiveConfig.radioProfileId ?? null }],
    });

    return selection.track;
}

export async function finalizeUploadedSongUpload(params: {
    file: UploadedSongFile;
    uploadsPath?: string;
    dbClient?: SongUploadDbClient;
    fsImpl?: SongUploadFsClient;
    metadataService?: SongUploadMetadataService;
}) {
    const fsImpl = params.fsImpl ?? fs;
    const uploadsPath = params.uploadsPath ?? songUploadDir;
    const { client: dbClient, release } = await acquireSongUploadDbSession(params.dbClient);
    const metadataService = params.metadataService ?? MetadataService;
    const canonicalFile = parseSongDetailsFromFilename(params.file.originalname);
    const tempFilePath = getUploadedSongFilePath(params.file, uploadsPath);
    const canonicalFilename = canonicalFile.fileUrl.replace('/uploads/songs/', '');
    const canonicalFilePath = path.join(uploadsPath, canonicalFilename);
    const originalNameDetails = parseSongDetailsFromFilename(params.file.originalname);
    const cleanupTempFile = () => removeFileIfPresent(fsImpl, tempFilePath);
    let renamed = false;

    const renameTempToCanonical = () => {
        if (tempFilePath !== canonicalFilePath) {
            fsImpl.renameSync(tempFilePath, canonicalFilePath);
            renamed = true;
        }
    };

    const removeCanonicalIfCreated = () => {
        if (!renamed) {
            return;
        }

        removeFileIfPresent(fsImpl, canonicalFilePath);
    };

    try {
        await dbClient.query('BEGIN', []);
        await dbClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [canonicalFile.fileUrl]);

        const existing = await dbClient.query(
            'SELECT id, is_active, file_url FROM songs WHERE file_url = $1',
            [canonicalFile.fileUrl]
        );
        const existingRow = existing.rows[0] ?? null;
        const canonicalFileExists = fsImpl.existsSync(canonicalFilePath);

        if (existingRow && existingRow.is_active) {
            await dbClient.query('COMMIT', []);
            cleanupTempFile();
            return {
                status: 'duplicate' as const,
                fileUrl: canonicalFile.fileUrl,
                filename: canonicalFilename,
                title: originalNameDetails.title,
                artist: originalNameDetails.artist,
            };
        }

        if (!existingRow && canonicalFileExists) {
            await dbClient.query('COMMIT', []);
            cleanupTempFile();
            return {
                status: 'duplicate' as const,
                fileUrl: canonicalFile.fileUrl,
                filename: canonicalFilename,
                title: originalNameDetails.title,
                artist: originalNameDetails.artist,
            };
        }

        if (existingRow && !existingRow.is_active && canonicalFileExists) {
            const updatedRows = await dbClient.query(
                'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                [existingRow.id]
            );

            await dbClient.query('COMMIT', []);
            cleanupTempFile();

            let song = updatedRows.rows[0] ?? { ...existingRow, is_active: true };
            try {
                const synced = await metadataService.syncSongMetadata(existingRow.id);
                if (synced) {
                    song = synced;
                }
            } catch (syncError) {
                console.log('Metadata sync failed, using filename data:', syncError);
            }

            return {
                status: 'reactivated' as const,
                fileUrl: canonicalFile.fileUrl,
                filename: canonicalFilename,
                song,
                title: originalNameDetails.title,
                artist: originalNameDetails.artist,
            };
        }

        renameTempToCanonical();

        const insertedRows = await dbClient.query(
            'INSERT INTO songs (title, artist, duration_seconds, file_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [originalNameDetails.title, originalNameDetails.artist, 180, canonicalFile.fileUrl]
        );

        await dbClient.query('COMMIT', []);

        renamed = false;
        cleanupTempFile();

        let song = insertedRows.rows[0];
        try {
            const synced = await metadataService.syncSongMetadata(song.id);
            if (synced) {
                song = synced;
            }
        } catch (syncError) {
            console.log('Metadata sync failed, using filename data:', syncError);
        }

        return {
            status: 'uploaded' as const,
            fileUrl: canonicalFile.fileUrl,
            filename: canonicalFilename,
            song,
            title: originalNameDetails.title,
            artist: originalNameDetails.artist,
        };
    } catch (error) {
        try {
            await dbClient.query('ROLLBACK', []);
        } catch (rollbackError) {
            console.error('Failed to roll back song upload transaction:', rollbackError);
        }

        if (renamed) {
            removeCanonicalIfCreated();
        }

        cleanupTempFile();
        throw error;
    } finally {
        await release();
    }
}

type ScanFolderDbClient = {
    query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
};

type ScanFolderFsClient = {
    existsSync: (path: string) => boolean;
    renameSync: (from: string, to: string) => void;
};

type ScanFolderDbSession = {
    client: ScanFolderDbClient;
    release: () => Promise<void> | void;
};

async function acquireScanFolderDbSession(dbClient?: ScanFolderDbClient): Promise<ScanFolderDbSession> {
    if (dbClient) {
        return {
            client: dbClient,
            release: () => {},
        };
    }

    const client = await db.pool.connect();
    return {
        client,
        release: () => client.release(),
    };
}

function buildStoredSongFileUrl(filename: string) {
    return `/uploads/songs/${filename}`;
}

export function shouldScanFolderProcessFile(filename: string) {
    if (filename.startsWith('song-upload-')) {
        return false;
    }

    return filename.endsWith('.mp3') || filename.endsWith('.m4a') || filename.endsWith('.wav');
}

export async function processScanFolderSongFile(params: {
    file: string;
    uploadsPath: string;
    dbClient?: ScanFolderDbClient;
    fsImpl?: ScanFolderFsClient;
}) {
    const { client: dbClient, release } = await acquireScanFolderDbSession(params.dbClient);
    const fsImpl = params.fsImpl ?? fs;
    const normalizedFilename = normalizeUploadedSongFilename(params.file);
    const originalFileUrl = buildStoredSongFileUrl(params.file);
    const normalizedFileUrl = buildSongFileUrl(normalizedFilename);
    const originalFilePath = path.join(params.uploadsPath, params.file);
    const normalizedFilePath = path.join(params.uploadsPath, normalizedFilename);
    const rawBaseName = params.file.replace(/\.(mp3|m4a|wav)$/i, '');
    let originalRow: any = null;
    let normalizedRow: any = null;
    const mutations: Array<() => Promise<{ rows: any[] }>> = [];
    let renamed = false;

    let title = normalizeText(rawBaseName);
    let artist = 'Unknown';
    if (rawBaseName.includes(' - ')) {
        const firstDashIndex = rawBaseName.indexOf(' - ');
        artist = normalizeText(rawBaseName.substring(0, firstDashIndex).trim());
        title = normalizeText(rawBaseName.substring(firstDashIndex + 3).trim());
    }

    const shouldRename = normalizedFilename !== params.file
        && fsImpl.existsSync(originalFilePath)
        && !fsImpl.existsSync(normalizedFilePath);

    const rollbackRename = () => {
        if (!renamed) return;
        try {
            fsImpl.renameSync(normalizedFilePath, originalFilePath);
            renamed = false;
        } catch (rollbackError) {
            console.error('[scan-folder] Failed to roll back rename after DB error:', rollbackError);
        }
    };

    try {
        const [originalExisting, normalizedExisting] = await Promise.all([
            dbClient.query(
                'SELECT id, is_active, file_url FROM songs WHERE file_url = $1',
                [originalFileUrl]
            ),
            normalizedFilename === params.file
                ? Promise.resolve({ rows: [] as any[] })
                : dbClient.query(
                    'SELECT id, is_active, file_url FROM songs WHERE file_url = $1',
                    [normalizedFileUrl]
                ),
        ]);

        originalRow = originalExisting.rows[0] ?? null;
        normalizedRow = normalizedExisting.rows[0] ?? null;

        if (shouldRename) {
            fsImpl.renameSync(originalFilePath, normalizedFilePath);
            renamed = true;
        }

        if (originalRow && normalizedRow) {
            if (!normalizedRow.is_active) {
                mutations.push(() =>
                    dbClient.query(
                        'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                        [normalizedRow.id]
                    )
                );
            }

            if (originalRow.is_active) {
                mutations.push(() =>
                    dbClient.query(
                        'UPDATE songs SET is_active = false WHERE id = $1 RETURNING *',
                        [originalRow.id]
                    )
                );
            }

            const transactionRows = await runScanFolderMutations(dbClient, mutations, rollbackRename);
            return {
                action: 'reconciled' as const,
                fileUrl: normalizedFileUrl,
                song: normalizedRow ? { ...normalizedRow, is_active: true } : transactionRows[0] ?? originalRow,
                title,
                artist,
            };
        }

        if (normalizedRow) {
            if (!normalizedRow.is_active) {
                const updatedRows = await runScanFolderMutations(dbClient, [
                    () => dbClient.query(
                        'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                        [normalizedRow.id]
                    ),
                ], rollbackRename);

                return {
                    action: 'reactivated' as const,
                    fileUrl: normalizedFileUrl,
                    song: updatedRows[0] ?? normalizedRow,
                    title,
                    artist,
                };
            }

            return {
                action: 'skipped' as const,
                fileUrl: normalizedFileUrl,
                song: normalizedRow,
                title,
                artist,
            };
        }

        if (originalRow) {
            if (shouldRename) {
                const updatedRows = await runScanFolderMutations(dbClient, [
                    () => dbClient.query(
                        'UPDATE songs SET file_url = $1, is_active = true WHERE id = $2 RETURNING *',
                        [normalizedFileUrl, originalRow.id]
                    ),
                ], rollbackRename);

                return {
                    action: 'updated' as const,
                    fileUrl: normalizedFileUrl,
                    song: updatedRows[0] ?? originalRow,
                    title,
                    artist,
                };
            }

            if (!originalRow.is_active) {
                const updatedRows = await runScanFolderMutations(dbClient, [
                    () => dbClient.query(
                        'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                        [originalRow.id]
                    ),
                ], rollbackRename);

                return {
                    action: 'reactivated' as const,
                    fileUrl: originalFileUrl,
                    song: updatedRows[0] ?? originalRow,
                    title,
                    artist,
                };
            }

            return {
                action: 'skipped' as const,
                fileUrl: originalFileUrl,
                song: originalRow,
                title,
                artist,
            };
        }

        const insertFileUrl = shouldRename ? normalizedFileUrl : originalFileUrl;
        const insertedRows = await runScanFolderMutations(dbClient, [
            () => dbClient.query(
                'INSERT INTO songs (title, artist, duration_seconds, file_url) VALUES ($1, $2, $3, $4) RETURNING *',
                [title, artist, 180, insertFileUrl]
            ),
        ], rollbackRename);

        return {
            action: 'inserted' as const,
            fileUrl: insertFileUrl,
            song: insertedRows[0],
            title,
            artist,
        };
    } catch (error) {
        rollbackRename();
        throw error;
    } finally {
        await release();
    }
}

async function runScanFolderMutations(
    dbClient: ScanFolderDbClient,
    mutations: Array<() => Promise<{ rows: any[] }>>,
    rollbackRename: () => void,
) {
    if (mutations.length === 0) {
        return [];
    }

    try {
        await dbClient.query('BEGIN', []);
        const rows: any[] = [];

        for (const mutation of mutations) {
            const result = await mutation();
            rows.push(...result.rows);
        }

        await dbClient.query('COMMIT', []);
        return rows;
    } catch (error) {
        try {
            await dbClient.query('ROLLBACK', []);
        } catch (rollbackError) {
            console.error('[scan-folder] Failed to roll back transaction:', rollbackError);
        }
        rollbackRename();
        throw error;
    }
}

// --- Helper Middlewares ---
async function checkDeviceSession(req: AuthRequest, res: Response, next: NextFunction) {
    const { device_id } = req.body;
    const user_id = req.user?.id;

    if (!device_id) {
        console.warn(`[SECURITY] Missing device_id in request to ${req.path} from user ${user_id}`);
        return sendError(res, 'Device ID required', 400);
    }

    if (!user_id) return sendError(res, 'Unauthorized', 401);

    // Admins have bypass
    if (req.user?.role === ROLES.ADMIN) return next();

    try {
        const sessionRes = await db.query(
            'SELECT 1 FROM device_sessions WHERE user_id = $1 AND device_id = $2',
            [user_id, device_id]
        );

        if (sessionRes.rows.length === 0) {
            console.warn(`[SECURITY] No session found for user ${user_id} on device ${device_id}`);
            return sendError(res, 'Session required for this device', 403, 'SESSION_REQUIRED');
        }

        next();
    } catch (error) {
        console.error('Session check error:', error);
        return sendError(res, 'Internal server error during session check', 500);
    }
}

const router = Router();
router.use('/admin', authMiddleware, rbacMiddleware([ROLES.ADMIN]), adminRateLimit);

// --- Admin Endpoints (High Priority) ---

// Force logout all clients from a device
router.post('/admin/devices/:id/provision', async (req: AuthRequest, res: Response) => {
    const { id: deviceId } = req.params;
    const provisioningCode = generateKioskProvisioningCode();
    const codeHash = hashKioskSecret(provisioningCode);

    try {
        const result = await db.transaction(async (client) => {
            const device = await client.query('SELECT id, is_active FROM devices WHERE id = $1 FOR UPDATE', [deviceId]);
            if (!device.rows[0]) return { error: 'not_found' as const };
            if (!device.rows[0].is_active) return { error: 'inactive' as const };

            await client.query(
                `UPDATE kiosk_provisioning_codes
                 SET used_at = COALESCE(used_at, NOW())
                 WHERE device_id = $1 AND used_at IS NULL`,
                [deviceId],
            );
            const createdCode = await client.query(
                `INSERT INTO kiosk_provisioning_codes (device_id, code_hash, expires_at, created_by)
                 VALUES ($1, $2, NOW() + INTERVAL '15 minutes', $3)
                 RETURNING expires_at`,
                [deviceId, codeHash, req.user?.id ?? null],
            );
            return { expiresAt: createdCode.rows[0].expires_at as Date };
        });

        if ('error' in result && result.error === 'not_found') return sendError(res, 'Device not found', 404);
        if ('error' in result && result.error === 'inactive') return sendError(res, 'Activate this device before kiosk provisioning', 409);
        return sendSuccess(res, {
            provisioning_code: provisioningCode,
            expires_at: result.expiresAt,
            expires_in_seconds: 900,
        }, 'One-time kiosk provisioning code created');
    } catch (error) {
        console.error('Kiosk provisioning code creation failed:', error);
        return sendError(res, 'Failed to create kiosk provisioning code', 500);
    }
});

router.post('/admin/devices/:id/logout-all', async (req: Request, res: Response) => {

    const { id } = req.params;

    try {
        console.log(`[Admin] Force logout all for device: ${id}`);

        // Clear server-side sessions
        await db.query('DELETE FROM device_sessions WHERE device_id = $1', [id]);
        await db.query('UPDATE kiosk_credentials SET revoked_at = NOW(), updated_at = NOW() WHERE device_id = $1', [id]);
        await db.query(
            `UPDATE kiosk_provisioning_codes SET used_at = COALESCE(used_at, NOW())
             WHERE device_id = $1 AND used_at IS NULL`,
            [id],
        );

        const io = getIO();
        io?.to(`device:${id}`).emit('force_logout');
        io?.sockets.sockets.forEach((socket) => {
            if (socket.data.role === 'kiosk' && socket.data.deviceId === id) socket.disconnect(true);
        });
        return sendSuccess(res, null, 'Force logout signal sent and sessions cleared');
    } catch (error) {
        console.error('Logout all error:', error);
        return sendError(res, 'Failed to trigger logout all', 500);
    }
});

// --- User Endpoints ---

// Connect to device via QR code
router.post('/connect', optionalAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const isAdmin = authReq.user?.role === ROLES.ADMIN;

    try {
        const { device_code, password } = req.body;
        const deviceRes = await db.query(
            'SELECT * FROM devices WHERE device_code = $1 AND is_active = true',
            [device_code]
        );

        const device = deviceRes.rows[0];

        if (!device) {
            return sendError(res, 'Device not found', 404);
        }

        const queue = await getQueueForDevice(device.id, authReq.user?.id);
        console.log('Connect Response for', device_code, ':', JSON.stringify(queue.now_playing?.title));

        // Create session
        if (authReq.user?.id) {
            await db.query(
                `INSERT INTO device_sessions (user_id, device_id) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id, device_id) DO NOTHING`,
                [authReq.user.id, device.id]
            );
        }

        return sendSuccess(res, { device, queue }, 'Connected to device');
    } catch (error) {
        return sendError(res, 'Connection failed', 500);
    }
});

// Disconnect from device (delete session, require password on reconnect)
router.post('/disconnect', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { device_id } = req.body;

    if (!device_id) return sendError(res, 'Device ID required', 400);
    if (!authReq.user?.id) return sendError(res, 'Unauthorized', 401);

    try {
        await db.query(
            'DELETE FROM device_sessions WHERE user_id = $1 AND device_id = $2',
            [authReq.user.id, device_id]
        );
        console.log(`[SESSION] User ${authReq.user.id} disconnected from device ${device_id}`);
        return sendSuccess(res, null, 'Disconnected from device');
    } catch (error) {
        console.error('Disconnect error:', error);
        return sendError(res, 'Failed to disconnect', 500);
    }
});

// Get active devices for selection (public)
router.get('/devices', async (req: Request, res: Response) => {
    try {
        const devices = await db.query(
            'SELECT id, device_code, name, location FROM devices WHERE is_active = true ORDER BY name'
        );
        return sendSuccess(res, { devices: devices.rows }, 'Devices fetched');
    } catch (error) {
        console.error('Fetch devices error:', error);
        return sendError(res, 'Failed to fetch devices', 500);
    }
});

// Get song catalog (Spotify-backed search with content filtering)
router.get('/songs', async (req: Request, res: Response) => {
    const { search, page = 1 } = req.query;
    const limit = 20;
    const offset = (Number(page) - 1) * limit;

    try {
        if (search && String(search).trim()) {
            const searchTerm = String(search).trim();
            const localSongs = await db.query(
                `SELECT id, source_type, visibility, asset_role, spotify_uri, spotify_id, title, artist, artist_id,
                        album, cover_url, duration_ms, duration_seconds, is_explicit, is_blocked, file_url,
                        play_count, is_active
                 FROM songs
                 WHERE source_type = 'local'
                   AND visibility = 'public'
                   AND COALESCE(is_active, true) = true
                   AND COALESCE(is_blocked, false) = false
                   AND (title ILIKE $1 OR artist ILIKE $1)
                 ORDER BY play_count DESC, title ASC
                 LIMIT $2 OFFSET $3`,
                [`%${searchTerm}%`, limit, offset]
            );

            let filteredSpotifyTracks: ContentFilterTrack[] = [];
            try {
                const searchResult = await spotifyService.searchTracks(searchTerm, 'TR', limit);
                const contentFilterTracks = searchResult.tracks.map(toContentFilterTrack);
                const filterService = createDefaultFilterService();
                filteredSpotifyTracks = await filterService.filterTracks(contentFilterTracks);
            } catch (spotifyError) {
                console.error('Spotify search fallback error:', spotifyError);
            }

            return sendSuccess(res, {
                items: mergeSongCatalogSearchResults({
                    spotifyTracks: filteredSpotifyTracks,
                    localSongs: localSongs.rows,
                }),
            });
        } else {
            const result = await db.query(
                `SELECT id, source_type, visibility, asset_role, spotify_uri, spotify_id, title, artist, artist_id,
                        album, cover_url, duration_ms, duration_seconds, is_explicit, is_blocked, file_url,
                        play_count, is_active
                 FROM songs
                 WHERE visibility = 'public'
                   AND COALESCE(is_blocked, false) = false
                   AND (
                        source_type = 'spotify'
                        OR (source_type = 'local' AND COALESCE(is_active, true) = true)
                   )
                 ORDER BY play_count DESC, title ASC
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
            return sendSuccess(res, {
                items: result.rows.map((song: StoredCatalogSongRow) => toStoredCatalogSongSearchItem(song)),
            });
        }
    } catch (error) {
        console.error('Song search error:', error);
        return sendError(res, 'Search failed', 500);
    }
});

// Add song to queue
router.post('/queue', authMiddleware, writeRateLimit, checkDeviceSession, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const parsedBody = queueAddBodySchema.safeParse(req.body);
    if (!parsedBody.success) return sendError(res, 'Invalid queue request', 400, 'INVALID_QUEUE_REQUEST');
    const { device_id, song_id, spotify_uri } = parsedBody.data;
    const userId = authReq.user?.id;
    const guestFingerprint = readGuestQueueFingerprint(req);

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required to add songs' });
    }

    try {
        // Check user and role
        const userResult = await db.query('SELECT role, total_songs_added, is_guest FROM users WHERE id = $1', [userId]);
        const dbUser = userResult.rows[0];

        if (!dbUser) return sendError(res, 'User not found', 404);

        let queueSelection;
        try {
            queueSelection = await resolveQueueSongSelection({
                request: { song_id, spotify_uri },
                requesterRole: dbUser.role,
                loadSongById: async (targetSongId) => {
                    const result = await db.query(
                        'SELECT id, source_type, visibility, asset_role FROM songs WHERE id = $1',
                        [targetSongId]
                    );
                    return result.rows[0] ?? null;
                },
                resolveSpotifyTrackByUri: (spotifyTrackUri) => spotifyService.getTrackByUri(spotifyTrackUri),
                upsertSpotifyTrack,
                validateTrack: async (track) => {
                    const filterService = createDefaultFilterService();
                    const results = await filterService.filterTracksDetailed([track]);
                    return results[0] || { allowed: true };
                },
            });
        } catch (selectionError: any) {
            if (selectionError.message === 'Song not found') {
                return sendError(res, 'Song not found', 404);
            }

            if (selectionError.message === 'Hidden local assets cannot be queued by non-admin users') {
                return sendError(res, selectionError.message, 403);
            }

            if (selectionError.message === 'A song_id or spotify_uri is required') {
                return sendError(res, selectionError.message, 400);
            }

            if (
                selectionError.message &&
                (selectionError.message.includes('uygunsuz') ||
                 selectionError.message.includes('küfürlü') ||
                 selectionError.message.includes('explicit') ||
                 selectionError.message.includes('popülaritesi') ||
                 selectionError.message.includes('blocklist') ||
                 selectionError.message.includes('engellendi'))
            ) {
                return sendError(res, selectionError.message, 403, selectionError.message);
            }

            throw selectionError;
        }

        const priorityScore = getQueueInsertPriorityScore();
        let result;
        try {
            result = await db.transaction(async (client) => {
                const lockKeys = [`queue-user:${device_id}:${userId}`, `queue-song:${device_id}:${queueSelection.songId}`];
                if (dbUser.is_guest && guestFingerprint) lockKeys.push(`guest-limit:${guestFingerprint.trim()}:${getIstanbulDayKey()}`);
                for (const key of lockKeys.sort()) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

                if (dbUser.role === ROLES.USER) {
                    const activeUserSongs = await client.query(
                        "SELECT COUNT(id) FROM queue_items WHERE device_id = $1 AND added_by = $2 AND status = 'pending'",
                        [device_id, userId],
                    );
                    if (Number.parseInt(activeUserSongs.rows[0]?.count ?? '0', 10) >= 5) return { error: 'user_limit' as const };
                }

                await enforceGuestDailySongLimit({ dbClient: client, isGuest: dbUser.is_guest, guestFingerprint });
                const existing = await client.query(
                    "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending'",
                    [device_id, queueSelection.songId],
                );
                if (existing.rows.length > 0 && dbUser.role !== ROLES.ADMIN) return { error: 'duplicate' as const };

                const recentlyPlayed = await client.query(
                    `SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'played'
                     AND played_at > NOW() - INTERVAL '15 minutes'`,
                    [device_id, queueSelection.songId],
                );
                if (recentlyPlayed.rows.length > 0 && dbUser.role !== ROLES.ADMIN) return { error: 'recently_played' as const };

                const inserted = await client.query(
                    `INSERT INTO queue_items (device_id, song_id, added_by, priority_score, status, queue_reason)
                     VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
                    [device_id, queueSelection.songId, userId, priorityScore, queueSelection.queueReason],
                );
                await applyQueueAddStats({ dbClient: client, userId, isGuest: dbUser.is_guest, guestFingerprint });
                return { item: inserted.rows[0] };
            });
        } catch (limitError: any) {
            if (limitError.message === 'Guest fingerprint required') return sendError(res, 'Guest fingerprint required', 400, 'GUEST_FINGERPRINT_REQUIRED');
            if (limitError.message === 'Guest daily song limit reached') return sendError(res, 'Guest daily song limit reached', 403, 'GUEST_LIMIT_REACHED');
            throw limitError;
        }

        if ('error' in result) {
            if (result.error === 'user_limit') return sendError(res, 'Queue limit reached (5 songs)', 403, 'USER_QUEUE_LIMIT_REACHED');
            if (result.error === 'duplicate') return sendError(res, 'Song is already in queue', 400);
            return sendError(res, 'Song played recently', 400, 'SONG_PLAYED_RECENTLY');
        }
        const queueItem = result.item;

        let autoStarted = false;
        if (queueSelection.sourceType === 'spotify') {
            const [deviceStateResult, pendingCountResult, songSourceResult, activePlayingResult] = await Promise.all([
                db.query(
                    `SELECT current_song_id, spotify_playback_device_id, spotify_player_is_active
                     FROM devices
                     WHERE id = $1`,
                    [device_id]
                ),
                db.query(
                    "SELECT COUNT(id) AS pending_count FROM queue_items WHERE device_id = $1 AND status = 'pending'",
                    [device_id]
                ),
                db.query(
                    'SELECT source_type, spotify_uri FROM songs WHERE id = $1',
                    [queueSelection.songId]
                ),
                db.query(
                    "SELECT id FROM queue_items WHERE device_id = $1 AND status = 'playing'",
                    [device_id]
                ),
            ]);

            const deviceState = deviceStateResult.rows[0] ?? null;
            const pendingCount = Number.parseInt(pendingCountResult.rows[0]?.pending_count ?? '0', 10);
            const songSource = songSourceResult.rows[0] ?? null;
            const hasActivePlaying = activePlayingResult.rows.length > 0 || Boolean(deviceState?.current_song_id);

            if (!hasActivePlaying && shouldImmediatelyStartSpotifyQueueItem({
                song: {
                    source_type: songSource?.source_type ?? 'spotify',
                    spotify_uri: songSource?.spotify_uri ?? null,
                },
                currentSongId: deviceState?.current_song_id ?? null,
                pendingCount,
                playbackTarget: deviceState,
            })) {
                try {
                    await dispatchSpotifyPlaybackForSong({
                        deviceId: device_id,
                        song: {
                            source_type: 'spotify',
                            spotify_uri: songSource?.spotify_uri ?? null,
                        },
                    });

                    await db.query("UPDATE queue_items SET status = 'playing' WHERE id = $1", [queueItem.id]);
                    await recordAutoplayPlaybackStart({ queueItemId: queueItem.id });
                    await db.query(
                        'UPDATE devices SET current_song_id = $2, last_heartbeat = NOW() WHERE id = $1',
                        [device_id, queueSelection.songId]
                    );
                    autoStarted = true;
                } catch (dispatchError) {
                    console.warn('[Spotify Queue Autostart] Deferred to kiosk client:', dispatchError);
                }
            }
        }

        // Broadcast to all connected clients
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(
            res,
            {
                ...queueItem,
                status: autoStarted ? 'playing' : queueItem.status,
                auto_started: autoStarted,
            },
            'Song added to queue',
            null,
            201
        );
    } catch (error) {
        console.error(error);
        return sendError(res, 'Failed to add song', 500);
    }
});

// Vote on queue item or active song
router.post('/vote', authMiddleware, writeRateLimit, checkDeviceSession, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const parsedBody = queueVoteBodySchema.safeParse(req.body);
    if (!parsedBody.success) return sendError(res, 'Invalid vote request', 400, 'INVALID_VOTE_REQUEST');
    const { queue_item_id, song_id, vote } = parsedBody.data;
    const userId = authReq.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required to vote' });

    try {
        const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        const dbUser = userRes.rows[0];
        if (!dbUser) return sendError(res, 'User not found', 404);

        const isSuper = parsedBody.data.is_super === true;
        const supervoteAvailability = canUseDailySupervote({ isGuest: dbUser.is_guest, lastSuperVoteAt: dbUser.last_super_vote_at });
        if (isSuper && !supervoteAvailability.allowed) {
            if (supervoteAvailability.reason === 'guest') return sendError(res, 'Supervote requires a registered account', 403);
            return sendError(res, 'Daily supervote already used', 403, 'SUPER_VOTE_COOLDOWN');
        }

        const targetQueueId = typeof queue_item_id === 'string' ? queue_item_id : '';
        const voteResult = await db.transaction(async (client) => {
            const claimSupervote = async () => {
                if (!isSuper) return true;
                const claimed = await client.query(
                    `UPDATE users SET last_super_vote_at = NOW()
                     WHERE id = $1 AND is_guest = false
                       AND (last_super_vote_at IS NULL OR
                         (last_super_vote_at AT TIME ZONE 'Europe/Istanbul')::date < (NOW() AT TIME ZONE 'Europe/Istanbul')::date)
                     RETURNING id`,
                    [userId],
                );
                return claimed.rows.length > 0;
            };

            if (!targetQueueId && typeof song_id === 'string' && song_id) {
                const song = await client.query('SELECT id FROM songs WHERE id = $1 FOR UPDATE', [song_id]);
                if (!song.rows.length) return { error: 'song_missing' as const };
                if (!await claimSupervote()) return { error: 'supervote_used' as const };
                const kind = resolveFinalQueueVoteKind({ previousVote: 0, requestedVote: vote, isSuper });
                const update = buildQueueVoteScoreUpdate({ previousVote: 0, nextVote: kind });
                await client.query('UPDATE songs SET score = score + $1 WHERE id = $2', [update.songDelta, song_id]);
                return { kind: 'direct' as const, songDelta: update.songDelta };
            }
            if (!targetQueueId) return { error: 'target_missing' as const };

            const queueResult = await client.query('SELECT * FROM queue_items WHERE id = $1 FOR UPDATE', [targetQueueId]);
            const queueItem = queueResult.rows[0];
            if (!queueItem) return { error: 'item_missing' as const };

            const existing = await client.query('SELECT vote_type FROM votes WHERE queue_item_id = $1 AND user_id = $2 FOR UPDATE', [targetQueueId, userId]);
            const oldVote = existing.rows[0]?.vote_type ?? 0;
            if (!await claimSupervote()) return { error: 'supervote_used' as const };
            const kind = resolveFinalQueueVoteKind({ previousVote: oldVote, requestedVote: vote, isSuper });
            const update = buildQueueVoteScoreUpdate({ previousVote: oldVote, nextVote: kind });
            if (kind === 'none') {
                await client.query('DELETE FROM votes WHERE queue_item_id = $1 AND user_id = $2', [targetQueueId, userId]);
            } else {
                await client.query(
                    `INSERT INTO votes (queue_item_id, user_id, vote_type) VALUES ($1, $2, $3)
                     ON CONFLICT (queue_item_id, user_id) DO UPDATE SET vote_type = EXCLUDED.vote_type`,
                    [targetQueueId, userId, update.storedVoteValue],
                );
            }

            const totals = await client.query(
                `SELECT COALESCE(SUM(CASE WHEN vote_type > 0 THEN vote_type ELSE 0 END), 0) AS upvotes,
                        COALESCE(SUM(CASE WHEN vote_type < 0 THEN ABS(vote_type) ELSE 0 END), 0) AS downvotes
                 FROM votes WHERE queue_item_id = $1`,
                [targetQueueId],
            );
            const upvotes = Number(totals.rows[0]?.upvotes ?? 0);
            const downvotes = Number(totals.rows[0]?.downvotes ?? 0);
            const score = upvotes - downvotes;
            await client.query('UPDATE songs SET score = score + $1 WHERE id = $2', [update.songDelta, queueItem.song_id]);
            await applyRequesterVoteRankDelta({ dbClient: client, requesterId: queueItem.added_by, requesterRankDelta: update.requesterRankDelta });

            const skipDecision = buildQueueVoteSkipDecision({ status: queueItem.status, songScore: score });
            if (skipDecision) {
                await client.query(
                    `UPDATE queue_items SET status = 'skipped', priority_score = $1, upvotes = $2, downvotes = $3 WHERE id = $4`,
                    [score, upvotes, downvotes, targetQueueId],
                );
                if (skipDecision.clearCurrentSong) await client.query('UPDATE devices SET current_song_id = NULL WHERE id = $1', [queueItem.device_id]);
            } else {
                await client.query('UPDATE queue_items SET priority_score = $1, upvotes = $2, downvotes = $3 WHERE id = $4', [score, upvotes, downvotes, targetQueueId]);
            }
            return { kind: 'queue' as const, deviceId: queueItem.device_id, upvotes, downvotes, score, update, skipDecision };
        });

        if ('error' in voteResult) {
            if (voteResult.error === 'supervote_used') return sendError(res, 'Daily supervote already used', 403, 'SUPER_VOTE_COOLDOWN');
            if (voteResult.error === 'song_missing' || voteResult.error === 'item_missing') return sendError(res, 'Item not found', 404);
            return sendError(res, 'A song or queue item is required', 400);
        }
        if (voteResult.kind === 'direct') {
            return sendSuccess(res, { score_updated: true, song_score_delta: voteResult.songDelta }, 'Vote cast on song');
        }

        const io = getIO();
        if (voteResult.skipDecision?.emitSongRejected) io?.to(`device:${voteResult.deviceId}`).emit('song_rejected');
        if (voteResult.skipDecision?.emitSongSkipped) io?.to(`device:${voteResult.deviceId}`).emit('song_skipped');
        io?.to(`device:${voteResult.deviceId}`).emit('queue_updated', await getQueueForDevice(voteResult.deviceId));
        if (voteResult.skipDecision) {
            return sendSuccess(res, {
                skipped: true,
                upvotes: voteResult.upvotes,
                downvotes: voteResult.downvotes,
                song_score: voteResult.score,
                user_vote: voteResult.update.storedVoteValue,
            }, 'Song skipped by score threshold');
        }
        return sendSuccess(res, {
            upvotes: voteResult.upvotes,
            downvotes: voteResult.downvotes,
            song_score: voteResult.score,
            user_vote: voteResult.update.storedVoteValue,
        }, 'Vote cast successfully');
    } catch (error) {
        console.error('Vote error:', error);
        return sendError(res, 'Vote failed', 500);
    }
});
// Get queue for device
router.get('/queue/:deviceId', optionalAuth, async (req: Request, res: Response) => {
    try {
        const { deviceId } = req.params;
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!deviceId || !UUID_REGEX.test(deviceId)) {
            return sendError(res, 'Invalid device ID format', 400);
        }

        const authReq = req as AuthRequest;
        const queue = await getQueueForDevice(deviceId, authReq.user?.id);
        res.json(queue);
    } catch (error) {
        console.error('[Jukebox] Failed to get queue for device:', error);
        return sendError(res, 'Failed to retrieve queue', 500);
    }
});

// --- Admin Endpoints ---



// Force Skip Song
router.post('/admin/skip', async (req: Request, res: Response) => {

    const { device_id } = req.body;
    if (!device_id) return sendError(res, 'Missing device_id', 400);

    try {
        console.log('Admin force skip triggered for device:', device_id);

        // Find current playing
        const current = await db.query("SELECT id FROM queue_items WHERE device_id = $1 AND status = 'playing'", [device_id]);

        if (current.rows.length > 0) {
            console.log('Marking queue item as skipped:', current.rows[0].id);
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [current.rows[0].id]);
        }

        // ALWAYS clear the device's current_song_id
        await db.query("UPDATE devices SET current_song_id = NULL WHERE id = $1", [device_id]);

        const updatedQueue = await getQueueForDevice(device_id);

        const io = getIO();
        if (io) {
            io.to(`device:${device_id}`).emit('song_skipped');
            io.to(`device:${device_id}`).emit('queue_updated', updatedQueue);
        }

        return sendSuccess(res, null, 'Song skipped by admin');
    } catch (error) {
        console.error('Admin skip error detail:', error);
        return sendError(res, 'Skip failed', 500);
    }
});

// Sync Song Metadata
router.post('/admin/sync-metadata', async (req: Request, res: Response) => {

    const { song_id } = req.body;

    try {
        if (song_id) {
            const updated = await MetadataService.syncSongMetadata(song_id);
            if (!updated) return sendError(res, 'Song not found or no metadata found', 404);
            return sendSuccess(res, updated, 'Metadata synced successfully');
        } else {
            const stats = await MetadataService.syncAllSongs();
            return sendSuccess(res, stats, 'Full library sync initiated');
        }
    } catch (error) {
        console.error('Metadata sync error:', error);
        return sendError(res, 'Metadata sync failed', 500);
    }
});

// Get all songs for admin
router.get('/admin/songs', async (req: Request, res: Response) => {

    try {
        const songs = await db.query(`
            SELECT s.id, s.source_type, s.visibility, s.asset_role, s.file_url, s.is_active,
                   s.spotify_uri, s.spotify_id, s.title, s.artist, s.artist_id,
                   s.album, s.cover_url, s.duration_ms, s.is_explicit, s.is_blocked,
                   s.play_count, s.score, s.last_played_at, s.created_at,
                   (SELECT COUNT(*) FROM queue_items WHERE song_id = s.id AND status = 'played') as total_plays
            FROM songs s
            ORDER BY s.created_at DESC
        `);
        return sendSuccess(res, { songs: songs.rows }, 'Songs fetched');
    } catch (error) {
        console.error('Fetch songs error:', error);
        return sendError(res, 'Failed to fetch songs', 500);
    }
});

router.patch('/admin/songs/:id/classification', async (req: Request, res: Response) => {

    try {
        const input = normalizeAdminSongClassificationInput(req.body ?? {});
        const songResult = await db.query(
            'SELECT id, source_type, visibility, asset_role FROM songs WHERE id = $1',
            [req.params.id]
        );

        if (songResult.rows.length === 0) {
            return sendError(res, 'Song not found', 404);
        }

        const existingSong = songResult.rows[0];
        if (existingSong.source_type !== 'local') {
            return sendError(res, 'Only local songs can be reclassified for hidden assets', 400);
        }

        const nextVisibility = input.visibility ?? (existingSong.visibility === 'hidden' ? 'hidden' : 'public');
        const nextAssetRole = input.assetRole ?? (
            existingSong.asset_role === 'jingle' || existingSong.asset_role === 'ad' ? existingSong.asset_role : 'music'
        );

        normalizeAdminSongClassificationInput({
            visibility: nextVisibility,
            asset_role: nextAssetRole,
        });

        const updatedSong = await db.query(
            `UPDATE songs
             SET visibility = $2,
                 asset_role = $3
             WHERE id = $1
             RETURNING id, source_type, visibility, asset_role, file_url, is_active`,
            [req.params.id, nextVisibility, nextAssetRole]
        );

        return sendSuccess(res, { song: updatedSong.rows[0] }, 'Song classification updated');
    } catch (error) {
        console.error('Update song classification error:', error);
        return sendError(res, error instanceof Error ? error.message : 'Classification update failed', 400);
    }
});

// Scan uploads folder for new songs
router.post('/admin/scan-folder', async (req: Request, res: Response) => {

    const uploadsPath = path.join(__dirname, '../../uploads/songs');

    try {
        if (!fs.existsSync(uploadsPath)) {
            fs.mkdirSync(uploadsPath, { recursive: true });
        }

        const files = fs.readdirSync(uploadsPath, { withFileTypes: true })
            .filter((entry) => entry.isFile() && shouldScanFolderProcessFile(entry.name))
            .map((entry) => entry.name);

        let added = 0;
        let skipped = 0;

        for (const file of files) {
            const result = await processScanFolderSongFile({
                file,
                uploadsPath,
            });

            if (result.action === 'skipped') {
                skipped++;
            } else {
                added++;
            }
        }

        // Sync metadata for ALL songs in library
        let syncStats: any = { success: 0, failed: 0, failedSongs: [] };
        try {
            syncStats = await MetadataService.syncAllSongs();
        } catch (syncErr) {
            console.log('Full metadata sync failed:', syncErr);
        }

        return sendSuccess(res, {
            added,
            skipped,
            total: files.length,
            synced: syncStats.success,
            syncFailed: syncStats.failed,
            failedSongs: syncStats.failedSongs
        }, 'Folder scanned and all metadata synced');
    } catch (error) {
        console.error('Folder scan error:', error);
        return sendError(res, 'Folder scan failed', 500);
    }
});

// Upload song file
router.post('/admin/upload-song', songUpload.single('song'), validateSongUpload, async (req: Request, res: Response) => {

    const file = req.file;
    if (!file) {
        return sendError(res, 'No file uploaded', 400);
    }

    try {
        const result = await finalizeUploadedSongUpload({
            file: {
                filename: file.filename,
                originalname: file.originalname,
                path: file.path,
            },
        });

        if (result.status === 'duplicate') {
            return sendError(res, 'Song file already exists', 409);
        }

        if (result.status === 'reactivated') {
            return sendSuccess(res, { song: result.song, filename: result.filename }, 'Song reactivated');
        }

        return sendSuccess(res, { song: result.song, filename: result.filename }, 'Song uploaded');
    } catch (error) {
        console.error('Upload song error:', error);
        return sendError(res, 'Upload failed', 500);
    }
});

// Block/unblock song (Spotify-backed catalog - no file deletion needed)
router.delete('/admin/songs/:id', async (req: Request, res: Response) => {

    const { id } = req.params;

    try {
        const songRes = await db.query('SELECT id FROM songs WHERE id = $1', [id]);
        if (songRes.rows.length === 0) {
            return sendError(res, 'Song not found', 404);
        }

        // Mark as blocked in DB (keeping for queue history)
        await db.query('UPDATE songs SET is_blocked = true WHERE id = $1', [id]);

        return sendSuccess(res, null, 'Song blocked');
    } catch (error) {
        console.error('Block song error:', error);
        return sendError(res, 'Block failed', 500);
    }
});

// --- Device Management ---

// Get all devices
router.get('/admin/devices', async (req: Request, res: Response) => {

    try {
        const devices = await db.query(`
            SELECT d.id, d.device_code, d.name, d.location, d.is_active, d.current_song_id,
                   d.last_heartbeat, d.created_at, d.override_autoplay_spotify_playlist_uri,
                   d.override_enabled,
                   (SELECT COUNT(*) FROM queue_items WHERE device_id = d.id AND status = 'pending') as queue_count,
                   s.title as current_song_title, s.artist as current_song_artist
            FROM devices d
            LEFT JOIN songs s ON d.current_song_id = s.id
            ORDER BY d.created_at DESC
        `);
        return sendSuccess(res, { devices: devices.rows }, 'Devices fetched');
    } catch (error) {
        console.error('Fetch devices error:', error);
        return sendError(res, 'Failed to fetch devices', 500);
    }
});

// Create new device
router.post('/admin/devices', async (req: Request, res: Response) => {

    const { device_code, name, location, password } = req.body;

    if (typeof device_code !== 'string' || !device_code.trim() || !name
        || typeof password !== 'string' || !password.trim() || password.trim().length > 50) {
        return sendError(res, 'device_code, name, and password are required', 400);
    }

    try {
        const existing = await db.query('SELECT id FROM devices WHERE device_code = $1', [device_code]);
        if (existing.rows.length > 0) {
            return sendError(res, 'Device code already exists', 409);
        }

        let normalizedDevice;
        try {
            normalizedDevice = prepareNormalizedDeviceAdminInput('create', { name, location });
        } catch (validationError: any) {
            return sendError(res, validationError.message || 'Invalid device name', 400);
        }

        const result = await db.query(
            `INSERT INTO devices (device_code, name, location, password)
             VALUES ($1, $2, $3, $4)
             RETURNING id, device_code, name, location, is_active, current_song_id, last_heartbeat, created_at`,
            [device_code.trim().toUpperCase(), normalizedDevice.name, normalizedDevice.location, password.trim()]
        );
        return sendSuccess(res, { device: result.rows[0] }, 'Device created');
    } catch (error) {
        console.error('Create device error:', error);
        return sendError(res, 'Failed to create device', 500);
    }
});



// Update device
router.put('/admin/devices/:id', async (req: Request, res: Response) => {

    const { id } = req.params;
    const {
        name,
        location,
        is_active,
        password,
        override_autoplay_spotify_playlist_uri,
        fallback_playlist_url,
        override_enabled
    } = req.body;
    const nextPassword = typeof password === 'string' && password.trim() ? password.trim() : null;

    try {
        let normalizedDevice;
        try {
            normalizedDevice = prepareNormalizedDeviceAdminInput('update', { name, location });
        } catch (validationError: any) {
            return sendError(res, validationError.message || 'Invalid device name', 400);
        }

        const rawPlaylistInput = override_autoplay_spotify_playlist_uri !== undefined
            ? override_autoplay_spotify_playlist_uri
            : fallback_playlist_url;

        let normalizedPlaylistUri = undefined;
        if (rawPlaylistInput !== undefined) {
            if (!rawPlaylistInput || (typeof rawPlaylistInput === 'string' && rawPlaylistInput.trim() === '')) {
                normalizedPlaylistUri = null;
            } else {
                const playlistId = parseSpotifyPlaylistId(String(rawPlaylistInput));
                normalizedPlaylistUri = playlistId ? `spotify:playlist:${playlistId}` : String(rawPlaylistInput).trim();
            }
        }

        const result = await db.query(
            `UPDATE devices SET 
                name = COALESCE($1, name),
                location = COALESCE($2, location),
                is_active = COALESCE($3, is_active),
                password = COALESCE($4, password),
                override_autoplay_spotify_playlist_uri = CASE WHEN $5::boolean THEN $6 ELSE override_autoplay_spotify_playlist_uri END,
                override_enabled = CASE WHEN $7::boolean THEN $8 ELSE override_enabled END
             WHERE id = $9
             RETURNING id, device_code, name, location, is_active, current_song_id, last_heartbeat, created_at,
                       override_autoplay_spotify_playlist_uri, override_enabled`,
            [
                normalizedDevice.name,
                normalizedDevice.location,
                is_active,
                nextPassword,
                normalizedPlaylistUri !== undefined,
                normalizedPlaylistUri ?? null,
                override_enabled !== undefined,
                override_enabled !== undefined ? Boolean(override_enabled) : false,
                id
            ]
        );

        if (result.rows.length === 0) {
            return sendError(res, 'Device not found', 404);
        }

        if (normalizedPlaylistUri !== undefined || override_enabled !== undefined) {
            try {
                if (result.rows[0].override_enabled && result.rows[0].override_autoplay_spotify_playlist_uri) {
                    await db.query(
                        "DELETE FROM queue_items WHERE device_id = $1 AND status = 'pending' AND queue_reason = 'autoplay'",
                        [id]
                    );
                    await enqueueAutoplayForDevice({ deviceId: id });
                }
                getIO()?.to(`device:${id}`).emit('queue_updated', await getQueueForDevice(id));
            } catch (queueErr) {
                console.warn('[Jukebox] Failed to auto-populate queue after device playlist update:', queueErr);
            }
        }

        return sendSuccess(res, { device: result.rows[0] }, 'Device updated');
    } catch (error) {
        console.error('Update device error:', error);
        return sendError(res, 'Failed to update device', 500);
    }
});

// Get all available Spotify Connect playback devices
router.get('/admin/spotify-devices', async (req: Request, res: Response) => {

    try {
        const kioskDeviceId = typeof req.query?.kiosk_device_id === 'string' ? req.query.kiosk_device_id.trim() : null;
        let accessTokenOverride: string | undefined = undefined;
        if (kioskDeviceId) {
            try {
                const token = await spotifyService.getKioskPlaybackToken(kioskDeviceId);
                accessTokenOverride = token.accessToken;
            } catch {
                // fallback
            }
        }
        const devices = await spotifyService.getAvailableDevices(accessTokenOverride);
        return sendSuccess(res, { devices }, 'Active Spotify devices fetched');
    } catch (error: any) {
        console.error('Fetch spotify devices error:', error);
        return sendSuccess(res, { devices: [] }, 'Failed to fetch spotify devices');
    }
});

// Update kiosk Spotify playback target device
router.put('/admin/devices/:id/spotify-playback-target', async (req: Request, res: Response) => {

    const { id } = req.params;
    const { spotify_playback_device_id, spotify_player_name } = req.body;

    try {
        const trimmedDeviceId = typeof spotify_playback_device_id === 'string' ? spotify_playback_device_id.trim() : null;
        const trimmedPlayerName = typeof spotify_player_name === 'string' ? spotify_player_name.trim() : null;

        let result;
        if (trimmedDeviceId) {
            result = await db.query(
                `UPDATE devices
                 SET spotify_playback_device_id = $2,
                     spotify_player_name = $3,
                     spotify_player_is_active = true,
                     spotify_player_connected_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [id, trimmedDeviceId, trimmedPlayerName || 'Spotify Connect Player']
            );
        } else {
            result = await db.query(
                `UPDATE devices
                 SET spotify_playback_device_id = NULL,
                     spotify_player_name = NULL,
                     spotify_player_is_active = false,
                     spotify_player_connected_at = NULL
                 WHERE id = $1
                 RETURNING *`,
                [id]
            );
        }

        if (result.rows.length === 0) {
            return sendError(res, 'Device not found', 404);
        }

        try {
            getIO()?.to(`device:${id}`).emit('queue_updated', await getQueueForDevice(id));
        } catch (socketErr) {
            console.warn('[Jukebox] Failed to emit queue_updated after target device update:', socketErr);
        }

        return sendSuccess(res, { device: result.rows[0] }, 'Spotify playback target updated');
    } catch (error) {
        console.error('Update spotify playback target error:', error);
        return sendError(res, 'Failed to update spotify playback target', 500);
    }
});

// Preview Spotify playlist metadata
router.get('/admin/playlist-preview', async (req: Request, res: Response) => {

    const url = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
    if (!url) {
        return sendError(res, 'Playlist URL veya URI gerekli', 400);
    }

    try {
        const details = await spotifyService.getPlaylistDetails(url);
        return sendSuccess(res, details, 'Playlist details fetched');
    } catch (error: any) {
        console.error('Playlist preview error:', error);
        return sendError(res, error.message || 'Playlist bilgileri çekilemedi', 400);
    }
});




// Manually trigger audio processing (e.g. after upload)
router.post('/admin/process-song', async (req: Request, res: Response) => {

    const { song_id } = req.body;

    try {
        if (typeof song_id !== 'string' || !song_id.trim()) {
            return sendError(res, 'song_id is required', 400);
        }

        const song = await db.query('SELECT id, file_url FROM songs WHERE id = $1', [song_id]);
        if (!song.rows[0]) return sendError(res, 'Song not found', 404);

        const uploadsRoot = await fs.promises.realpath(path.resolve(__dirname, '../../uploads/songs'));
        const fileUrl = song.rows[0].file_url;
        const relativeFilename = typeof fileUrl === 'string' && fileUrl.startsWith('/uploads/songs/')
            ? fileUrl.slice('/uploads/songs/'.length)
            : '';
        if (!relativeFilename || /[\\/]/.test(relativeFilename) || relativeFilename === '.' || relativeFilename === '..') {
            return sendError(res, 'Song file path is invalid', 400);
        }

        const candidatePath = path.resolve(uploadsRoot, relativeFilename);
        if (!candidatePath.startsWith(`${uploadsRoot}${path.sep}`)) {
            return sendError(res, 'Song file path is invalid', 400);
        }

        const targetPath = await fs.promises.realpath(candidatePath);
        if (!targetPath.startsWith(`${uploadsRoot}${path.sep}`) || !(await fs.promises.stat(targetPath)).isFile()) {
            return sendError(res, 'Song file not found', 404);
        }

        const processedPath = await AudioService.processTrack(targetPath);
        const resolvedProcessedPath = await fs.promises.realpath(processedPath);
        if (!resolvedProcessedPath.startsWith(`${uploadsRoot}${path.sep}`)) {
            return sendError(res, 'Processed file path is invalid', 500);
        }

        const processedFilename = path.relative(uploadsRoot, resolvedProcessedPath).split(path.sep).join('/');
        const webPath = `/uploads/songs/${processedFilename}`;

        await db.query('UPDATE songs SET file_url = $1 WHERE id = $2', [webPath, song_id]);

        return sendSuccess(res, { new_path: webPath }, 'Audio processed successfully');

    } catch (error: any) {
        console.error(error);
        return sendError(res, 'Processing failed: ' + error.message, 500);
    }
});

// --- Kiosk Endpoints ---

router.post('/kiosk/register', async (req: Request, res: Response) => {
    try {
        const deviceCode = typeof req.body?.device_code === 'string' ? req.body.device_code.trim().toUpperCase() : '';
        const suppliedCredential = typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';
        const provisioningCode = typeof req.body?.provisioning_code === 'string' ? req.body.provisioning_code.trim() : '';
        if (!deviceCode || (!suppliedCredential && !provisioningCode)) {
            return sendError(res, 'device_code and a kiosk credential or provisioning code are required', 400);
        }

        const deviceCheck = await db.query(
            'SELECT id, device_code, name, location, is_active FROM devices WHERE device_code = $1',
            [deviceCode],
        );
        if (deviceCheck.rows.length === 0) {
            return sendError(res, 'Device code invalid', 404);
        }
        const device = deviceCheck.rows[0];
        if (!device.is_active) {
            return sendError(res, 'Device is inactive; an administrator must activate it', 403, 'DEVICE_INACTIVE');
        }

        const credential = suppliedCredential || generateKioskCredential();
        const credentialHash = hashKioskSecret(credential);
        const registration = await db.transaction(async (client) => {
            if (suppliedCredential) {
                const activeCredential = await client.query(
                    `SELECT credential_hash FROM kiosk_credentials
                     WHERE device_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
                     FOR UPDATE`,
                    [device.id],
                );
                if (!kioskSecretMatches(activeCredential.rows[0]?.credential_hash, suppliedCredential)) {
                    return { error: 'invalid_credential' as const };
                }
                await client.query(
                    `UPDATE kiosk_credentials SET expires_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
                     WHERE device_id = $1`,
                    [device.id],
                );
            } else {
                const codeHash = hashKioskSecret(provisioningCode);
                const code = await client.query(
                    `SELECT id FROM kiosk_provisioning_codes
                     WHERE device_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > NOW()
                     FOR UPDATE`,
                    [device.id, codeHash],
                );
                if (!code.rows[0]) return { error: 'invalid_provisioning_code' as const };

                await client.query('UPDATE kiosk_provisioning_codes SET used_at = NOW() WHERE id = $1', [code.rows[0].id]);
                await client.query(
                    `INSERT INTO kiosk_credentials (device_id, credential_hash, expires_at, revoked_at, created_at, updated_at)
                     VALUES ($1, $2, NOW() + INTERVAL '24 hours', NULL, NOW(), NOW())
                     ON CONFLICT (device_id) DO UPDATE
                       SET credential_hash = EXCLUDED.credential_hash,
                           expires_at = EXCLUDED.expires_at,
                           revoked_at = NULL,
                           created_at = NOW(),
                           updated_at = NOW()`,
                    [device.id, credentialHash],
                );
            }

            const updatedDevice = await client.query(
                `UPDATE devices SET last_heartbeat = NOW()
                 WHERE id = $1 AND is_active = true
                 RETURNING id, device_code, name, location, is_active, current_song_id, last_heartbeat, created_at`,
                [device.id],
            );
            return { device: updatedDevice.rows[0] };
        });

        if ('error' in registration) {
            const isCredential = registration.error === 'invalid_credential';
            return sendError(
                res,
                isCredential ? 'Kiosk credential is invalid, expired, or revoked' : 'Provisioning code is invalid, expired, or already used',
                403,
                isCredential ? 'INVALID_CREDENTIAL' : 'INVALID_PROVISIONING_CODE',
            );
        }

        return sendSuccess(res, { device: registration.device, credential }, 'Kiosk registered');
    } catch (error) {
        console.error('Kiosk registration error:', error);
        return sendError(res, 'Kiosk registration failed', 500);
    }
});

router.post('/kiosk/spotify-token', handleSpotifyKioskTokenRequest);

router.post('/kiosk/spotify-device-auth/status', handleSpotifyKioskDeviceAuthStatusRequest);

router.post('/kiosk/spotify-device-auth/start', handleSpotifyKioskDeviceAuthStartRequest);

router.post('/kiosk/spotify-device', handleSpotifyKioskDeviceRegistration);

router.get('/kiosk/playback-state/:deviceId', async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    try {
        const token = await spotifyService.getKioskPlaybackToken(deviceId);
        const snapshot = await spotifyService.getCurrentPlaybackSnapshot(token.accessToken);
        return sendSuccess(res, snapshot, 'Playback state fetched');
    } catch {
        return sendSuccess(res, null, 'No active playback');
    }
});

router.get('/lyrics', async (req: Request, res: Response) => {
    const { title, artist, duration } = req.query;
    if (!title || !artist) {
        return sendError(res, 'title and artist query parameters are required', 400);
    }
    try {
        const lyrics = await fetchLyrics({
            title: String(title),
            artist: String(artist),
            durationSeconds: duration ? Number(duration) : undefined,
        });
        return sendSuccess(res, lyrics, 'Lyrics fetched');
    } catch (error) {
        return sendError(res, 'Failed to fetch lyrics', 500);
    }
});

router.post('/kiosk/now-playing', async (req: Request, res: Response) => {
    const { device_id, song_id } = req.body;

    try {
        const validation = await loadValidatedSpotifyKioskDevice(device_id, readSpotifyKioskDevicePassword(req));
        if (!validation.ok) {
            return sendError(res, validation.error, validation.statusCode);
        }

        // Check if song_id is null (stopped)
        if (!song_id) {
            await db.query('UPDATE devices SET current_song_id = NULL WHERE id = $1', [device_id]);
            // Also mark current playing item as played and award points (+10)
            const prevPlaying = await db.query(
                `SELECT qi.id, qi.added_by, qi.queue_reason, s.asset_role
                 FROM queue_items qi
                 JOIN songs s ON s.id = qi.song_id
                 WHERE qi.device_id = $1 AND qi.status = 'playing'`,
                [device_id]
            );
            if (prevPlaying.rows.length > 0) {
                const previousItem = prevPlaying.rows[0];
                await db.query("UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1", [prevPlaying.rows[0].id]);

                await maybeEnqueueProfileSystemItems({
                    deviceId: device_id,
                    completedNormalMusicItem: isCompletedNormalMusicItem(previousItem),
                });
            }

            // Broadcast the stop event immediately
            getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));
            return res.json({ success: true });
        }

        // Resolve song_id if a queue_item ID was passed
        let resolvedSongId = song_id;
        let queueItemIdToPlay: string | null = null;
        let currentSongResult = await db.query(
            'SELECT id, source_type, spotify_uri FROM songs WHERE id = $1',
            [resolvedSongId]
        );
        if (currentSongResult.rows.length === 0) {
            const queueRow = await db.query('SELECT id, song_id FROM queue_items WHERE id = $1', [song_id]);
            if (queueRow.rows.length > 0) {
                queueItemIdToPlay = queueRow.rows[0].id;
                resolvedSongId = queueRow.rows[0].song_id;
                currentSongResult = await db.query('SELECT id, source_type, spotify_uri FROM songs WHERE id = $1', [resolvedSongId]);
            }
        }

        const currentSong = currentSongResult.rows[0] ?? null;

        if (currentSong?.source_type === 'spotify') {
            try {
                await dispatchSpotifyPlaybackForSong({
                    deviceId: device_id,
                    song: currentSong,
                });
            } catch (dispatchError) {
                console.warn('[Spotify Dispatch] Failed to start kiosk playback:', dispatchError);
                const authSetupMessage = getSpotifyKioskAuthSetupRequiredMessage(dispatchError);
                if (authSetupMessage) {
                    return sendError(res, authSetupMessage, 503);
                }
                const message = dispatchError instanceof Error
                    ? dispatchError.message
                    : 'Failed to start Spotify playback';
                // If no active Spotify device is registered or offline, continue so the jukebox system remains active
                console.warn(`[Spotify Dispatch] Continuing without active playback device for device ${device_id}: ${message}`);
            }
        }

        // Try to find if this song is in the queue
        let queueItem;
        if (queueItemIdToPlay) {
            queueItem = await db.query("SELECT id FROM queue_items WHERE id = $1", [queueItemIdToPlay]);
        } else {
            queueItem = await db.query(
                "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending' ORDER BY priority_score DESC LIMIT 1",
                [device_id, resolvedSongId]
            );
        }

        if (queueItem.rows.length > 0) {
            // Mark previous playing song as played and award points (+10)
            const prevPlaying = await db.query(
                `SELECT qi.id, qi.added_by, qi.queue_reason, s.asset_role
                 FROM queue_items qi
                 JOIN songs s ON s.id = qi.song_id
                 WHERE qi.device_id = $1 AND qi.status = 'playing'`,
                [device_id]
            );
            if (prevPlaying.rows.length > 0) {
                const previousItem = prevPlaying.rows[0];
                await db.query("UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1", [prevPlaying.rows[0].id]);

                await maybeEnqueueProfileSystemItems({
                    deviceId: device_id,
                    completedNormalMusicItem: isCompletedNormalMusicItem(previousItem),
                });
            }

            // Mark new song as playing
            await db.query(
                "UPDATE queue_items SET status = 'playing' WHERE id = $1",
                [queueItem.rows[0].id]
            );
            await recordAutoplayPlaybackStart({ queueItemId: queueItem.rows[0].id });
        }

        // Update device current song state (always, even for autoplay)
        await db.query(
            'UPDATE devices SET current_song_id = $2, last_heartbeat = NOW() WHERE id = $1',
            [device_id, resolvedSongId]
        );

        // Broadcast update to all clients (always trigger so Web UI stays in sync)
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, null, 'Now playing updated');
    } catch (error) {
        console.error(error);
        return sendError(res, 'Update failed', 500);
    }
});

// Trigger Autoplay Pre-emptively (80% rule)
router.post('/autoplay/trigger', async (req: Request, res: Response) => {
    const { device_id } = req.body;

    try {
        const validation = await loadValidatedSpotifyKioskDevice(device_id, readSpotifyKioskDevicePassword(req));
        if (!validation.ok) {
            return sendError(res, validation.error, validation.statusCode);
        }

        // Double check if queue is empty
        const queueCheck = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND status = 'pending'",
            [device_id]
        );

        if (queueCheck.rows.length > 0) {
            return sendError(res, 'Queue not empty', 400);
        }

        const autoplayTrack = await enqueueAutoplayForDevice({ deviceId: device_id });
        if (!autoplayTrack) {
            return sendSuccess(res, { skipped: true }, 'Autoplay skipped');
        }

        // Broadcast
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, { song_title: autoplayTrack.title }, 'Autoplay song added to pending');

    } catch (error) {
        console.error("Autoplay trigger failed:", error);
        return sendError(res, 'Autoplay trigger failed', 500);
    }
});

// ----------------------------------------------
// Content Filtering - Admin Block/Unblock Endpoints
// ----------------------------------------------

// POST /admin/songs/:id/block - block a specific song
router.post('/admin/songs/:id/block', async (req: Request, res: Response) => {

    const { id } = req.params;
    try {
        const result = await db.query(
            'UPDATE songs SET is_blocked = true WHERE id = $1 RETURNING id, title, artist',
            [id]
        );
        if (result.rows.length === 0) {
            return sendError(res, 'Song not found', 404);
        }
        return sendSuccess(res, result.rows[0], 'Song blocked');
    } catch (error) {
        console.error('Block song error:', error);
        return sendError(res, 'Failed to block song', 500);
    }
});

// DELETE /admin/songs/:id/block - unblock a song
router.delete('/admin/songs/:id/block', async (req: Request, res: Response) => {

    const { id } = req.params;
    try {
        const result = await db.query(
            'UPDATE songs SET is_blocked = false WHERE id = $1 RETURNING id, title, artist',
            [id]
        );
        if (result.rows.length === 0) {
            return sendError(res, 'Song not found', 404);
        }
        return sendSuccess(res, result.rows[0], 'Song unblocked');
    } catch (error) {
        console.error('Unblock song error:', error);
        return sendError(res, 'Failed to unblock song', 500);
    }
});

// POST /admin/artists/block - block an artist
router.post('/admin/artists/block', async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;

    const { artist_name, spotify_artist_id, reason } = req.body;
    if (!artist_name) {
        return sendError(res, 'artist_name is required', 400);
    }

    try {
        // Check for duplicate by spotify_artist_id if provided
        if (spotify_artist_id) {
            const existing = await db.query(
                'SELECT id FROM blocked_artists WHERE spotify_artist_id = $1',
                [spotify_artist_id]
            );
            if (existing.rows.length > 0) {
                return sendError(res, 'Artist is already blocked', 409);
            }
        }

        const result = await db.query(
            `INSERT INTO blocked_artists (artist_name, spotify_artist_id, blocked_by, reason)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [artist_name, spotify_artist_id || null, authReq.user!.id, reason || null]
        );
        return sendSuccess(res, result.rows[0], 'Artist blocked', undefined, 201);
    } catch (error) {
        console.error('Block artist error:', error);
        return sendError(res, 'Failed to block artist', 500);
    }
});

// DELETE /admin/artists/:id/block - unblock an artist
router.delete('/admin/artists/:id/block', async (req: Request, res: Response) => {

    const { id } = req.params;
    try {
        const result = await db.query(
            'DELETE FROM blocked_artists WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return sendError(res, 'Blocked artist entry not found', 404);
        }
        return sendSuccess(res, result.rows[0], 'Artist unblocked');
    } catch (error) {
        console.error('Unblock artist error:', error);
        return sendError(res, 'Failed to unblock artist', 500);
    }
});

// GET /admin/blocked - list all blocked songs and artists
router.get('/admin/blocked', async (req: Request, res: Response) => {

    try {
        const blockedSongs = await db.query(
            `SELECT id, title, artist, spotify_id, created_at
             FROM songs WHERE is_blocked = true
             ORDER BY title`
        );
        const blockedArtists = await db.query(
            `SELECT ba.*, u.display_name as blocked_by_name
             FROM blocked_artists ba
             LEFT JOIN users u ON ba.blocked_by = u.id
             ORDER BY ba.artist_name`
        );
        return sendSuccess(res, {
            blocked_songs: blockedSongs.rows,
            blocked_artists: blockedArtists.rows,
        });
    } catch (error) {
        console.error('List blocked error:', error);
        return sendError(res, 'Failed to fetch blocked list', 500);
    }
});

// GET /admin/moderation/settings - get content filter settings
router.get('/admin/moderation/settings', async (req: Request, res: Response) => {

    try {
        const settings = await getContentFilterSettings();
        return sendSuccess(res, settings);
    } catch (error) {
        console.error('Get moderation settings error:', error);
        return sendError(res, 'Failed to get moderation settings', 500);
    }
});

// PUT /admin/moderation/settings - update content filter settings
router.put('/admin/moderation/settings', async (req: Request, res: Response) => {

    const { lyrics_filter_enabled, block_unverified_obscure_tracks, min_popularity_without_lyrics } = req.body;

    try {
        const lyricsEnabled = typeof lyrics_filter_enabled === 'boolean' ? lyrics_filter_enabled : true;
        const blockObscure = typeof block_unverified_obscure_tracks === 'boolean' ? block_unverified_obscure_tracks : true;
        const minPop = typeof min_popularity_without_lyrics === 'number' ? Math.max(0, Math.min(100, min_popularity_without_lyrics)) : 15;

        await db.query(
            `INSERT INTO content_filter_settings (id, lyrics_filter_enabled, block_unverified_obscure_tracks, min_popularity_without_lyrics, updated_at)
             VALUES (1, $1, $2, $3, NOW())
             ON CONFLICT (id) DO UPDATE SET
               lyrics_filter_enabled = EXCLUDED.lyrics_filter_enabled,
               block_unverified_obscure_tracks = EXCLUDED.block_unverified_obscure_tracks,
               min_popularity_without_lyrics = EXCLUDED.min_popularity_without_lyrics,
               updated_at = NOW()`,
            [lyricsEnabled, blockObscure, minPop]
        );

        invalidateContentFilterSettingsCache();

        const updated = await getContentFilterSettings();
        return sendSuccess(res, updated, 'Moderation settings updated');
    } catch (error) {
        console.error('Update moderation settings error:', error);
        return sendError(res, 'Failed to update moderation settings', 500);
    }
});

// GET /admin/moderation/keywords - list custom blocked keywords
router.get('/admin/moderation/keywords', async (req: Request, res: Response) => {

    try {
        const result = await db.query('SELECT * FROM blocked_keywords ORDER BY created_at DESC');
        return sendSuccess(res, result.rows);
    } catch (error) {
        console.error('List blocked keywords error:', error);
        return sendError(res, 'Failed to fetch blocked keywords', 500);
    }
});

// POST /admin/moderation/keywords - add custom blocked keyword
router.post('/admin/moderation/keywords', async (req: Request, res: Response) => {

    const { word, category } = req.body;
    if (!word || typeof word !== 'string' || !word.trim()) {
        return sendError(res, 'Yasaklı kelime boş olamaz', 400);
    }

    try {
        const cleanWord = word.trim().toLowerCase();
        const result = await db.query(
            `INSERT INTO blocked_keywords (word, category)
             VALUES ($1, $2)
             ON CONFLICT (word) DO NOTHING
             RETURNING *`,
            [cleanWord, category || 'profanity']
        );

        invalidateBlockedKeywordsCache();

        if (result.rows.length === 0) {
            return sendError(res, 'Bu kelime zaten yasaklı listede', 409);
        }

        return sendSuccess(res, result.rows[0], 'Yasaklı kelime eklendi', undefined, 201);
    } catch (error) {
        console.error('Add blocked keyword error:', error);
        return sendError(res, 'Failed to add blocked keyword', 500);
    }
});

// DELETE /admin/moderation/keywords/:id - delete custom blocked keyword
router.delete('/admin/moderation/keywords/:id', async (req: Request, res: Response) => {

    const { id } = req.params;
    try {
        const result = await db.query('DELETE FROM blocked_keywords WHERE id = $1 RETURNING *', [id]);
        invalidateBlockedKeywordsCache();

        if (result.rows.length === 0) {
            return sendError(res, 'Yasaklı kelime bulunamadı', 404);
        }

        return sendSuccess(res, result.rows[0], 'Yasaklı kelime silindi');
    } catch (error) {
        console.error('Delete blocked keyword error:', error);
        return sendError(res, 'Failed to delete blocked keyword', 500);
    }
});

// POST /admin/moderation/test - test lyrics or text for profanity
router.post('/admin/moderation/test', async (req: Request, res: Response) => {

    const { text, title, artist } = req.body;

    try {
        let contentToTest = text;
        let fetchedFromLyrics = false;

        if (!contentToTest && title && artist) {
            const lyricsData = await fetchLyrics({ title, artist });
            if (lyricsData?.plainLyrics || (lyricsData?.lines && lyricsData.lines.length > 0)) {
                contentToTest = lyricsData.plainLyrics || lyricsData.lines.map((l: any) => l.text).join('\n');
                fetchedFromLyrics = true;
            } else {
                return sendSuccess(res, {
                    foundLyrics: false,
                    isProfane: false,
                    message: 'İnternette bu şarkının sözü bulunamadı.',
                });
            }
        }

        if (!contentToTest) {
            return sendError(res, 'Test edilecek metin veya şarkı adı/sanatçı gereklidir', 400);
        }

        const customKeywords = await getDbBlockedKeywords();
        const check = checkProfanityText(contentToTest, customKeywords);

        return sendSuccess(res, {
            foundLyrics: fetchedFromLyrics,
            isProfane: check.isProfane,
            matchedWord: check.matchedWord,
            testedTextSnippet: contentToTest.substring(0, 300),
        });
    } catch (error) {
        console.error('Test profanity error:', error);
        return sendError(res, 'Failed to test text', 500);
    }
});

async function getQueueForDevice(deviceId: string, userId?: string, options?: { skipRecovery?: boolean }) {
    if (!options?.skipRecovery) {
        try {
            await reconcileStoppedSpotifyPlaybackForDevice({ deviceId });
        } catch (error) {
            console.warn('[Jukebox] Spotify queue reconciliation failed:', error);
        }
        try {
            const pendingCountCheck = await db.query(
                "SELECT COUNT(id) AS count FROM queue_items WHERE device_id = $1 AND status = 'pending'",
                [deviceId]
            );
            const pendingCount = Number(pendingCountCheck.rows[0]?.count ?? 0);
            if (pendingCount === 0) {
                await enqueueAutoplayForDevice({ deviceId });
            }
        } catch {
            // Autoplay skipped or failed cleanly
        }
    }

    const result = await db.query(
        `SELECT qi.*, s.title, s.artist, s.cover_url, s.duration_ms, s.spotify_uri, s.spotify_id,
            s.source_type, s.file_url, s.asset_role,
            u.display_name as added_by_name
            ${userId ? ', (SELECT vote_type FROM votes v WHERE v.queue_item_id = qi.id AND v.user_id = $2) as user_vote' : ''}
     FROM queue_items qi
     JOIN songs s ON qi.song_id = s.id
     JOIN users u ON qi.added_by = u.id
     WHERE qi.device_id = $1 AND qi.status IN ('pending', 'playing')
     ORDER BY
        CASE WHEN qi.status = 'playing' THEN 1 ELSE 2 END,
        CASE WHEN qi.queue_reason = 'autoplay' THEN 2 ELSE 1 END,
        qi.priority_score DESC,
        qi.added_at ASC`,
        userId ? [deviceId, userId] : [deviceId]
    );

    const queueRows = result.rows.map((row: any) => decorateQueuePlaybackItem(row));
    let nowPlaying = queueRows.find((r: any) => r.status === 'playing');

    // Autoplay / Persistent State Logic
    if (!nowPlaying) {
        // 1. Check if device has a recorded current_song_id (from previous autoplay or manual)
        const deviceResult = await db.query('SELECT current_song_id FROM devices WHERE id = $1', [deviceId]);
        const currentSongId = deviceResult.rows[0]?.current_song_id;

        if (currentSongId) {
            // Fetch the details of the song currently assigned to the device
            const songResult = await db.query('SELECT * FROM songs WHERE id = $1', [currentSongId]);
            if (songResult.rows[0]) {
                const song = songResult.rows[0];
                nowPlaying = buildCurrentSongFallbackItem(song);
            }
        }
    }

    return buildVisibleQueueState(queueRows, nowPlaying || null);
}

export default router;

