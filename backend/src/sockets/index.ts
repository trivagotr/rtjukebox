import { Server, Socket } from 'socket.io';
import { reconcileStoppedSpotifyPlaybackForDevice } from '../routes/jukebox';

export function setupSocketHandlers(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.log(`[SOCKET] New connection: ${socket.id}`);

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
