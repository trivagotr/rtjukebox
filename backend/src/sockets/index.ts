import { Server, Socket } from 'socket.io';
import {
    handleWindowsAgentEvent,
    registerWindowsAgent,
    unregisterWindowsAgent,
    WindowsAgentPlaybackError
} from '../services/windowsAgentPlayback';

function acknowledge(callback: unknown, payload: Record<string, unknown>) {
    if (typeof callback === 'function') {
        callback(payload);
    }
}

function toSocketError(error: unknown) {
    if (error instanceof WindowsAgentPlaybackError) {
        return { error: error.message, code: error.code, status: error.status };
    }

    return { error: 'Windows agent socket event failed', code: 'WINDOWS_AGENT_SOCKET_ERROR', status: 500 };
}

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

        socket.on('kiosk_heartbeat', (data: any) => {
            if (!data || !data.device_id) return;
            const roomName = `device:${data.device_id}`;
            io.to(roomName).emit('kiosk_heartbeat', data);
        });

        socket.on('windows_agent_register', async (data: any, callback?: unknown) => {
            try {
                const status = await registerWindowsAgent(io, socket, data || {});
                acknowledge(callback, { success: true, data: status });
            } catch (error) {
                const socketError = toSocketError(error);
                console.error('[WINDOWS_AGENT] Register failed:', socketError);
                socket.emit('windows_agent_error', socketError);
                acknowledge(callback, { success: false, ...socketError });
            }
        });

        socket.on('windows_agent_event', async (data: any, callback?: unknown) => {
            try {
                const status = await handleWindowsAgentEvent(io, socket, data || {});
                acknowledge(callback, { success: true, data: status });
            } catch (error) {
                const socketError = toSocketError(error);
                console.error('[WINDOWS_AGENT] Event failed:', socketError);
                socket.emit('windows_agent_error', socketError);
                acknowledge(callback, { success: false, ...socketError });
            }
        });

        socket.on('disconnect', () => {
            unregisterWindowsAgent(io, socket).catch((error) => {
                console.error('[WINDOWS_AGENT] Disconnect cleanup failed:', error);
            });
            console.log(`[SOCKET] Disconnected: ${socket.id}`);
        });
    });
}
