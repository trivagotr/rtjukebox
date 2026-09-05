import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { initIO } from './socket';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import authRoutes from './routes/auth';
import erpIdentityRoutes from './routes/erpIdentity';
import ecosystemRoutes from './routes/ecosystem';
import webAuthRoutes from './routes/webAuth';
import podcastRoutes from './routes/podcasts';
import podcastFeedRoutes from './routes/podcastFeeds';
import radioRoutes from './routes/radio';
import jukeboxRoutes from './routes/jukebox';
import radioProfilesRoutes from './routes/radioProfiles';
import usersRoutes from './routes/users';
import spotifyRoutes from './routes/spotify';
import gamificationRoutes from './routes/gamification';
import economyRoutes from './routes/economy';
import goldAdminRoutes from './routes/goldAdmin';
import studyRoutes, { startStudyChatCleanupJob } from './routes/study';
import { startStudyModerationExpiryJob, studyAdminRoutes, studyPageRoutes } from './routes/studyAdmin';
import profileRoutes from './routes/profile';
import libraryRoutes from './routes/library';
import { authMiddleware } from './middleware/auth';
import { setupSocketHandlers } from './sockets';
import { registerUtilityRoutes } from './utilityRoutes';
import { startRadioHistoryWatcher } from './services/radioHistory';
import { syncPodcastFeed } from './services/podcastFeeds';
import { ensureDefaultPodcastFeeds, getDefaultPodcastFeeds } from './services/defaultPodcastFeeds';
import { db } from './db';
import { resolveCorsOrigins } from './config/cors';
import { registerControllerWebRoutes } from './controllerWebRoutes';
import { assertErpIdentityConfiguration } from './services/erpIdentity';
import { isStudyPlayerApiPath } from './services/studyTrafficPolicy';
import { rateLimitClientIpKey } from './utils/networkAddress';
import { formatRequestLogLine } from './utils/requestLog';

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// Fail fast on missing JWT secrets in non-test environments so the server never
// boots with insecure defaults. Tests are allowed deterministic defaults.
if (!IS_TEST_ENV) {
    const missingSecrets = [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'SOCIAL_ARCADE_NONCE_SECRET',
        'GOLD_ADMIN_IDENTIFIER',
        'GOLD_ADMIN_PASSWORD_HASH',
        'GOLD_ADMIN_AUDIT_HMAC_KEY',
    ].filter(
        (name) => !process.env[name] || !process.env[name]!.trim()
    );
    if (missingSecrets.length > 0) {
        throw new Error(
            `Missing required environment variable(s): ${missingSecrets.join(', ')}. ` +
            'Set them before starting the server.'
        );
    }
    if (process.env.SOCIAL_ARCADE_NONCE_SECRET!.trim().length < 32) {
        throw new Error('SOCIAL_ARCADE_NONCE_SECRET must contain at least 32 characters.');
    }
}
assertErpIdentityConfiguration();

const app = express();
// IIS is the only production proxy hop. This makes req.ip honor forwarded client
// addresses only when the immediate peer is loopback, never from an untrusted hop.
app.set('trust proxy', 'loopback');
const corsOrigin = resolveCorsOrigins(process.env.CORS_ORIGINS, {
    isProduction: process.env.NODE_ENV === 'production' && !IS_TEST_ENV,
});

function normalizePublicBasePath(value?: string) {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === '/') {
        return '';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.endsWith('/')
        ? withLeadingSlash.slice(0, -1)
        : withLeadingSlash;
}

const publicBasePath = normalizePublicBasePath(process.env.PUBLIC_BASE_PATH);
const httpServer = createServer(app);
const io = initIO(httpServer, { corsOrigin });

function mountWithOptionalPublicBase(routePath: string, handler: express.RequestHandler | express.Router) {
    app.use(routePath, handler);
    if (publicBasePath) {
        app.use(`${publicBasePath}${routePath}`, handler);
    }
}

function registerGetWithOptionalPublicBase(routePath: string, handler: express.RequestHandler) {
    app.get(routePath, handler);
    if (publicBasePath) {
        app.get(`${publicBasePath}${routePath}`, handler);
    }
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
}));

app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-RadioTEDU-CSRF', 'X-Study-Admin-Intent']
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(formatRequestLogLine(req));
    next();
});
app.use(rateLimit({
    windowMs: 60000,
    max: 500,
    keyGenerator: (req) => rateLimitClientIpKey(req.ip),
    // Study's normal presence/chat/session polling is authenticated and gets a
    // per-account limiter inside the Study router. Keeping it on this IP-wide
    // limiter would penalize unrelated students sharing a campus/NAT address.
    skip: (req) => isStudyPlayerApiPath(req.path, publicBasePath),
}));
registerUtilityRoutes(app);

// Static: Kiosk Web App
mountWithOptionalPublicBase('/kiosk', express.static(path.join(__dirname, '../../kiosk-web'), {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));
mountWithOptionalPublicBase('/uploads', express.static(path.join(__dirname, '../uploads')));
mountWithOptionalPublicBase('/gold-admin', express.static(path.join(__dirname, '../public/gold-admin'), {
    index: 'index.html',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'");
    },
}));

// Static: Jukebox Web Controller (built SPA). Assets stay under /controller.
// The exact /jukebox page alias is for temporary QR links and does not capture
// /jukebox/* API routes.
const controllerDistPath = path.join(__dirname, '../../jukebox-web-controller/dist');
registerControllerWebRoutes(app, {
    controllerDistPath,
    pageAliases: ['/jukebox'],
    publicBasePath,
});

// Routes
mountWithOptionalPublicBase('/api/v1/auth', authRoutes);
mountWithOptionalPublicBase('/api/v1/auth/erp-link', erpIdentityRoutes);
mountWithOptionalPublicBase('/api/v1/ecosystem', ecosystemRoutes);
mountWithOptionalPublicBase('/api/v1/auth/web', webAuthRoutes);
mountWithOptionalPublicBase('/api/v1/podcasts', podcastRoutes);
mountWithOptionalPublicBase('/api/v1/podcast-feeds', podcastFeedRoutes);
mountWithOptionalPublicBase('/api/v1/radio', radioRoutes);
mountWithOptionalPublicBase('/api/v1/radio-profiles', radioProfilesRoutes);

// Jukebox: Kiosk endpoints (no auth required)
app.use('/jukebox', jukeboxRoutes);

// Jukebox: User endpoints (auth handled per-route in jukeboxRoutes)
mountWithOptionalPublicBase('/api/v1/jukebox', jukeboxRoutes);
mountWithOptionalPublicBase('/api/v1/users', usersRoutes);
mountWithOptionalPublicBase('/api/v1/spotify', spotifyRoutes);
mountWithOptionalPublicBase('/api/v1/gamification', gamificationRoutes);
mountWithOptionalPublicBase('/api/v1/economy', economyRoutes);
mountWithOptionalPublicBase('/api/v1/gold-admin', goldAdminRoutes);
mountWithOptionalPublicBase('/api/v1/study/pages', studyPageRoutes);
mountWithOptionalPublicBase('/api/v1/study/admin', studyAdminRoutes);
mountWithOptionalPublicBase('/api/v1/study', studyRoutes);
mountWithOptionalPublicBase('/api/v1/profile', libraryRoutes);
mountWithOptionalPublicBase('/api/v1/profile', profileRoutes);

// Health check
registerGetWithOptionalPublicBase('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.IO
setupSocketHandlers(io);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global Error Handler:', err);
    return res.status(err.status || 500).json({
        success: false,
        error: err.name || 'InternalServerError',
        message: err.message || 'An unexpected error occurred'
    });
});

// Background tasks (never started under tests to keep the suite deterministic
// and avoid open timers / live network or DB calls).
function startBackgroundTasks() {
    startStudyModerationExpiryJob();
    startStudyChatCleanupJob();
    // Radio now-playing history watcher + periodic cleanup.
    startRadioHistoryWatcher();

    // Periodic podcast RSS sync.
    const podcastSyncIntervalHours = Number(process.env.PODCAST_SYNC_INTERVAL_HOURS) || 6;
    const podcastSyncIntervalMs = podcastSyncIntervalHours * 60 * 60 * 1000;

    async function runPodcastSync() {
        try {
            await ensureDefaultPodcastFeeds(db, getDefaultPodcastFeeds(process.env.DEFAULT_PODCAST_FEEDS));
            const result = await db.query(
                'SELECT id, feed_url, title FROM podcast_feeds WHERE is_active = true'
            );
            for (const feed of result.rows) {
                try {
                    await syncPodcastFeed(db, {
                        id: feed.id,
                        feedUrl: feed.feed_url,
                        title: feed.title,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'unknown error';
                    console.error(`[podcastSync] Failed to sync feed "${feed.id}":`, message);
                }
            }
        } catch (error) {
            console.error('[podcastSync] Failed to load podcast feeds for sync:', error);
        }
    }

    // Initial sync shortly after startup, then on a fixed interval.
    const initialSyncTimer = setTimeout(() => {
        void runPodcastSync();
    }, 30_000);
    if (typeof initialSyncTimer.unref === 'function') {
        initialSyncTimer.unref();
    }

    const podcastSyncTimer = setInterval(() => {
        void runPodcastSync();
    }, podcastSyncIntervalMs);
    if (typeof podcastSyncTimer.unref === 'function') {
        podcastSyncTimer.unref();
    }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

if (!IS_TEST_ENV) {
    startBackgroundTasks();
}

// io is now accessed via getIO() in other modules
