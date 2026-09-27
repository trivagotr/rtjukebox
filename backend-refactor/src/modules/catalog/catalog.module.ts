import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { Environment } from '../../core/config/env.js';
import { PrismaSpotifyConfigRepository } from '../integrations/spotify/infra/prisma-spotify-config.repository.js';
import { SpotifyWebApiAdapter } from '../integrations/spotify/infra/spotify-web-api.adapter.js';
import { PrismaCatalogRepository } from './infra/prisma-catalog.repository.js';
import { createCatalogRouter } from './catalog.router.js';
import { CatalogService } from './catalog.service.js';
import { PrismaModerationAdminRepository } from './infra/prisma-moderation-admin.repository.js';
import { ModerationAdminService } from './moderation/moderation-admin.service.js';
import { createModerationAdminRouter } from './moderation/moderation-admin.router.js';
import { LrclibLyricsAdapter } from '../integrations/spotify/infra/lrclib-lyrics.adapter.js';
import { PrismaCatalogAdminRepository } from './infra/prisma-catalog-admin.repository.js';
import { createCatalogAdminRouter } from './catalog-admin.router.js';
import { PrismaCatalogAssetsRepository } from './infra/prisma-catalog-assets.repository.js';
import { CatalogAssetsService } from './catalog-assets.service.js';
import { createCatalogAssetsAdminRouter } from './catalog-assets.admin-router.js';
import type { StorageService } from '../../core/ports/storage.port.js';
import type { JobQueue } from '../../core/ports/job-queue.port.js';
import { FfprobeAudioProbe } from './infra/ffprobe-audio-probe.js';
import { cryptoIdGenerator } from '../../core/infra/crypto-id-generator.js';

export function createCatalogModule(client: PrismaClient, environment: Environment, storage: StorageService) {
  const repository = new PrismaCatalogRepository(client);
  const spotifyConfig = new PrismaSpotifyConfigRepository(client, environment);
  const spotify = new SpotifyWebApiAdapter(spotifyConfig);
  const service = new CatalogService(repository, spotify);
  const moderationService = new ModerationAdminService(new PrismaModerationAdminRepository(client), new LrclibLyricsAdapter());
  const adminRepository = new PrismaCatalogAdminRepository(client);
  const assets = new CatalogAssetsService(new PrismaCatalogAssetsRepository(client), storage, spotify, new FfprobeAudioProbe(environment.FFPROBE_PATH), cryptoIdGenerator);
  return {
    router: createCatalogRouter(service), service, spotify, moderationAdminRouter: createModerationAdminRouter(moderationService),
    catalogAdminRouter: createCatalogAdminRouter(adminRepository, spotify), moderationService, assets,
    createAssetsAdminRouter: (jobs: JobQueue) => createCatalogAssetsAdminRouter(assets, jobs),
  };
}
