import express from 'express';
import fs from 'fs';
import path from 'path';

interface ControllerWebRouteOptions {
  controllerDistPath: string;
  pageAliases?: string[];
  publicBasePath?: string;
}

function withLeadingSlash(routePath: string) {
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

function withPublicBase(publicBasePath: string, routePath: string) {
  return `${publicBasePath}${routePath}`;
}

export function registerControllerWebRoutes(app: express.Express, options: ControllerWebRouteOptions) {
  const controllerIndexPath = path.join(options.controllerDistPath, 'index.html');
  const publicBasePath = options.publicBasePath || '';

  const registerUse = (routePath: string, handler: express.RequestHandler | express.Router) => {
    app.use(routePath, handler);
    if (publicBasePath) {
      app.use(withPublicBase(publicBasePath, routePath), handler);
    }
  };

  const registerGet = (routePath: string, handler: express.RequestHandler) => {
    app.get(routePath, handler);
    if (publicBasePath) {
      app.get(withPublicBase(publicBasePath, routePath), handler);
    }
  };

  const sendControllerIndex: express.RequestHandler = (req, res, next) => {
    if (!fs.existsSync(controllerIndexPath)) {
      return next();
    }
    return res.sendFile(controllerIndexPath);
  };

  registerUse('/controller', express.static(options.controllerDistPath));
  registerGet('/controller/*', sendControllerIndex);

  for (const alias of options.pageAliases || []) {
    registerGet(withLeadingSlash(alias), sendControllerIndex);
  }
}
