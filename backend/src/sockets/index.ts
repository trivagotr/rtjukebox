import { Server, Socket } from 'socket.io';
import { db } from '../db';

interface QueueUpdate {
    device_id: string;
    // additional fields based on your queue structure
}

export function setupSocketHandlers(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Join a device room to listen for queue updates
        socket.on('join_device', (deviceId: string) => {
            console.log(`Socket ${socket.id} joined device room: device:${deviceId}`);
            socket.join(`device:${deviceId}`);
        });

        // Leave a device room
        socket.on('leave_device', (deviceId: string) => {
            console.log(`Socket ${socket.id} left device room: device:${deviceId}`);
            socket.leave(`device:${deviceId}`);
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });
}
