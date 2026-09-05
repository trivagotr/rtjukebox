import express from 'express';
import {existsSync} from 'fs';

interface VotingPublicAssetRouteOptions {
  fallbackLogoPath: string;
  publicBasePath?: string;
}

export function registerVotingPublicAssetRoutes(
  app: express.Express,
  options: VotingPublicAssetRouteOptions,
) {
  if (!existsSync(options.fallbackLogoPath)) {
    throw new Error('Voting fallback asset is unavailable');
  }
  const routePath = '/uploads/next-song-voting/fallback.png';
  const sendFallbackLogo: express.RequestHandler = (_request, response) => {
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.type('png').sendFile(options.fallbackLogoPath);
  };

  app.get(routePath, sendFallbackLogo);
  if (options.publicBasePath) {
    app.get(`${options.publicBasePath}${routePath}`, sendFallbackLogo);
  }
}
