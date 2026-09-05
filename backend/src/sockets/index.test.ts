import { describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

const { mockAuthenticateAccessToken } = vi.hoisted(() => ({
    mockAuthenticateAccessToken: vi.fn(),
}));

vi.mock('../routes/jukebox', () => ({
    reconcileStoppedSpotifyPlaybackForDevice: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
    authenticateAccessToken: mockAuthenticateAccessToken,
    extractBearerToken: (header?: string) => {
        const match = /^Bearer\s+(\S+)$/i.exec(String(header ?? '').trim());
        return match?.[1] ?? null;
    },
}));

import {
    extractSocketAccessToken,
    setupSocketHandlers,
    socketSessionAuthMiddleware,
} from './index';

describe('socket handler registration', () => {
    it('keeps device events while leaving legacy Social room events disabled', () => {
        const connectionHandlers: Array<(socket: Socket) => void> = [];
        const io = {
            use: vi.fn(() => io),
            on: vi.fn((event: string, handler: (socket: Socket) => void) => {
                if (event === 'connection') connectionHandlers.push(handler);
                return io;
            }),
        } as unknown as Server;
        const registeredEvents = new Set<string>();
        const socket = {
            id: 'socket-test',
            data: {},
            on: vi.fn((event: string) => {
                registeredEvents.add(event);
                return socket;
            }),
        } as unknown as Socket;
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        setupSocketHandlers(io);
        expect(io.use).toHaveBeenCalledWith(socketSessionAuthMiddleware);
        expect(connectionHandlers).toHaveLength(1);
        connectionHandlers[0]!(socket);

        expect(registeredEvents).toEqual(new Set([
            'join_device',
            'leave_device',
            'playback_progress',
            'kiosk_heartbeat',
            'disconnect',
        ]));
        expect(registeredEvents.has('room:join')).toBe(false);
        expect(registeredEvents.has('room:sit')).toBe(false);
        expect(registeredEvents.has('room:leave')).toBe(false);
        consoleLog.mockRestore();
    });

    it('joins authenticated sid-bearing sockets to their revocation room', () => {
        const connectionHandlers: Array<(socket: Socket) => void> = [];
        const io = {
            use: vi.fn(() => io),
            on: vi.fn((event: string, handler: (socket: Socket) => void) => {
                if (event === 'connection') connectionHandlers.push(handler);
                return io;
            }),
        } as unknown as Server;
        const sid = '44444444-4444-4444-8444-444444444444';
        const socket = {
            id: 'socket-account',
            data: { user: { id: 'user-1', email: 'student@tedu.edu.tr', role: 'user', sid } },
            join: vi.fn(),
            on: vi.fn(() => socket),
        } as unknown as Socket;
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        setupSocketHandlers(io);
        connectionHandlers[0]!(socket);

        expect(socket.join).toHaveBeenCalledWith(`auth-session:${sid}`);
        consoleLog.mockRestore();
    });
});

describe('socket account session authentication', () => {
    it('accepts handshake, bearer and web-cookie access token transports', () => {
        expect(extractSocketAccessToken({
            handshake: { auth: { access_token: 'handshake-token' }, headers: {} },
        } as any)).toBe('handshake-token');
        expect(extractSocketAccessToken({
            handshake: { auth: {}, headers: { authorization: 'Bearer header-token' } },
        } as any)).toBe('header-token');
        expect(extractSocketAccessToken({
            handshake: { auth: {}, headers: { cookie: 'rt_access=cookie-token' } },
        } as any)).toBe('cookie-token');
    });

    it('validates a presented token and attaches the verified account', async () => {
        const account = {
            id: 'user-1',
            email: 'student@tedu.edu.tr',
            role: 'user',
            sid: '55555555-5555-4555-8555-555555555555',
        };
        mockAuthenticateAccessToken.mockResolvedValueOnce(account);
        const socket = {
            data: {},
            handshake: { auth: { token: 'account-token' }, headers: {} },
        } as any;
        const next = vi.fn();

        await socketSessionAuthMiddleware(socket, next);

        expect(mockAuthenticateAccessToken).toHaveBeenCalledWith('account-token');
        expect(socket.data.user).toEqual(account);
        expect(next).toHaveBeenCalledWith();
    });

    it('rejects a presented token whose session family is inactive', async () => {
        mockAuthenticateAccessToken.mockRejectedValueOnce(new Error('revoked'));
        const socket = {
            data: {},
            handshake: { auth: { token: 'revoked-token' }, headers: {} },
        } as any;
        const next = vi.fn();

        await socketSessionAuthMiddleware(socket, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Invalid or expired token',
        }));
    });

    it('keeps legacy device sockets without an account token compatible', async () => {
        const socket = { data: {}, handshake: { auth: {}, headers: {} } } as any;
        const next = vi.fn();

        await socketSessionAuthMiddleware(socket, next);

        expect(next).toHaveBeenCalledWith();
    });
});
