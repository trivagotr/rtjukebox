import { Router } from 'express';

export interface ApiRouters {
  identity: Router;
  legacyAvatar: Router;
  spotifyPublic: Router;
  legacySpotifyAdmin: Router;
  spotifyKiosk: Router;
  admin: Router;
  radio: Router;
  jukebox: Router;
  catalog: Router;
  deviceEndpoints: Router;
  users: Router;
  avatar: Router;
  podcasts: Router;
  jukeboxAdmin: Router;
  legacyProfile: Router;
  legacyRadioProfiles: Router;
  legacyPodcastFeeds: Router;
  jobs: Router;
}

export function createApiRouter(routers: ApiRouters): Router {
  const router = Router();
  router.use('/auth', routers.identity);
  router.use('/auth', routers.legacyAvatar);
  router.use('/spotify', routers.spotifyPublic);
  router.use('/spotify', routers.legacySpotifyAdmin);
  router.use('/admin', routers.admin);
  router.use('/radio', routers.radio);
  router.use('/jukebox', routers.jukebox);
  router.use('/jukebox', routers.catalog);
  router.use('/jukebox', routers.deviceEndpoints);
  router.use('/jukebox', routers.spotifyKiosk);
  router.use('/jukebox/admin', routers.jukeboxAdmin);
  router.use('/users', routers.users);
  router.use('/users', routers.avatar);
  router.use('/profile', routers.legacyProfile);
  router.use('/radio-profiles', routers.legacyRadioProfiles);
  router.use('/podcast-feeds', routers.legacyPodcastFeeds);
  router.use('/podcasts', routers.podcasts);
  router.use('/jobs', routers.jobs);
  return router;
}
