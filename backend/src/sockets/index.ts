import { Server, Socket } from 'socket.io';
import { reconcileStoppedSpotifyPlaybackForDevice } from '../routes/jukebox';
import { authenticateAccessToken, extractBearerToken, type AuthClaims } from '../middleware/auth';
import { authSessionSocketRoom } from '../socket';

const WEB_ACCESS_COOKIE = 'rt_access';

function socketCookieValue(cookieHeader: unknown, name: string): string {
    if (typeof cookieHeader !== 'string') return '';
    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
        const value = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }
    return '';
}

export function extractSocketAccessToken(socket: Socket): string {
    const handshakeToken = socket.handshake?.auth?.access_token
        ?? socket.handshake?.auth?.token;
    if (typeof handshakeToken === 'string' && handshakeToken.trim()) {
        return handshakeToken.trim();
    }

    const authorization = socket.handshake?.headers?.authorization;
    const bearerToken = extractBearerToken(
        Array.isArray(authorization) ? authorization[0] : authorization,
    );
    if (bearerToken) return bearerToken;

    return socketCookieValue(socket.handshake?.headers?.cookie, WEB_ACCESS_COOKIE);
}

/**
 * Account authentication remains optional for the legacy device socket
 * protocol. When a client does present an account token, however, sid-bearing
 * tokens must map to an active refresh-token family before the socket connects.
 */
export async function socketSessionAuthMiddleware(
    socket: Socket,
    next: (error?: Error) => void,
): Promise<void> {
    const token = extractSocketAccessToken(socket);
    if (!token) return next();

    try {
        socket.data.user = await authenticateAccessToken(token);
        return next();
    } catch {
        return next(new Error('Invalid or expired token'));
    }
}

export function setupSocketHandlers(io: Server) {
    io.use(socketSessionAuthMiddleware);
    io.on('connection', (socket: Socket) => {
        console.log(`[SOCKET] New connection: ${socket.id}`);

        const account = socket.data?.user as AuthClaims | undefined;
        if (account?.sid) socket.join(authSessionSocketRoom(account.sid));

        // Social presence, seating and chat use the authenticated Study REST API.
        // Do not expose the legacy client-authoritative room socket events here.

        socket.on('join_device', (deviceId: string) => {
            if (!deviceId) return;
            const roomName = `device:${deviceId}`;
            socket.join(roomName);
            console.log(`[SOCKET] ${socket.id} joined room: ${roomName}`);
        });

        socket.on('leave_device', (deviceId: string) => {
            const roomName = `device:${deviceId}`;
            socket.leave(roomName);
            console.log(`[SOCKET] ${socket.id} left room: ${roomName}`);
        });

        socket.on('playback_progress', (data: any) => {
            if (!data || !data.device_id) return;
            const roomName = `device:${data.device_id}`;
            // Relay to everyone in the room (including sender is fine for debug)
            io.to(roomName).emit('playback_progress', data);
        });

        socket.on('kiosk_heartbeat', async (data: any) => {
            if (!data || !data.device_id) return;
            const roomName = `device:${data.device_id}`;
            try {
                await reconcileStoppedSpotifyPlaybackForDevice({ deviceId: data.device_id });
            } catch (error) {
                console.warn('[SOCKET] Spotify playback reconciliation failed:', error);
            }
            io.to(roomName).emit('kiosk_heartbeat', data);
        });

        socket.on('disconnect', () => {
            console.log(`[SOCKET] Disconnected: ${socket.id}`);
        });
    });
}
