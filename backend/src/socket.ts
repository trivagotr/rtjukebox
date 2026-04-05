import { Server } from 'socket.io';

let io: Server;

function normalizeSocketPath(publicBasePath?: string) {
    const trimmed = (publicBasePath || '').trim();
    if (!trimmed || trimmed === '/') {
        return '/socket.io';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalizedBasePath = withLeadingSlash.endsWith('/')
        ? withLeadingSlash.slice(0, -1)
        : withLeadingSlash;

    return `${normalizedBasePath}/socket.io`;
}

export const initIO = (server: any) => {
    io = new Server(server, {
        cors: { origin: '*' },
        path: normalizeSocketPath(process.env.PUBLIC_BASE_PATH),
    });
    return io;
};

export const getIO = () => {
    if (!io) {
        // No-op or throw error. For our routes, we'll handle the optionality.
    }
    return io;
};
