import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { db as defaultDb } from '../db';

export type WindowsAgentCommandType = 'PLAY_TRACK' | 'PAUSE' | 'RESUME' | 'SKIP';
export type WindowsAgentEventType = 'PLAY_STARTED' | 'PLAYBACK_STATE' | 'TRACK_ENDED' | 'PLAY_FAILED';

export interface DbLike {
    query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
}

export interface WindowsAgentRegistrationPayload {
    device_id?: string;
    deviceId?: string;
    device_code?: string;
    deviceCode?: string;
    password?: string;
    token?: string;
    provider?: string;
}

export interface SendWindowsAgentCommandInput {
    deviceId: string;
    command: WindowsAgentCommandType;
    queueItemId?: string | null;
    reason?: string | null;
}

export interface WindowsAgentEventPayload {
    device_id?: string;
    deviceId?: string;
    event?: WindowsAgentEventType;
    type?: WindowsAgentEventType;
    queue_item_id?: string;
    queueItemId?: string;
    song_id?: string;
    songId?: string;
    state?: string;
    stateSource?: string;
    state_source?: string;
    error?: string;
    reason?: string;
    progress_ms?: number;
    progressMs?: number;
    duration_ms?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}

interface DeviceRecord {
    id: string;
    device_code: string;
    password?: string | null;
}

interface AgentStatus {
    device_id: string;
    provider: string | null;
    connected: boolean;
    state: string | null;
    stateSource: string | null;
    lastEvent: string | null;
    lastEventAt: string | null;
    errorReason: string | null;
    debug: Record<string, unknown>;
}

const COMMANDS: WindowsAgentCommandType[] = ['PLAY_TRACK', 'PAUSE', 'RESUME', 'SKIP'];
const EVENTS: WindowsAgentEventType[] = ['PLAY_STARTED', 'PLAYBACK_STATE', 'TRACK_ENDED', 'PLAY_FAILED'];
const WINDOWS_AGENT_ROOM_PREFIX = 'windows-agent';

export class WindowsAgentPlaybackError extends Error {
    status: number;
    code: string;

    constructor(message: string, status = 400, code = 'WINDOWS_AGENT_PLAYBACK_ERROR') {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export function isWindowsAgentPlaybackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.ENABLE_WINDOWS_AGENT_PLAYBACK === 'true';
}

export function isWindowsAgentRequiredForSpotify(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.WINDOWS_AGENT_REQUIRED_FOR_SPOTIFY === 'true';
}

export function getWindowsAgentRoom(deviceId: string): string {
    return `${WINDOWS_AGENT_ROOM_PREFIX}:${deviceId}`;
}

export function isWindowsAgentCommand(value: unknown): value is WindowsAgentCommandType {
    return typeof value === 'string' && COMMANDS.includes(value as WindowsAgentCommandType);
}

export function isWindowsAgentEvent(value: unknown): value is WindowsAgentEventType {
    return typeof value === 'string' && EVENTS.includes(value as WindowsAgentEventType);
}

export function normalizeProvider(provider?: string | null): string {
    const normalized = (provider || 'spotify_cli').trim().toLowerCase();
    return normalized || 'spotify_cli';
}

function getDeviceId(payload: WindowsAgentRegistrationPayload | WindowsAgentEventPayload): string | null {
    const value = payload.device_id || payload.deviceId;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDeviceCode(payload: WindowsAgentRegistrationPayload): string | null {
    const value = payload.device_code || payload.deviceCode;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getProvidedSecret(payload: WindowsAgentRegistrationPayload): string | null {
    const value = payload.password || payload.token;
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeText(value: unknown, maxLength = 500): string | null {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/[\r\n\t]+/g, ' ').trim();
    return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function sanitizeAgentDebug(value: unknown, depth = 0): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return {};

    const output: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
        if (/token|secret|password|refresh/i.test(key)) continue;
        if (typeof rawValue === 'string') {
            output[key] = sanitizeText(rawValue, 300);
        } else if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
            output[key] = rawValue;
        } else if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
            output[key] = sanitizeAgentDebug(rawValue, depth + 1);
        }
    }
    return output;
}

function serializeStatus(row: any): AgentStatus {
    return {
        device_id: row.id,
        provider: row.playback_provider || null,
        connected: Boolean(row.playback_agent_socket_id),
        state: row.playback_state || null,
        stateSource: row.playback_state_source || null,
        lastEvent: row.playback_last_event || null,
        lastEventAt: row.playback_last_event_at || null,
        errorReason: row.playback_last_error || null,
        debug: row.playback_debug || {}
    };
}

async function getQueueSnapshot(dbClient: DbLike, deviceId: string) {
    const result = await dbClient.query(
        `SELECT qi.*, s.title, s.artist, s.cover_url, s.duration_seconds, s.file_url,
            u.display_name as added_by_name
         FROM queue_items qi
         JOIN songs s ON qi.song_id = s.id
         JOIN users u ON qi.added_by = u.id
         WHERE qi.device_id = $1 AND qi.status IN ('pending', 'playing')
         ORDER BY
            CASE WHEN qi.status = 'playing' THEN 1 ELSE 2 END,
            qi.priority_score DESC`,
        [deviceId]
    );

    const nowPlaying = result.rows.find((row: any) => row.status === 'playing') || null;
    const queue = result.rows.filter((row: any) => row.status === 'pending');
    const status = await getWindowsAgentStatus(deviceId, dbClient);

    return {
        now_playing: nowPlaying,
        queue,
        playback: status
    };
}

async function getQueueItemForCommand(dbClient: DbLike, deviceId: string, queueItemId?: string | null) {
    const params = queueItemId ? [deviceId, queueItemId] : [deviceId];
    const query = queueItemId
        ? `SELECT qi.*, s.title, s.artist, s.cover_url, s.duration_seconds, s.file_url
           FROM queue_items qi
           JOIN songs s ON qi.song_id = s.id
           WHERE qi.device_id = $1 AND qi.id = $2 AND qi.status IN ('pending', 'playing')
           LIMIT 1`
        : `SELECT qi.*, s.title, s.artist, s.cover_url, s.duration_seconds, s.file_url
           FROM queue_items qi
           JOIN songs s ON qi.song_id = s.id
           WHERE qi.device_id = $1 AND qi.status = 'pending'
           ORDER BY qi.priority_score DESC
           LIMIT 1`;

    const result = await dbClient.query(query, params);
    return result.rows[0] || null;
}

async function updateDevicePlaybackDebug(
    dbClient: DbLike,
    deviceId: string,
    patch: {
        provider?: string | null;
        socketId?: string | null;
        state?: string | null;
        stateSource?: string | null;
        lastEvent?: string | null;
        errorReason?: string | null;
        debug?: Record<string, unknown>;
    }
) {
    await dbClient.query(
        `UPDATE devices
         SET playback_provider = COALESCE($2, playback_provider),
             playback_agent_socket_id = CASE WHEN $3::boolean THEN $4 ELSE playback_agent_socket_id END,
             playback_agent_connected_at = CASE WHEN $3::boolean AND $4 IS NOT NULL THEN COALESCE(playback_agent_connected_at, NOW()) ELSE playback_agent_connected_at END,
             playback_agent_last_seen_at = NOW(),
             playback_state = COALESCE($5, playback_state),
             playback_state_source = COALESCE($6, playback_state_source),
             playback_last_event = COALESCE($7, playback_last_event),
             playback_last_event_at = NOW(),
             playback_last_error = $8,
             playback_debug = COALESCE(playback_debug, '{}'::jsonb) || $9::jsonb,
             last_heartbeat = NOW()
         WHERE id = $1`,
        [
            deviceId,
            patch.provider || null,
            patch.socketId !== undefined,
            patch.socketId || null,
            patch.state || null,
            patch.stateSource || null,
            patch.lastEvent || null,
            patch.errorReason || null,
            JSON.stringify(patch.debug || {})
        ]
    );
}

export async function authenticateWindowsAgentDevice(
    payload: WindowsAgentRegistrationPayload,
    dbClient: DbLike = defaultDb
): Promise<DeviceRecord> {
    const deviceId = getDeviceId(payload);
    const deviceCode = getDeviceCode(payload);

    if (!deviceId && !deviceCode) {
        throw new WindowsAgentPlaybackError('device_id or device_code is required', 400, 'DEVICE_REQUIRED');
    }

    if (deviceId && !isUuid(deviceId)) {
        throw new WindowsAgentPlaybackError('device_id must be a valid UUID', 400, 'INVALID_DEVICE_ID');
    }

    const result = deviceId
        ? await dbClient.query('SELECT id, device_code, password FROM devices WHERE id = $1', [deviceId])
        : await dbClient.query('SELECT id, device_code, password FROM devices WHERE device_code = $1', [deviceCode]);

    const device = result.rows[0] as DeviceRecord | undefined;
    if (!device) {
        throw new WindowsAgentPlaybackError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    if (device.password && device.password !== getProvidedSecret(payload)) {
        throw new WindowsAgentPlaybackError('Invalid device password', 403, 'INVALID_DEVICE_PASSWORD');
    }

    return device;
}

export async function registerWindowsAgent(
    io: Server,
    socket: Socket,
    payload: WindowsAgentRegistrationPayload,
    dbClient: DbLike = defaultDb
) {
    if (!isWindowsAgentPlaybackEnabled()) {
        throw new WindowsAgentPlaybackError('Windows agent playback is disabled', 403, 'WINDOWS_AGENT_PLAYBACK_DISABLED');
    }

    const device = await authenticateWindowsAgentDevice(payload, dbClient);
    const provider = normalizeProvider(payload.provider);
    const agentRoom = getWindowsAgentRoom(device.id);
    const deviceRoom = `device:${device.id}`;

    socket.join(agentRoom);
    socket.join(deviceRoom);
    socket.data.windowsAgent = { deviceId: device.id, provider };

    await updateDevicePlaybackDebug(dbClient, device.id, {
        provider,
        socketId: socket.id,
        state: 'agent_connected',
        stateSource: 'windows_agent',
        lastEvent: 'AGENT_REGISTERED',
        errorReason: null,
        debug: { provider }
    });

    const status = await getWindowsAgentStatus(device.id, dbClient);
    io.to(deviceRoom).emit('windows_agent_status', status);
    return status;
}

export async function unregisterWindowsAgent(
    io: Server,
    socket: Socket,
    dbClient: DbLike = defaultDb
) {
    const agent = socket.data.windowsAgent as { deviceId?: string; provider?: string } | undefined;
    if (!agent?.deviceId) return;

    await updateDevicePlaybackDebug(dbClient, agent.deviceId, {
        provider: agent.provider || null,
        socketId: null,
        state: 'agent_disconnected',
        stateSource: 'windows_agent',
        lastEvent: 'AGENT_DISCONNECTED',
        errorReason: null,
        debug: {}
    });

    const status = await getWindowsAgentStatus(agent.deviceId, dbClient);
    io.to(`device:${agent.deviceId}`).emit('windows_agent_status', status);
}

export async function sendWindowsAgentCommand(
    io: Server,
    input: SendWindowsAgentCommandInput,
    dbClient: DbLike = defaultDb
) {
    if (!isWindowsAgentPlaybackEnabled()) {
        throw new WindowsAgentPlaybackError('Windows agent playback is disabled', 403, 'WINDOWS_AGENT_PLAYBACK_DISABLED');
    }

    if (!isWindowsAgentCommand(input.command)) {
        throw new WindowsAgentPlaybackError('Unsupported Windows agent command', 400, 'UNSUPPORTED_WINDOWS_AGENT_COMMAND');
    }

    const agentRoom = getWindowsAgentRoom(input.deviceId);
    const room = io.sockets.adapter.rooms.get(agentRoom);
    if (!room || room.size === 0) {
        throw new WindowsAgentPlaybackError('No Windows agent is connected for this device', 409, 'WINDOWS_AGENT_NOT_CONNECTED');
    }

    const queueItem = input.command === 'PLAY_TRACK'
        ? await getQueueItemForCommand(dbClient, input.deviceId, input.queueItemId)
        : null;

    if (input.command === 'PLAY_TRACK' && !queueItem) {
        throw new WindowsAgentPlaybackError('No playable queue item found', 404, 'QUEUE_ITEM_NOT_FOUND');
    }

    const payload = {
        command_id: cryptoRandomId(),
        command: input.command,
        device_id: input.deviceId,
        queue_item_id: queueItem?.id || input.queueItemId || null,
        song_id: queueItem?.song_id || null,
        reason: sanitizeText(input.reason, 120),
        issued_at: new Date().toISOString(),
        song: queueItem ? {
            id: queueItem.song_id,
            title: queueItem.title,
            artist: queueItem.artist,
            cover_url: queueItem.cover_url,
            duration_seconds: queueItem.duration_seconds,
            file_url: queueItem.file_url
        } : null
    };

    io.to(agentRoom).emit('windows_agent_command', payload);

    await updateDevicePlaybackDebug(dbClient, input.deviceId, {
        socketId: undefined,
        state: input.command === 'PLAY_TRACK' ? 'command_sent' : input.command.toLowerCase(),
        stateSource: 'backend_command',
        lastEvent: `COMMAND_${input.command}`,
        errorReason: null,
        debug: {
            command: input.command,
            queue_item_id: payload.queue_item_id,
            song_id: payload.song_id
        }
    });

    const status = await getWindowsAgentStatus(input.deviceId, dbClient);
    io.to(`device:${input.deviceId}`).emit('windows_agent_status', status);
    return payload;
}

export async function handleWindowsAgentEvent(
    io: Server,
    socket: Socket,
    payload: WindowsAgentEventPayload,
    dbClient: DbLike = defaultDb
) {
    const agent = socket.data.windowsAgent as { deviceId?: string; provider?: string } | undefined;
    const deviceId = getDeviceId(payload) || agent?.deviceId;
    const eventName = payload.event || payload.type;

    if (!agent?.deviceId || !deviceId || agent.deviceId !== deviceId) {
        throw new WindowsAgentPlaybackError('Agent must register before sending playback events', 401, 'AGENT_NOT_REGISTERED');
    }

    if (!isWindowsAgentEvent(eventName)) {
        throw new WindowsAgentPlaybackError('Unsupported Windows agent event', 400, 'UNSUPPORTED_WINDOWS_AGENT_EVENT');
    }

    const queueItemId = payload.queue_item_id || payload.queueItemId || null;
    const songId = payload.song_id || payload.songId || null;
    const stateSource = sanitizeText(payload.stateSource || payload.state_source, 80) || 'windows_agent';
    const errorReason = sanitizeText(payload.error || payload.reason, 500);

    if (eventName === 'PLAY_STARTED') {
        if (queueItemId) {
            await dbClient.query(
                "UPDATE queue_items SET status = 'pending' WHERE device_id = $1 AND status = 'playing' AND id <> $2",
                [deviceId, queueItemId]
            );
            const started = await dbClient.query(
                "UPDATE queue_items SET status = 'playing' WHERE id = $1 AND device_id = $2 AND status IN ('pending', 'playing') RETURNING song_id",
                [queueItemId, deviceId]
            );
            const startedSongId = started.rows[0]?.song_id || songId;
            if (startedSongId) {
                await dbClient.query('UPDATE devices SET current_song_id = $2 WHERE id = $1', [deviceId, startedSongId]);
            }
        } else if (songId) {
            await dbClient.query('UPDATE devices SET current_song_id = $2 WHERE id = $1', [deviceId, songId]);
        }
    }

    if (eventName === 'TRACK_ENDED') {
        let endedQueueItem = null;

        if (queueItemId) {
            const ended = await dbClient.query(
                "UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1 AND device_id = $2 AND status IN ('pending', 'playing') RETURNING added_by, song_id",
                [queueItemId, deviceId]
            );
            endedQueueItem = ended.rows[0] || null;
        } else if (songId) {
            const current = await dbClient.query(
                "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'playing' ORDER BY added_at ASC LIMIT 1",
                [deviceId, songId]
            );
            if (current.rows[0]?.id) {
                const ended = await dbClient.query(
                    "UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1 RETURNING added_by, song_id",
                    [current.rows[0].id]
                );
                endedQueueItem = ended.rows[0] || null;
            }
        }

        if (endedQueueItem?.added_by) {
            const requester = await dbClient.query('SELECT is_guest FROM users WHERE id = $1', [endedQueueItem.added_by]);
            if (requester.rows[0] && !requester.rows[0].is_guest) {
                await dbClient.query('UPDATE users SET rank_score = rank_score + 10 WHERE id = $1', [endedQueueItem.added_by]);
            }
        }

        await dbClient.query('UPDATE devices SET current_song_id = NULL WHERE id = $1', [deviceId]);
    }

    const state = eventName === 'PLAY_FAILED'
        ? 'failed'
        : eventName === 'TRACK_ENDED'
            ? 'ended'
            : sanitizeText(payload.state, 80) || eventName.toLowerCase();

    await updateDevicePlaybackDebug(dbClient, deviceId, {
        provider: agent.provider || null,
        socketId: socket.id,
        state,
        stateSource,
        lastEvent: eventName,
        errorReason: eventName === 'PLAY_FAILED' ? errorReason : null,
        debug: sanitizeAgentDebug({
            ...(payload.metadata || {}),
            queue_item_id: queueItemId,
            song_id: songId,
            progress_ms: payload.progress_ms ?? payload.progressMs,
            duration_ms: payload.duration_ms ?? payload.durationMs
        })
    });

    const status = await getWindowsAgentStatus(deviceId, dbClient);
    io.to(`device:${deviceId}`).emit('windows_agent_status', status);

    if (eventName === 'PLAY_STARTED' || eventName === 'TRACK_ENDED' || eventName === 'PLAY_FAILED') {
        io.to(`device:${deviceId}`).emit('queue_updated', await getQueueSnapshot(dbClient, deviceId));
    }

    return status;
}

export async function getWindowsAgentStatus(deviceId: string, dbClient: DbLike = defaultDb): Promise<AgentStatus | null> {
    const result = await dbClient.query(
        `SELECT id, playback_provider, playback_agent_socket_id, playback_state, playback_state_source,
                playback_last_event, playback_last_event_at, playback_last_error, playback_debug
         FROM devices
         WHERE id = $1`,
        [deviceId]
    );

    if (!result.rows[0]) return null;
    return serializeStatus(result.rows[0]);
}

function cryptoRandomId(): string {
    return crypto.randomUUID();
}
