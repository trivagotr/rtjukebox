import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { db } from './db';
import { JWT_SECRET } from './middleware/auth';
import { CorsOrigin, resolveCorsOrigins } from './config/cors';
import { kioskSecretMatches } from './services/kioskCredentials';

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

    io.use(async (socket, next) => {
        const auth = socket.handshake.auth ?? {};
        const accessToken = typeof auth.token === 'string' ? auth.token : '';
        if (accessToken) {
            try {
                const user = jwt.verify(accessToken, JWT_SECRET, { algorithms: ['HS256'] }) as {
                    id?: string;
                    role?: string;
                    exp?: number;
                };
                if (user.id && ['user', 'guest', 'moderator', 'admin'].includes(user.role ?? '')) {
                    socket.data.role = user.role;
                    socket.data.userId = user.id;
                    socket.data.tokenExpiresAt = user.exp;
                    return next();
                }
            } catch {
                // Invalid user tokens do not grant access; the kiosk credential path is checked below.
            }
        }

        const deviceId = typeof auth.deviceId === 'string' ? auth.deviceId : '';
        const devicePassword = typeof auth.devicePassword === 'string' ? auth.devicePassword : '';
        if (!deviceId || !devicePassword) return next(new Error('Unauthorized'));

        try {
            const result = await db.query(
                `SELECT d.id, d.is_active, kc.credential_hash, kc.expires_at
                 FROM devices d
                 JOIN kiosk_credentials kc ON kc.device_id = d.id
                 WHERE d.id = $1 AND kc.revoked_at IS NULL AND kc.expires_at > NOW()`,
                [deviceId],
            );
            const device = result.rows[0];
            if (!device || !device.is_active) {
                return next(new Error('Unauthorized'));
            }

            if (!kioskSecretMatches(device.credential_hash, devicePassword)) {
                return next(new Error('Unauthorized'));
            }

            socket.data.role = 'kiosk';
            socket.data.deviceId = device.id;
            socket.data.credentialExpiresAt = Math.floor(new Date(device.expires_at).getTime() / 1000);
            return next();
        } catch {
            return next(new Error('Unauthorized'));
        }
    });
    return io;
};

export const getIO = () => {
    if (!io) {
        // No-op or throw error. For our routes, we'll handle the optionality.
    }
    return io;
};
