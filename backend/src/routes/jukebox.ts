// Jukebox Routes - Updated for Metadata Sync
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { db } from '../db';
import { getIO } from '../socket';
import { MetadataService } from '../services/metadata';
import { authMiddleware, optionalAuth, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';
import { AudioService } from '../services/audio';
import { songUpload, songUploadDir, normalizeUploadedSongFilename } from '../middleware/upload';
import path from 'path';
import { buildSongFileUrl, normalizeText } from '../utils/textNormalization';
import { CatalogSongSearchItem, spotifyService, toCatalogSongSearchItem, toContentFilterTrack, upsertSpotifyTrack } from '../services/spotify';
import { buildAutoplaySelection, buildSystemQueueInsertions, loadEffectiveRadioProfileConfig } from '../services/radioProfiles';
import { createDefaultFilterService, SpotifyTrack as ContentFilterTrack } from '../services/contentFilter';
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

type SpotifyPlaybackDispatchService = Pick<typeof spotifyService, 'transferPlayback' | 'playTrack'>;

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

    const playbackTarget = await loadSpotifyKioskPlaybackTarget(params.deviceId);
    const playbackDeviceId = resolveSpotifyKioskPlaybackDeviceId(playbackTarget ?? {});
    if (!playbackDeviceId) {
        throw new Error('No active Spotify kiosk playback device registered');
    }

    const service = params.spotifyService ?? spotifyService;
    await service.transferPlayback(playbackDeviceId, true);
    await service.playTrack(playbackDeviceId, params.song.spotify_uri);
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
    startQueueItem: (deviceId: string, queueItem: RecoverableQueueItem) => Promise<void>;
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

    if (currentSong?.source_type !== 'spotify' || !currentSong.spotify_uri || !playbackTargetDeviceId || !playbackTargetIsActive) {
        return false;
    }

    if (!snapshot) {
        return true;
    }

    if (snapshot.deviceId && snapshot.deviceId !== playbackTargetDeviceId) {
        return false;
    }

    if (snapshot.isPlaying || snapshot.itemUri !== currentSong.spotify_uri) {
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
    await db.query("UPDATE queue_items SET status = 'playing' WHERE id = $1", [queueItem.id]);
    await db.query(
        'UPDATE devices SET current_song_id = $2, last_heartbeat = NOW() WHERE id = $1',
        [deviceId, queueItem.song_id]
    );

    if (queueItem.source_type === 'spotify' && queueItem.spotify_uri) {
        await dispatchSpotifyPlaybackForSong({
            deviceId,
            song: {
                source_type: 'spotify',
                spotify_uri: queueItem.spotify_uri,
            },
        });
        await recordAutoplayPlaybackStart({ queueItemId: queueItem.id });
    }
}

async function emitQueueUpdatedForDevice(deviceId: string) {
    getIO()?.to(`device:${deviceId}`).emit('queue_updated', await getQueueForDevice(deviceId, undefined, { skipRecovery: true }));
}

export async function reconcileStoppedSpotifyPlaybackForDevice(params: {
    deviceId: string;
    deps?: Partial<ReconcileStoppedSpotifyPlaybackDeps>;
}) {
    const deps: ReconcileStoppedSpotifyPlaybackDeps = {
        loadContext: loadStoppedSpotifyPlaybackContext,
        getPlaybackSnapshot: () => spotifyService.getCurrentPlaybackSnapshot(),
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
        await deps.startQueueItem(params.deviceId, nextQueueItem);
    }

    await deps.emitQueueUpdated(params.deviceId);

    return {
        recovered: true as const,
        nextQueueItemId: nextQueueItem?.id ?? null,
    };
}

function readSpotifyKioskDeviceId(req: Request) {
    const queryDeviceId = typeof req.query?.device_id === 'string' ? req.query.device_id : null;
    const bodyDeviceId = typeof (req.body as { device_id?: unknown } | undefined)?.device_id === 'string'
        ? ((req.body as { device_id?: string }).device_id || null)
        : null;

    return (queryDeviceId ?? bodyDeviceId)?.trim() || null;
}

function readSpotifyKioskDevicePassword(req: Request) {
    const bodyPassword = typeof (req.body as { device_pwd?: unknown } | undefined)?.device_pwd === 'string'
        ? ((req.body as { device_pwd?: string }).device_pwd || null)
        : null;
    const queryPassword = typeof req.query?.device_pwd === 'string' ? req.query.device_pwd : null;

    return (bodyPassword ?? queryPassword ?? '').trim();
}

async function loadValidatedSpotifyKioskDevice(deviceId: string, devicePassword: string) {
    const deviceResult = await db.query(
        'SELECT id, password FROM devices WHERE id = $1',
        [deviceId]
    );

    if (deviceResult.rows.length === 0) {
        return { ok: false as const, statusCode: 404, error: 'Device not found' };
    }

    const device = deviceResult.rows[0];
    if (device.password && device.password !== devicePassword) {
        return { ok: false as const, statusCode: 403, error: 'Invalid device password' };
    }

    return { ok: true as const };
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

export async function handleSpotifyKioskTokenRequest(req: Request, res: Response) {
    try {
        const deviceId = readSpotifyKioskDeviceId(req);
        if (!deviceId) {
            return sendError(res, 'Missing device_id', 400);
        }

        const deviceResult = await db.query(
            'SELECT id FROM devices WHERE id = $1',
            [deviceId]
        );
        if (deviceResult.rows.length === 0) {
            return sendError(res, 'Device not found', 404);
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
        const isMissingDeviceAuth = errorMessage.includes('No Spotify authorization found');
        return sendError(
            res,
            errorMessage,
            isMissingDeviceAuth ? 503 : 500
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

        const authUrl = await spotifyService.getDeviceAuthStartUrl(deviceId);
        if (req.method === 'GET') {
            return res.redirect(authUrl);
        }
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

        const deviceResult = await db.query(
            'SELECT id FROM devices WHERE id = $1',
            [normalized.deviceId]
        );
        if (deviceResult.rows.length === 0) {
            return sendError(res, 'Device not found', 404);
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
                     WHEN EXISTS (
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
}): Promise<{ songId: string; sourceType: 'spotify' | 'local'; queueReason: 'user' | 'admin' }> {
    const queueReason = params.requesterRole === ROLES.ADMIN ? 'admin' : 'user';

    if (params.request.spotify_uri) {
        const track = await params.resolveSpotifyTrackByUri(params.request.spotify_uri);
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

    return result.rows.map((row) => ({
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

    const row = result.rows[0] ?? null;
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

// --- Admin Endpoints (High Priority) ---

// Force logout all clients from a device
router.post('/admin/devices/:id/logout-all', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { id } = req.params;

    try {
        console.log(`[Admin] Force logout all for device: ${id}`);

        // Clear server-side sessions
        await db.query('DELETE FROM device_sessions WHERE device_id = $1', [id]);

        getIO()?.to(`device:${id}`).emit('force_logout');
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
router.post('/queue', authMiddleware, checkDeviceSession, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { device_id, song_id, spotify_uri } = req.body;
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

        // Per-user queue limit (to ensure fairness)
        const activeUserSongs = await db.query(
            "SELECT COUNT(id) FROM queue_items WHERE device_id = $1 AND added_by = $2 AND status = 'pending'",
            [device_id, userId]
        );
        const songCount = parseInt(activeUserSongs.rows[0].count);

        if (dbUser.role === ROLES.ADMIN) {
            // Admins have no limits
        } else if (dbUser.role === ROLES.USER) {
            const USER_LIMIT = 5;
            if (songCount >= USER_LIMIT) {
                return sendError(res, `Queue limit reached (${USER_LIMIT} songs)`, 403, `Kuyrukta en fazla ${USER_LIMIT} aktif şarkınız olabilir.`);
            }
        }

        try {
            await enforceGuestDailySongLimit({
                dbClient: db,
                isGuest: dbUser.is_guest,
                guestFingerprint,
            });
        } catch (guestLimitError: any) {
            if (guestLimitError.message === 'Guest fingerprint required') {
                return sendError(res, 'Guest fingerprint required', 400, 'GUEST_FINGERPRINT_REQUIRED');
            }

            if (guestLimitError.message === 'Guest daily song limit reached') {
                return sendError(
                    res,
                    'Guest daily limit reached. Hesap açarsan sınırsız şarkı ekleyebilirsin.',
                    403,
                    'GUEST_LIMIT_REACHED'
                );
            }

            throw guestLimitError;
        }

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

            throw selectionError;
        }

        // Check if song is already in pending queue for this device
        const existing = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending'",
            [device_id, queueSelection.songId]
        );

        if (existing.rows.length > 0 && dbUser.role !== ROLES.ADMIN) {
            return sendError(res, 'Song is already in queue', 400);
        }

        // Repeat Protection (Anti-Loop)
        // Check if song was played in the last 15 minutes
        const recentlyPlayed = await db.query(
            `SELECT id FROM queue_items 
             WHERE device_id = $1 AND song_id = $2 AND status = 'played' 
             AND played_at > NOW() - INTERVAL '15 minutes'`,
            [device_id, queueSelection.songId]
        );

        if (recentlyPlayed.rows.length > 0 && dbUser.role !== ROLES.ADMIN) {
            return sendError(res, 'Song played recently', 400, 'Bu şarkı yakın zamanda çaldı. Lütfen biraz bekleyin.');
        }

        const priorityScore = getQueueInsertPriorityScore();

        const result = await db.query(
            `INSERT INTO queue_items (device_id, song_id, added_by, priority_score, status, queue_reason)
        VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
            [device_id, queueSelection.songId, userId, priorityScore, queueSelection.queueReason]
        );

        let autoStarted = false;
        if (queueSelection.sourceType === 'spotify') {
            const [deviceStateResult, pendingCountResult, songSourceResult] = await Promise.all([
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
            ]);

            const deviceState = deviceStateResult.rows[0] ?? null;
            const pendingCount = Number.parseInt(pendingCountResult.rows[0]?.pending_count ?? '0', 10);
            const songSource = songSourceResult.rows[0] ?? null;

            if (shouldImmediatelyStartSpotifyQueueItem({
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

                    await db.query("UPDATE queue_items SET status = 'playing' WHERE id = $1", [result.rows[0].id]);
                    await recordAutoplayPlaybackStart({ queueItemId: result.rows[0].id });
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

        await applyQueueAddStats({
            dbClient: db,
            userId,
            isGuest: dbUser.is_guest,
            guestFingerprint,
        });

        // Broadcast to all connected clients
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(
            res,
            {
                ...result.rows[0],
                status: autoStarted ? 'playing' : result.rows[0].status,
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
router.post('/vote', authMiddleware, checkDeviceSession, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { queue_item_id, song_id, vote } = req.body;
    const userId = authReq.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required to vote' });

    try {
        const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        const dbUser = userRes.rows[0];
        if (!dbUser) return sendError(res, 'User not found', 404);

        const isSuper = req.body.is_super === true;
        const supervoteAvailability = canUseDailySupervote({
            isGuest: dbUser.is_guest,
            lastSuperVoteAt: dbUser.last_super_vote_at,
        });
        if (isSuper && !supervoteAvailability.allowed) {
            if (supervoteAvailability.reason === 'guest') {
                return sendError(res, 'Süper oy için giriş yapmalısın.', 403);
            }

            return sendError(res, 'Bugün süper oy hakkını zaten kullandın!', 403, 'SUPER_VOTE_COOLDOWN');
        }

        const targetQueueId = queue_item_id;

        if (!targetQueueId && song_id) {
            const directVoteKind = resolveFinalQueueVoteKind({
                previousVote: 0,
                requestedVote: vote,
                isSuper,
            });
            const directVoteUpdate = buildQueueVoteScoreUpdate({
                previousVote: 0,
                nextVote: directVoteKind,
            });

            if (isSuper) {
                await db.query('UPDATE users SET last_super_vote_at = NOW() WHERE id = $1', [userId]);
            }

            await db.query('UPDATE songs SET score = score + $1 WHERE id = $2', [directVoteUpdate.songDelta, song_id]);
            return sendSuccess(
                res,
                { score_updated: true, song_score_delta: directVoteUpdate.songDelta },
                'Vote cast on song'
            );
        }

        const existingVote = await db.query(
            'SELECT vote_type FROM votes WHERE queue_item_id = $1 AND user_id = $2',
            [targetQueueId, userId]
        );
        const oldVote = existingVote.rows[0]?.vote_type ?? 0;
        const finalVoteKind = resolveFinalQueueVoteKind({
            previousVote: oldVote,
            requestedVote: vote,
            isSuper,
        });
        const voteScoreUpdate = buildQueueVoteScoreUpdate({
            previousVote: oldVote,
            nextVote: finalVoteKind,
        });

        if (isSuper) {
            await db.query('UPDATE users SET last_super_vote_at = NOW() WHERE id = $1', [userId]);
        }

        if (finalVoteKind === 'none') {
            await db.query('DELETE FROM votes WHERE queue_item_id = $1 AND user_id = $2', [targetQueueId, userId]);
        } else {
            await db.query(
                `INSERT INTO votes (queue_item_id, user_id, vote_type) VALUES ($1, $2, $3)
                 ON CONFLICT (queue_item_id, user_id) DO UPDATE SET vote_type = $3`,
                [targetQueueId, userId, voteScoreUpdate.storedVoteValue]
            );
        }

        const votesRes = await db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN vote_type > 0 THEN vote_type ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN vote_type < 0 THEN ABS(vote_type) ELSE 0 END), 0) as downvotes
             FROM votes WHERE queue_item_id = $1`,
            [targetQueueId]
        );

        const upvotes = Number(votesRes.rows[0]?.upvotes ?? 0);
        const downvotes = Number(votesRes.rows[0]?.downvotes ?? 0);

        const queueItemRes = await db.query('SELECT * FROM queue_items WHERE id = $1', [targetQueueId]);
        const queueItem = queueItemRes.rows[0];
        if (!queueItem) return sendError(res, 'Item not found', 404);

        await db.query('UPDATE songs SET score = score + $1 WHERE id = $2', [voteScoreUpdate.songDelta, queueItem.song_id]);
        await applyRequesterVoteRankDelta({
            dbClient: db,
            requesterId: queueItem.added_by,
            requesterRankDelta: voteScoreUpdate.requesterRankDelta,
        });

        const SKIP_THRESHOLD = 3;
        if (downvotes >= SKIP_THRESHOLD && downvotes > upvotes + 1) {
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [targetQueueId]);
            getIO()?.to(`device:${queueItem.device_id}`).emit('song_rejected');
            return sendSuccess(
                res,
                {
                    skipped: true,
                    upvotes,
                    downvotes,
                    song_score: upvotes - downvotes,
                    user_vote: voteScoreUpdate.storedVoteValue,
                },
                'Song rejected by community vote'
            );
        }

        const nextSongScore = upvotes - downvotes;
        if (queueItem.status === 'pending') {
            await db.query(
                'UPDATE queue_items SET priority_score = $1, upvotes = $2, downvotes = $3 WHERE id = $4',
                [nextSongScore, upvotes, downvotes, targetQueueId]
            );
        } else {
            await db.query(
                'UPDATE queue_items SET upvotes = $1, downvotes = $2 WHERE id = $3',
                [upvotes, downvotes, targetQueueId]
            );
        }

        getIO()?.to(`device:${queueItem.device_id}`).emit('queue_updated', await getQueueForDevice(queueItem.device_id));
        return sendSuccess(
            res,
            {
                upvotes,
                downvotes,
                song_score: nextSongScore,
                user_vote: voteScoreUpdate.storedVoteValue,
            },
            'Vote cast successfully'
        );
    } catch (error) {
        console.error('Vote error:', error);
        return sendError(res, 'Vote failed', 500);
    }
});
// Get queue for device
router.get('/queue/:deviceId', optionalAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const queue = await getQueueForDevice(req.params.deviceId, authReq.user?.id);
    res.json(queue);
});

// --- Admin Endpoints ---



// Force Skip Song
router.post('/admin/skip', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.post('/admin/sync-metadata', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.get('/admin/songs', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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

router.patch('/admin/songs/:id/classification', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.post('/admin/scan-folder', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const uploadsPath = path.join(__dirname, '../../uploads/songs');

    try {
        if (!fs.existsSync(uploadsPath)) {
            fs.mkdirSync(uploadsPath, { recursive: true });
        }

        const files = fs.readdirSync(uploadsPath).filter((f: string) =>
            shouldScanFolderProcessFile(f)
        );

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
router.post('/admin/upload-song', authMiddleware, songUpload.single('song'), async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.delete('/admin/songs/:id', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.get('/admin/devices', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    try {
        const devices = await db.query(`
            SELECT d.*, 
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
router.post('/admin/devices', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { device_code, name, location, password } = req.body;

    if (!device_code || !name) {
        return sendError(res, 'device_code and name are required', 400);
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
            'INSERT INTO devices (device_code, name, location, password) VALUES ($1, $2, $3, $4) RETURNING *',
            [device_code.toUpperCase(), normalizedDevice.name, normalizedDevice.location, password || null]
        );
        return sendSuccess(res, { device: result.rows[0] }, 'Device created');
    } catch (error) {
        console.error('Create device error:', error);
        return sendError(res, 'Failed to create device', 500);
    }
});



// Update device
router.put('/admin/devices/:id', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { id } = req.params;
    const { name, location, is_active, password } = req.body;

    try {
        let normalizedDevice;
        try {
            normalizedDevice = prepareNormalizedDeviceAdminInput('update', { name, location });
        } catch (validationError: any) {
            return sendError(res, validationError.message || 'Invalid device name', 400);
        }
        const result = await db.query(
            `UPDATE devices SET 
                name = COALESCE($1, name),
                location = COALESCE($2, location),
                is_active = COALESCE($3, is_active),
                password = COALESCE($4, password)
             WHERE id = $5 RETURNING *`,
            [normalizedDevice.name, normalizedDevice.location, is_active, password, id]
        );

        if (result.rows.length === 0) {
            return sendError(res, 'Device not found', 404);
        }

        return sendSuccess(res, { device: result.rows[0] }, 'Device updated');
    } catch (error) {
        console.error('Update device error:', error);
        return sendError(res, 'Failed to update device', 500);
    }
});




// Manually trigger audio processing (e.g. after upload)
router.post('/admin/process-song', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { song_id } = req.body;

    try {
        const song = await db.query('SELECT * FROM songs WHERE id = $1', [song_id]);
        if (!song.rows[0]) return sendError(res, 'Song not found', 404);

        const absolutePath = path.join('/app', song.rows[0].file_url); // Docker path

        let targetPath = path.join(__dirname, '../../', song.rows[0].file_url);

        const newPath = await AudioService.processTrack(targetPath);

        const webPath = song.rows[0].file_url.replace(/(\.[\w\d]+)$/, '_trimmed$1');

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
        const { device_code, password } = req.body;
        console.log(`[KIOSK REGISTER] device_code="${device_code}" password="${password}"`);

        const deviceCheck = await db.query('SELECT password FROM devices WHERE device_code = $1', [device_code]);
        if (deviceCheck.rows.length === 0) {
            console.log(`[KIOSK REGISTER] Device not found: ${device_code}`);
            return sendError(res, 'Device code invalid', 404);
        }

        const device = deviceCheck.rows[0];
        console.log(`[KIOSK REGISTER] DB password="${device.password}" received="${password}"`);

        if (device.password && device.password !== password) {
            console.log(`[KIOSK REGISTER] Password mismatch!`);
            return sendError(res, 'Invalid device password for registration', 403, 'INVALID_PASSWORD');
        }

        const updatedDevice = await db.query(
            'UPDATE devices SET is_active = true, last_heartbeat = NOW() WHERE device_code = $1 RETURNING *',
            [device_code]
        );

        return sendSuccess(res, { device: updatedDevice.rows[0] }, 'Kiosk registered');
    } catch (error) {
        console.error('Kiosk registration error:', error);
        return sendError(res, 'Internal server error during registration', 500);
    }
});

router.get('/kiosk/spotify-token', handleSpotifyKioskTokenRequest);

router.post('/kiosk/spotify-device-auth/status', handleSpotifyKioskDeviceAuthStatusRequest);

router.get('/kiosk/spotify-device-auth/start', handleSpotifyKioskDeviceAuthStartRequest);

router.post('/kiosk/spotify-device-auth/start', handleSpotifyKioskDeviceAuthStartRequest);

router.post('/kiosk/spotify-device', handleSpotifyKioskDeviceRegistration);

router.post('/kiosk/now-playing', async (req: Request, res: Response) => {
    const { device_id, song_id } = req.body;

    try {
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

        const currentSongResult = await db.query(
            'SELECT id, source_type, spotify_uri FROM songs WHERE id = $1',
            [song_id]
        );
        const currentSong = currentSongResult.rows[0] ?? null;

        if (currentSong?.source_type === 'spotify') {
            try {
                await dispatchSpotifyPlaybackForSong({
                    deviceId: device_id,
                    song: currentSong,
                });
            } catch (dispatchError) {
                console.warn('[Spotify Dispatch] Failed to start kiosk playback:', dispatchError);
                const message = dispatchError instanceof Error
                    ? dispatchError.message
                    : 'Failed to start Spotify playback';
                const statusCode = message === 'No active Spotify kiosk playback device registered' ? 409 : 502;
                return sendError(res, message, statusCode);
            }
        }

        // Try to find if this song is in the queue
        const queueItem = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending' ORDER BY priority_score DESC LIMIT 1",
            [device_id, song_id]
        );

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
            [device_id, song_id]
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
router.post('/admin/songs/:id/block', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.delete('/admin/songs/:id/block', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.post('/admin/artists/block', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.delete('/admin/artists/:id/block', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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
router.get('/admin/blocked', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

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

async function getQueueForDevice(deviceId: string, userId?: string, options?: { skipRecovery?: boolean }) {
    if (!options?.skipRecovery) {
        try {
            await reconcileStoppedSpotifyPlaybackForDevice({ deviceId });
        } catch (error) {
            console.warn('[Jukebox] Spotify queue reconciliation failed:', error);
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
        qi.priority_score DESC`,
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

