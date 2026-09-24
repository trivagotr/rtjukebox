import { Server, Socket } from 'socket.io';
import { reconcileStoppedSpotifyPlaybackForDevice } from '../routes/jukebox';
import { db } from '../db';
import { z } from 'zod';

const deviceIdSchema = z.string().uuid();
const playbackProgressSchema = z.object({
    device_id: z.string().uuid(),
    currentTime: z.number().finite().min(0).max(86_400),
    duration: z.number().finite().min(0).max(86_400),
    percent: z.number().finite().min(0).max(100),
}).strict();
const kioskHeartbeatSchema = z.object({
    device_id: z.string().uuid(),
    timestamp: z.number().finite(),
}).strict();

export function setupSocketHandlers(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.info(JSON.stringify({ level: 'info', event: 'socket_connected', socketId: socket.id, role: socket.data.role }));

        const eventCounts = new Map<string, { count: number; startedAt: number }>();
        const allowEvent = (eventName: string, limit: number, windowMs: number) => {
            const now = Date.now();
            const current = eventCounts.get(eventName);
            if (!current || now - current.startedAt >= windowMs) {
                eventCounts.set(eventName, { count: 1, startedAt: now });
                return true;
            }
            if (current.count >= limit) return false;
            current.count += 1;
            return true;
        };

        const tokenExpiresAt = Number(socket.data.tokenExpiresAt ?? socket.data.credentialExpiresAt);
        const expiryTimer = Number.isFinite(tokenExpiresAt)
            ? setTimeout(() => socket.disconnect(true), Math.max(0, tokenExpiresAt * 1000 - Date.now()))
            : undefined;
        expiryTimer?.unref?.();

        socket.on('join_device', async (deviceId: string) => {
            if (!allowEvent('join_device', 10, 60_000) || !deviceIdSchema.safeParse(deviceId).success) return;
            if (socket.data.role === 'kiosk' && socket.data.deviceId !== deviceId) return;

            if (socket.data.role !== 'kiosk' && socket.data.role !== 'admin') {
                try {
                    const session = await db.query(
                        'SELECT 1 FROM device_sessions WHERE user_id = $1 AND device_id = $2',
                        [socket.data.userId, deviceId],
                    );
                    if (session.rows.length === 0) return;
                } catch {
                    return;
                }
            }

            const roomName = `device:${deviceId}`;
            socket.join(roomName);
            console.info(JSON.stringify({ level: 'info', event: 'socket_joined_device', socketId: socket.id, deviceId }));
        });

        socket.on('leave_device', (deviceId: string) => {
            if (!allowEvent('leave_device', 10, 60_000) || !deviceIdSchema.safeParse(deviceId).success) return;
            const roomName = `device:${deviceId}`;
            if (socket.rooms.has(roomName)) socket.leave(roomName);
        });

        socket.on('playback_progress', (data: any) => {
            const parsed = playbackProgressSchema.safeParse(data);
            if (!allowEvent('playback_progress', 180, 60_000) || !parsed.success
                || socket.data.role !== 'kiosk' || parsed.data.device_id !== socket.data.deviceId) return;
            const payload = parsed.data;
            const roomName = `device:${payload.device_id}`;
            if (!socket.rooms.has(roomName)) return;
            io.to(roomName).emit('playback_progress', {
                device_id: socket.data.deviceId,
                currentTime: payload.currentTime,
                duration: payload.duration,
                percent: payload.percent,
            });
        });

        socket.on('kiosk_heartbeat', async (data: any) => {
            const parsed = kioskHeartbeatSchema.safeParse(data);
            if (!allowEvent('kiosk_heartbeat', 6, 60_000) || !parsed.success
                || socket.data.role !== 'kiosk' || parsed.data.device_id !== socket.data.deviceId
                || Math.abs(Date.now() - parsed.data.timestamp) > 120_000) return;
            const payload = parsed.data;
            const roomName = `device:${payload.device_id}`;
            if (!socket.rooms.has(roomName)) return;
            try {
                await reconcileStoppedSpotifyPlaybackForDevice({ deviceId: payload.device_id });
            } catch (error) {
                console.warn('[SOCKET] Spotify playback reconciliation failed:', error);
            }
            io.to(roomName).emit('kiosk_heartbeat', {
                device_id: socket.data.deviceId,
                timestamp: payload.timestamp,
            });
        });

        socket.on('disconnect', () => {
            if (expiryTimer) clearTimeout(expiryTimer);
            console.info(JSON.stringify({ level: 'info', event: 'socket_disconnected', socketId: socket.id }));
        });
    });
}
