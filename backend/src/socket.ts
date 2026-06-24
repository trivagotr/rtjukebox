import { Server } from 'socket.io';
import { CorsOrigin, resolveCorsOrigins } from './config/cors';

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

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

export const initIO = (server: any, options: { corsOrigin?: CorsOrigin } = {}) => {
    const corsOrigin = options.corsOrigin ?? resolveCorsOrigins(process.env.CORS_ORIGINS, {
        isProduction: process.env.NODE_ENV === 'production' && !IS_TEST_ENV,
    });

    io = new Server(server, {
        cors: { origin: corsOrigin },
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
