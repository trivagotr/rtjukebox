import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

interface VotingWebRouteOptions {
  distPath: string;
  publicBasePath?: string;
}

function noStore(response: express.Response) {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
}

export function registerVotingWebRoutes(app: express.Express, options: VotingWebRouteOptions) {
  const indexPath = path.join(options.distPath, 'index.html');
  const publicBasePath = options.publicBasePath || '';
  const routeRoots = publicBasePath ? ['/vote', `${publicBasePath}/vote`] : ['/vote'];

  const sendIndex: express.RequestHandler = (_request, response, next) => {
    if (!fs.existsSync(indexPath)) return next();
    noStore(response);
    return response.sendFile(indexPath);
  };

  for (const routeRoot of routeRoots) {
    app.use(routeRoot, express.static(options.distPath, {
      index: false,
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('.html')) noStore(response);
        else response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    app.get(routeRoot, sendIndex);
    app.get(`${routeRoot}/`, sendIndex);
    app.get(`${routeRoot}/*`, sendIndex);
  }
}
