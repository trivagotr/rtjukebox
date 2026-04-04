import { Express, Request, Response } from 'express';

export function registerUtilityRoutes(app: Express) {
  const sendNoContent = (_req: Request, res: Response) => {
    res.status(204).end();
  };

  app.get('/favicon.ico', sendNoContent);
  app.get('/.well-known/appspecific/com.chrome.devtools.json', sendNoContent);
}
