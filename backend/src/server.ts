import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { initIO } from './socket';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import podcastRoutes from './routes/podcasts';
import podcastFeedRoutes from './routes/podcastFeeds';
import radioRoutes from './routes/radio';
import jukeboxRoutes from './routes/jukebox';
import radioProfilesRoutes from './routes/radioProfiles';
import usersRoutes from './routes/users';
import spotifyRoutes from './routes/spotify';
import gamificationRoutes from './routes/gamification';
import profileRoutes from './routes/profile';
import { authMiddleware } from './middleware/auth';
import { setupSocketHandlers } from './sockets';
import { registerUtilityRoutes } from './utilityRoutes';
import { startRadioHistoryWatcher } from './services/radioHistory';
import { syncPodcastFeed } from './services/podcastFeeds';
import { ensureDefaultPodcastFeeds, getDefaultPodcastFeeds } from './services/defaultPodcastFeeds';
import { db } from './db';
import { resolveCorsOrigins } from './config/cors';

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

// Fail fast on missing JWT secrets in non-test environments so the server never
// boots with insecure defaults. Tests are allowed deterministic defaults.
if (!IS_TEST_ENV) {
    const missingSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET'].filter(
        (name) => !process.env[name] || !process.env[name]!.trim()
    );
    if (missingSecrets.length > 0) {
        throw new Error(
            `Missing required environment variable(s): ${missingSecrets.join(', ')}. ` +
            'Set them before starting the server.'
        );
    }
}

const app = express();
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
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use(rateLimit({ windowMs: 60000, max: 500 }));
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

// Static: Jukebox Web Controller (built SPA). Mounted at /controller to avoid
// colliding with the /jukebox API routes. Safe to start even when dist/ is absent.
const controllerDistPath = path.join(__dirname, '../../jukebox-web-controller/dist');
const controllerIndexPath = path.join(controllerDistPath, 'index.html');
mountWithOptionalPublicBase('/controller', express.static(controllerDistPath));
registerGetWithOptionalPublicBase('/controller/*', (req, res, next) => {
    if (!fs.existsSync(controllerIndexPath)) {
        return next();
    }
    return res.sendFile(controllerIndexPath);
});

// Routes
mountWithOptionalPublicBase('/api/v1/auth', authRoutes);
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
