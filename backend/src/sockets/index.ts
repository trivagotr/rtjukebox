import { Server, Socket } from 'socket.io';
import { reconcileStoppedSpotifyPlaybackForDevice } from '../routes/jukebox';
import { db } from '../db';

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

        const tokenExpiresAt = Number(socket.data.tokenExpiresAt);
        const expiryTimer = Number.isFinite(tokenExpiresAt)
            ? setTimeout(() => socket.disconnect(true), Math.max(0, tokenExpiresAt * 1000 - Date.now()))
            : undefined;
        expiryTimer?.unref?.();

        socket.on('join_device', async (deviceId: string) => {
            if (!allowEvent('join_device', 10, 60_000) || typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return;
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
            if (!allowEvent('leave_device', 10, 60_000) || typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return;
            const roomName = `device:${deviceId}`;
            if (socket.rooms.has(roomName)) socket.leave(roomName);
        });

        socket.on('playback_progress', (data: any) => {
            if (!allowEvent('playback_progress', 180, 60_000) || !data || typeof data !== 'object'
                || Object.keys(data).some((key) => !['device_id', 'currentTime', 'duration', 'percent'].includes(key))
                || socket.data.role !== 'kiosk' || data.device_id !== socket.data.deviceId
                || !Number.isFinite(data.currentTime) || data.currentTime < 0 || data.currentTime > 86_400
                || !Number.isFinite(data.duration) || data.duration < 0 || data.duration > 86_400
                || !Number.isFinite(data.percent) || data.percent < 0 || data.percent > 100) return;
            const roomName = `device:${data.device_id}`;
            if (!socket.rooms.has(roomName)) return;
            io.to(roomName).emit('playback_progress', {
                device_id: socket.data.deviceId,
                currentTime: data.currentTime,
                duration: data.duration,
                percent: data.percent,
            });
        });

        socket.on('kiosk_heartbeat', async (data: any) => {
            if (!allowEvent('kiosk_heartbeat', 6, 60_000) || !data || typeof data !== 'object'
                || Object.keys(data).some((key) => !['device_id', 'timestamp'].includes(key))
                || socket.data.role !== 'kiosk' || data.device_id !== socket.data.deviceId
                || !Number.isFinite(data.timestamp) || Math.abs(Date.now() - data.timestamp) > 120_000) return;
            const roomName = `device:${data.device_id}`;
            if (!socket.rooms.has(roomName)) return;
            try {
                await reconcileStoppedSpotifyPlaybackForDevice({ deviceId: data.device_id });
            } catch (error) {
                console.warn('[SOCKET] Spotify playback reconciliation failed:', error);
            }
            io.to(roomName).emit('kiosk_heartbeat', {
                device_id: socket.data.deviceId,
                timestamp: data.timestamp,
            });
        });

        socket.on('disconnect', () => {
            if (expiryTimer) clearTimeout(expiryTimer);
            console.info(JSON.stringify({ level: 'info', event: 'socket_disconnected', socketId: socket.id }));
        });
    });
}
