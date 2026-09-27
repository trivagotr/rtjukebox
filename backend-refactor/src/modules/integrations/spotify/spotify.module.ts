import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { Environment } from '../../../core/config/env.js';
import type { DevicesService } from '../../devices/devices.service.js';
import type { JukeboxService } from '../../jukebox/jukebox.service.js';
import { LrclibLyricsAdapter } from './infra/lrclib-lyrics.adapter.js';
import { PrismaSpotifyConfigRepository } from './infra/prisma-spotify-config.repository.js';
import { PrismaSpotifyOAuthRepository } from './infra/prisma-spotify-oauth.repository.js';
import { SpotifyOAuthService } from './spotify-oauth.service.js';
import { SpotifyPlaybackProvider } from './infra/spotify-playback-provider.adapter.js';
import { createSpotifyRouters } from './spotify.router.js';
import { systemClock } from '../../../core/infra/system-clock.js';
import { SpotifyOAuthHttpAdapter } from './infra/spotify-oauth-http.adapter.js';

export function createSpotifyModule(client: PrismaClient, environment: Environment, jukebox: JukeboxService, devices: DevicesService) {
  const config = new PrismaSpotifyConfigRepository(client, environment);
  const repository = new PrismaSpotifyOAuthRepository(client, environment);
  const service = new SpotifyOAuthService(config, repository, environment, systemClock, new SpotifyOAuthHttpAdapter());
  const playback = new SpotifyPlaybackProvider(service);
  const lyrics = new LrclibLyricsAdapter();
  return { service, playback, config, ...createSpotifyRouters(service, playback, jukebox, devices, lyrics, environment) };
}
