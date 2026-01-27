import { Server } from 'socket.io';

let io: Server;

export const initIO = (server: any) => {
    io = new Server(server, {
        cors: { origin: '*' }
    });
    return io;
};

export const getIO = () => {
    if (!io) {
        // No-op or throw error. For our routes, we'll handle the optionality.
    }
    return io;
};
