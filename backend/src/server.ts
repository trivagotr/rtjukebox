import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { initIO } from './socket';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import podcastRoutes from './routes/podcasts';
import podcastFeedRoutes from './routes/podcastFeeds';
import radioRoutes from './routes/radio';
import jukeboxRoutes, { reconcileStoppedSpotifyPlaybackForDevice } from './routes/jukebox';
import radioProfilesRoutes from './routes/radioProfiles';
import usersRoutes from './routes/users';
import spotifyRoutes from './routes/spotify';
import gamificationRoutes from './routes/gamification';
import profileRoutes from './routes/profile';
import jobsRoutes from './routes/jobs';
import { setupSocketHandlers } from './sockets';
import { registerUtilityRoutes } from './utilityRoutes';
import { startRadioHistoryWatcher } from './services/radioHistory';
import { ensureDefaultPodcastFeeds, getDefaultPodcastFeeds } from './services/defaultPodcastFeeds';
import { db } from './db';
import { enqueueBackgroundJob, runWithLeaderLease, startBackgroundJobs, stopBackgroundJobs } from './services/backgroundJobs';
import { runMetadataSyncJob, runProcessSongJob, runScanFolderJob } from './routes/jukebox';
import { runPodcastFeedSyncJob } from './routes/podcastFeeds';
import { resolveCorsOrigins } from './config/cors';
import { requestIdMiddleware } from './middleware/requestId';
import { globalApiRateLimit, readRateLimit, startRateLimitRedis, stopRateLimitRedis } from './middleware/rateLimits';
import { logger, requestLogger } from './logger';

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
app.set('trust proxy', 1);
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
app.use(requestIdMiddleware);
app.use(requestLogger);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
    origin: corsOrigin === '*' ? true : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-transport', 'x-guest-fingerprint', 'x-kiosk-credential']
}));
app.use(express.json({ limit: '1mb' }));
app.use(globalApiRateLimit);
app.use('/api/v1', (req, res, next) => req.method === 'GET' ? readRateLimit(req, res, next) : next());
registerUtilityRoutes(app, publicBasePath);

// Static: Kiosk Web App
mountWithOptionalPublicBase('/kiosk', express.static(path.join(__dirname, '../../kiosk-web'), {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));
mountWithOptionalPublicBase('/uploads', express.static(path.join(__dirname, '../uploads'), {
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    }
}));

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

// Legacy API alias kept only for kiosk endpoints during the client transition.
// Static kiosk files are served above; API requests move to the canonical path.
app.use('/jukebox/kiosk', (req, res) => {
    return res.redirect(308, `/api/v1/jukebox/kiosk${req.url}`);
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/podcasts', podcastRoutes);
app.use('/api/v1/podcast-feeds', podcastFeedRoutes);
app.use('/api/v1/radio', radioRoutes);
if (process.env.RADIO_PROFILES_ENABLED === 'true') {
    app.use('/api/v1/radio-profiles', radioProfilesRoutes);
}
app.use('/api/v1/jukebox', jukeboxRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/spotify', spotifyRoutes);
app.use('/api/v1/gamification', gamificationRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/jobs', jobsRoutes);

// Socket.IO
setupSocketHandlers(io);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const statusCode = Number(err?.statusCode ?? err?.status);
    const isClientError = statusCode >= 400 && statusCode < 500;
    const status = isClientError ? statusCode : 500;
    logger.error({
        event: 'request_error',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: status,
        errorName: typeof err?.name === 'string' ? err.name : 'Error',
    }, 'Request failed');
    return res.status(status).json({
        success: false,
        code: status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
        message: status === 413 ? 'Request body is too large' : status === 400 ? 'Invalid request' : 'Internal server error',
        requestId: req.requestId,
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
        await runWithLeaderLease('podcast-sync', 60_000, async () => {
            try {
                await ensureDefaultPodcastFeeds(db, getDefaultPodcastFeeds(process.env.DEFAULT_PODCAST_FEEDS));
                await enqueueBackgroundJob('podcast-feed-sync', { requestedBy: 'system' });
            } catch (error) {
                console.error('[podcastSync] Failed to queue podcast feed sync:', error instanceof Error ? error.name : 'Error');
            }
        });
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

    // Periodic Spotify playback reconciliation for active jukebox devices (every 5 seconds)
    const spotifyReconciliationIntervalMs = 5000;
    let isReconcilingSpotify = false;
    const spotifyReconcileTimer = setInterval(async () => {
        if (isReconcilingSpotify) return;
        isReconcilingSpotify = true;
        try {
            await runWithLeaderLease('spotify-reconciliation', 15_000, async () => {
                const activeDevicesResult = await db.query(
                    `SELECT id FROM devices WHERE is_active = true AND spotify_playback_device_id IS NOT NULL`
                );
                for (const row of activeDevicesResult.rows) {
                    try {
                        await reconcileStoppedSpotifyPlaybackForDevice({ deviceId: row.id });
                    } catch (recErr: any) {
                        // Suppress transient noise
                    }
                }
            });
        } catch (dbErr: any) {
            // DB query error
        } finally {
            isReconcilingSpotify = false;
        }
    }, spotifyReconciliationIntervalMs);
    if (typeof spotifyReconcileTimer.unref === 'function') {
        spotifyReconcileTimer.unref();
    }
}

const PORT = process.env.PORT || 3000;
if (!IS_TEST_ENV) {
    void startRateLimitRedis();
    void startBackgroundJobs(async (name, payload, job) => {
        switch (name) {
            case 'scan-folder':
                return runScanFolderJob((progress) => job.updateProgress(progress));
            case 'process-song': {
                if (!payload.songId) throw new Error('song_id is required');
                await job.updateProgress(10);
                const processed = await runProcessSongJob(payload.songId);
                await job.updateProgress(100);
                return processed;
            }
            case 'sync-metadata': {
                await job.updateProgress(5);
                const metadata = await runMetadataSyncJob(payload.songId);
                await job.updateProgress(100);
                return metadata;
            }
            case 'podcast-feed-sync':
                return runPodcastFeedSyncJob(payload.feedId, (progress) => job.updateProgress(progress));
            default:
                throw new Error('Unknown background job');
        }
    }).then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
        startBackgroundTasks();
    });
}

async function shutdown() {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await stopBackgroundJobs();
    await stopRateLimitRedis();
}

if (!IS_TEST_ENV) {
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
}

export { app, httpServer };
// io is now accessed via getIO() in other modules
