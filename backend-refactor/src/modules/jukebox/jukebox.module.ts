import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { Environment } from '../../core/config/env.js';
import { PrismaJukeboxRepository } from './infra/prisma-jukebox.repository.js';
import { createJukeboxRouter } from './jukebox.router.js';
import { JukeboxService } from './jukebox.service.js';
import type { SpotifyCatalogProvider } from '../integrations/spotify/ports/spotify-catalog.port.js';
import type { JukeboxEvents } from './ports/jukebox-events.port.js';
import { createJukeboxAdminRouter } from './jukebox.admin-router.js';
import { systemClock } from '../../core/infra/system-clock.js';

export function createJukeboxModule(client: PrismaClient, environment: Environment, spotify: SpotifyCatalogProvider, catalogAdmission: { canQueueSpotifyTrack(track: import('../integrations/spotify/ports/spotify-catalog.port.js').SpotifyTrack): Promise<boolean> }, events?: JukeboxEvents) {
  const repository = new PrismaJukeboxRepository(client);
  const service = new JukeboxService(repository, spotify, catalogAdmission, systemClock, events);
  return { router: createJukeboxRouter(service, environment), adminRouter: createJukeboxAdminRouter(service), service };
}
