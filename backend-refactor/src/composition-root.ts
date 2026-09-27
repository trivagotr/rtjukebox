import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { loadEnvironment } from './core/config/env.js';
import { createAdminRouter } from './modules/admin/admin.router.js';
import { createIdentityModule } from './modules/identity/identity.module.js';
import { createRadioModule } from './modules/radio/radio.module.js';
import { createDevicesModule } from './modules/devices/devices.module.js';
import { createUsersModule } from './modules/users/users.module.js';
import { createJukeboxModule } from './modules/jukebox/jukebox.module.js';
import { createPodcastsModule } from './modules/podcasts/podcasts.module.js';
import { PrismaAdminAuditRepository } from './modules/admin/infra/prisma-admin-audit.repository.js';
import { createCatalogModule } from './modules/catalog/catalog.module.js';
import { createApiRouter } from './routes/index.js';
import { createPodcastFeedsModule } from './modules/podcasts/podcast-feeds.module.js';
import { BullMqJobQueue } from './modules/jobs/infra/bullmq-job-queue.js';
import { createJobsRouter } from './modules/jobs/jobs.router.js';
import { SocketIoJukeboxEvents } from './modules/jukebox/infra/socket-io-jukebox-events.js';
import { LocalStorageAdapter } from './core/infra/local-storage.adapter.js';
import { createSpotifyModule } from './modules/integrations/spotify/spotify.module.js';

export function createCompositionRoot() {
  const environment = loadEnvironment();
  const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const identityModule = createIdentityModule(prisma, environment);
  const radioModule = createRadioModule(prisma, environment);
  const socketEvents = new SocketIoJukeboxEvents();
  const devicesModule = createDevicesModule(prisma, socketEvents);
  const storage = new LocalStorageAdapter(environment.UPLOAD_DIRECTORY);
  const usersModule = createUsersModule(prisma, identityModule.service, environment, storage);
  const podcastsModule = createPodcastsModule(prisma);
  const catalogModule = createCatalogModule(prisma, environment, storage);
  const jukeboxModule = createJukeboxModule(prisma, environment, catalogModule.spotify, catalogModule.service, socketEvents);
  const spotifyModule = createSpotifyModule(prisma, environment, jukeboxModule.service, devicesModule.service);
  jukeboxModule.service.setPlaybackProvider(spotifyModule.playback);
  const podcastFeedsModule = createPodcastFeedsModule(prisma);
  const jobs = new BullMqJobQueue(environment.REDIS_URL, async (name, payload, updateProgress) => {
    if (name === 'podcast-feed-sync') return payload.feedId ? podcastFeedsModule.service.sync(payload.feedId) : podcastFeedsModule.service.syncAll();
    if (name === 'process-song' && payload.songId) return catalogModule.assets.processSong(payload.songId);
    if (name === 'scan-folder') return catalogModule.assets.scanFolder(updateProgress);
    if (name === 'sync-metadata') return catalogModule.assets.syncMetadata(updateProgress);
    throw new Error('Unsupported background job');
  });
  const adminAuditRepository = new PrismaAdminAuditRepository(prisma);
  const adminRouter = createAdminRouter(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS, adminAuditRepository);
  adminRouter.use('/jukebox', devicesModule.adminRouter);
  adminRouter.use('/jukebox', jukeboxModule.adminRouter);
  adminRouter.use('/jukebox', catalogModule.moderationAdminRouter);
  adminRouter.use('/jukebox', catalogModule.catalogAdminRouter);
  adminRouter.use('/jukebox', catalogModule.createAssetsAdminRouter(jobs));
  adminRouter.use('/spotify', spotifyModule.adminRouter);
  adminRouter.use('/radio-profiles', radioModule.radioProfilesRouter);
  adminRouter.use('/podcast-feeds', podcastFeedsModule.createAdminRouter(jobs));
  const legacyJukeboxAdminRouter = createAdminRouter(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS, adminAuditRepository);
  legacyJukeboxAdminRouter.use('/', devicesModule.adminRouter);
  legacyJukeboxAdminRouter.use('/', jukeboxModule.adminRouter);
  legacyJukeboxAdminRouter.use('/', catalogModule.moderationAdminRouter);
  legacyJukeboxAdminRouter.use('/', catalogModule.catalogAdminRouter);
  legacyJukeboxAdminRouter.use('/', catalogModule.createAssetsAdminRouter(jobs));
  const legacyRadioProfilesAdminRouter = createAdminRouter(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS, adminAuditRepository);
  legacyRadioProfilesAdminRouter.use('/', radioModule.radioProfilesRouter);
  const legacyPodcastFeedsAdminRouter = createAdminRouter(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS, adminAuditRepository);
  legacyPodcastFeedsAdminRouter.use('/', podcastFeedsModule.createAdminRouter(jobs));
  const legacySpotifyAdminRouter = createAdminRouter(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS, adminAuditRepository);
  legacySpotifyAdminRouter.use('/', spotifyModule.adminRouter);
  const apiRouter = createApiRouter({
    identity: identityModule.router,
    legacyAvatar: usersModule.legacyAvatarRouter,
    spotifyPublic: spotifyModule.publicRouter,
    legacySpotifyAdmin: legacySpotifyAdminRouter,
    spotifyKiosk: spotifyModule.kioskRouter,
    admin: adminRouter,
    radio: radioModule.router,
    jukebox: jukeboxModule.router,
    catalog: catalogModule.router,
    deviceEndpoints: devicesModule.jukeboxRouter,
    users: usersModule.router,
    avatar: usersModule.avatarRouter,
    podcasts: podcastsModule.router,
    jukeboxAdmin: legacyJukeboxAdminRouter,
    legacyProfile: usersModule.legacyProfileRouter,
    legacyRadioProfiles: legacyRadioProfilesAdminRouter,
    legacyPodcastFeeds: legacyPodcastFeedsAdminRouter,
    jobs: createJobsRouter(jobs, environment),
  });

  return {
    apiRouter,
    environment,
    prisma,
    jobs,
    storage,
    socketEvents,
    jukeboxService: jukeboxModule.service,
    readinessCheck: async () => {
      await prisma.user.findFirst({ select: { id: true } });
      await jobs.readinessCheck();
    },
  };
}
