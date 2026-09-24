import type { RequestHandler } from 'express';
import { toIdentityUserDto } from './identity.dto.js';
import type { IdentityService } from './identity.service.js';

function asyncHandler(handler: (req: Parameters<RequestHandler>[0]) => Promise<void>): RequestHandler {
  return (req, _res, next) => {
    void handler(req).catch(next);
  };
}

export function createIdentityController(service: IdentityService) {
  const sessionResponse = (session: Awaited<ReturnType<IdentityService['login']>>) => ({
    user: toIdentityUserDto(session.user),
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
  });

  return {
    register: asyncHandler(async (req) => {
      const session = await service.register(req.validated!.body as {
        email: string; password: string; display_name: string;
      });
      req.res!.status(201).json({ success: true, data: sessionResponse(session) });
    }),
    login: asyncHandler(async (req) => {
      const session = await service.login(req.validated!.body as { email: string; password: string });
      req.res!.json({ success: true, data: sessionResponse(session) });
    }),
    guest: asyncHandler(async (req) => {
      const body = req.validated!.body as { display_name: string };
      const session = await service.createGuest(body.display_name);
      req.res!.status(201).json({ success: true, data: sessionResponse(session) });
    }),
    refresh: asyncHandler(async (req) => {
      const body = req.validated!.body as { refresh_token: string };
      const session = await service.refresh(body.refresh_token);
      req.res!.json({ success: true, data: sessionResponse(session) });
    }),
    logout: asyncHandler(async (req) => {
      const body = req.validated!.body as { refresh_token: string };
      await service.logout(body.refresh_token);
      req.res!.json({ success: true, data: null });
    }),
  };
}
