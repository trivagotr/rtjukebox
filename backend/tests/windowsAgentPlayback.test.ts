import { describe, expect, it, vi } from 'vitest';
import {
    authenticateWindowsAgentDevice,
    handleWindowsAgentEvent,
    registerWindowsAgent,
    sendWindowsAgentCommand,
    WindowsAgentPlaybackError
} from '../src/services/windowsAgentPlayback';

function createDb(handler: (sql: string, params?: any[]) => any[]) {
    const queries: Array<{ sql: string; params?: any[] }> = [];
    return {
        queries,
        db: {
            query: vi.fn(async (sql: string, params?: any[]) => {
                queries.push({ sql, params });
                return { rows: handler(sql, params) };
            })
        }
    };
}

function createIo(deviceId: string) {
    const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
    return {
        emitted,
        io: {
            sockets: {
                adapter: {
                    rooms: new Map([[`windows-agent:${deviceId}`, new Set(['socket-1'])]])
                }
            },
            to: (room: string) => ({
                emit: (event: string, payload: unknown) => {
                    emitted.push({ room, event, payload });
                }
            })
        }
    };
}

describe('windows agent playback backend contract', () => {
    it('authenticates agent registration with the existing device password', async () => {
        const { db } = createDb(() => [{ id: 'device-1', device_code: 'KIOSK01', password: 'secret' }]);

        await expect(authenticateWindowsAgentDevice({
            device_code: 'KIOSK01',
            password: 'wrong'
        }, db)).rejects.toMatchObject({
            status: 403,
            code: 'INVALID_DEVICE_PASSWORD'
        });

        await expect(authenticateWindowsAgentDevice({
            device_code: 'KIOSK01',
            password: 'secret'
        }, db)).resolves.toMatchObject({
            id: 'device-1'
        });
    });

    it('registers an enabled Windows agent and joins device rooms', async () => {
        process.env.ENABLE_WINDOWS_AGENT_PLAYBACK = 'true';
        const joins: string[] = [];
        const socket = {
            id: 'socket-1',
            data: {},
            join: vi.fn((room: string) => joins.push(room))
        };
        const { io, emitted } = createIo('device-1');
        const { db } = createDb((sql) => {
            if (sql.includes('FROM devices WHERE device_code')) {
                return [{ id: 'device-1', device_code: 'KIOSK01', password: 'secret' }];
            }
            if (sql.includes('SELECT id, playback_provider')) {
                return [{
                    id: 'device-1',
                    playback_provider: 'spotify_cli',
                    playback_agent_socket_id: 'socket-1',
                    playback_state: 'agent_connected',
                    playback_state_source: 'windows_agent',
                    playback_last_event: 'AGENT_REGISTERED',
                    playback_last_event_at: '2026-07-01T00:00:00.000Z',
                    playback_last_error: null,
                    playback_debug: {}
                }];
            }
            return [];
        });

        const status = await registerWindowsAgent(io as any, socket as any, {
            device_code: 'KIOSK01',
            password: 'secret',
            provider: 'spotify_cli'
        }, db);

        expect(joins).toContain('device:device-1');
        expect(joins).toContain('windows-agent:device-1');
        expect(status?.provider).toBe('spotify_cli');
        expect(emitted.some((entry) => entry.event === 'windows_agent_status')).toBe(true);
    });

    it('emits PLAY_TRACK without marking the queue item as played', async () => {
        process.env.ENABLE_WINDOWS_AGENT_PLAYBACK = 'true';
        const { io, emitted } = createIo('device-1');
        const { db, queries } = createDb((sql) => {
            if (sql.includes('FROM queue_items qi') && sql.includes('JOIN songs')) {
                return [{
                    id: 'queue-1',
                    song_id: 'song-1',
                    title: 'Track',
                    artist: 'Artist',
                    cover_url: null,
                    duration_seconds: 180,
                    file_url: '/api/uploads/track.mp3'
                }];
            }
            if (sql.includes('SELECT id, playback_provider')) {
                return [{
                    id: 'device-1',
                    playback_provider: 'spotify_cli',
                    playback_agent_socket_id: 'socket-1',
                    playback_state: 'command_sent',
                    playback_state_source: 'backend_command',
                    playback_last_event: 'COMMAND_PLAY_TRACK',
                    playback_last_event_at: '2026-07-01T00:00:00.000Z',
                    playback_last_error: null,
                    playback_debug: {}
                }];
            }
            return [];
        });

        const payload = await sendWindowsAgentCommand(io as any, {
            deviceId: 'device-1',
            command: 'PLAY_TRACK'
        }, db);

        expect(payload.command).toBe('PLAY_TRACK');
        expect(emitted.some((entry) => entry.event === 'windows_agent_command')).toBe(true);
        expect(queries.some((entry) => entry.sql.includes("status = 'played'"))).toBe(false);
    });

    it('marks a queue item played only after TRACK_ENDED from the registered agent', async () => {
        const socket = {
            id: 'socket-1',
            data: { windowsAgent: { deviceId: 'device-1', provider: 'spotify_cli' } },
            emit: vi.fn()
        };
        const { io, emitted } = createIo('device-1');
        const { db, queries } = createDb((sql) => {
            if (sql.includes("UPDATE queue_items SET status = 'played'")) {
                return [{ added_by: 'user-1', song_id: 'song-1' }];
            }
            if (sql.includes('SELECT is_guest FROM users')) {
                return [{ is_guest: false }];
            }
            if (sql.includes('SELECT id, playback_provider')) {
                return [{
                    id: 'device-1',
                    playback_provider: 'spotify_cli',
                    playback_agent_socket_id: 'socket-1',
                    playback_state: 'ended',
                    playback_state_source: 'spotify_cli',
                    playback_last_event: 'TRACK_ENDED',
                    playback_last_event_at: '2026-07-01T00:00:00.000Z',
                    playback_last_error: null,
                    playback_debug: {}
                }];
            }
            return [];
        });

        await handleWindowsAgentEvent(io as any, socket as any, {
            device_id: 'device-1',
            event: 'TRACK_ENDED',
            queue_item_id: 'queue-1',
            song_id: 'song-1',
            stateSource: 'spotify_cli'
        }, db);

        expect(queries.some((entry) => entry.sql.includes("UPDATE queue_items SET status = 'played'"))).toBe(true);
        expect(emitted.some((entry) => entry.event === 'queue_updated')).toBe(true);
    });

    it('keeps PLAY_FAILED as debug state without marking played', async () => {
        const socket = {
            id: 'socket-1',
            data: { windowsAgent: { deviceId: 'device-1', provider: 'spotify_cli' } },
            emit: vi.fn()
        };
        const { io } = createIo('device-1');
        const { db, queries } = createDb((sql) => {
            if (sql.includes('SELECT id, playback_provider')) {
                return [{
                    id: 'device-1',
                    playback_provider: 'spotify_cli',
                    playback_agent_socket_id: 'socket-1',
                    playback_state: 'failed',
                    playback_state_source: 'spotify_cli',
                    playback_last_event: 'PLAY_FAILED',
                    playback_last_event_at: '2026-07-01T00:00:00.000Z',
                    playback_last_error: 'not found',
                    playback_debug: {}
                }];
            }
            return [];
        });

        await handleWindowsAgentEvent(io as any, socket as any, {
            device_id: 'device-1',
            event: 'PLAY_FAILED',
            queue_item_id: 'queue-1',
            error: 'not found',
            stateSource: 'spotify_cli'
        }, db);

        expect(queries.some((entry) => entry.sql.includes("status = 'played'"))).toBe(false);
    });

    it('rejects command emission when no agent is connected', async () => {
        process.env.ENABLE_WINDOWS_AGENT_PLAYBACK = 'true';
        const { db } = createDb(() => []);
        const io = {
            sockets: { adapter: { rooms: new Map() } },
            to: () => ({ emit: vi.fn() })
        };

        await expect(sendWindowsAgentCommand(io as any, {
            deviceId: 'device-1',
            command: 'PLAY_TRACK'
        }, db)).rejects.toBeInstanceOf(WindowsAgentPlaybackError);
    });
});
