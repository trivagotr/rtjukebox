import type { Request, RequestHandler, Response } from 'express';
import type { Environment } from '../../core/config/env.js';
import { UnauthorizedError } from '../../core/errors/app-error.js';
import type { AuthPrincipal } from '../../core/auth/auth.types.js';
import { toIdentityUserDto } from './identity.dto.js';
import type { IdentityService } from './identity.service.js';

function asyncHandler(handler: (req: Parameters<RequestHandler>[0]) => Promise<void>): RequestHandler {
  return (req, _res, next) => {
    void handler(req).catch(next);
  };
}

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function isCookieTransport(req: Request) {
  return req.get('x-auth-transport') === 'cookie';
}

function setAuthCookies(res: Response, environment: Environment, session: Awaited<ReturnType<IdentityService['login']>>) {
  const prefix = environment.PUBLIC_BASE_PATH;
  const secure = environment.NODE_ENV === 'production';
  res.cookie('rtj_access', session.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: prefix ? `${prefix}/api/v1` : '/api/v1',
    maxAge: session.expires_in * 1000,
  });
  if (session.refresh_token) {
    res.cookie('rtj_refresh', session.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: prefix ? `${prefix}/api/v1/auth` : '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  } else {
    res.clearCookie('rtj_refresh', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: prefix ? `${prefix}/api/v1/auth` : '/api/v1/auth',
    });
  }
}

function sessionResponse(
  req: Request,
  res: Response,
  environment: Environment,
  session: Awaited<ReturnType<IdentityService['login']>>,
) {
  const user = toIdentityUserDto(session.user);
  if (isCookieTransport(req)) {
    setAuthCookies(res, environment, session);
    return { user, expires_in: session.expires_in };
  }
  return {
    user,
    access_token: session.access_token,
    ...(session.refresh_token ? { refresh_token: session.refresh_token } : {}),
    expires_in: session.expires_in,
  };
}

export function createIdentityController(service: IdentityService, environment: Environment) {

  return {
    register: asyncHandler(async (req) => {
      const session = await service.register(req.validated!.body as {
        email: string; password: string; display_name: string;
      });
      req.res!.status(201).json({ success: true, data: sessionResponse(req, req.res!, environment, session) });
    }),
    login: asyncHandler(async (req) => {
      const session = await service.login(req.validated!.body as { email: string; password: string });
      req.res!.json({ success: true, data: sessionResponse(req, req.res!, environment, session) });
    }),
    guest: asyncHandler(async (req) => {
      const body = req.validated!.body as { display_name: string };
      const session = await service.createGuest(body.display_name);
      req.res!.status(201).json({ success: true, data: sessionResponse(req, req.res!, environment, session) });
    }),
    refresh: asyncHandler(async (req) => {
      const body = req.validated!.body as { refresh_token?: string };
      const token = body.refresh_token ?? readCookie(req, 'rtj_refresh');
      if (!token) throw new UnauthorizedError('Invalid or expired refresh token');
      const session = await service.refresh(token);
      req.res!.json({ success: true, data: sessionResponse(req, req.res!, environment, session) });
    }),
    logout: asyncHandler(async (req) => {
      const body = req.validated!.body as { refresh_token?: string };
      const token = body.refresh_token ?? readCookie(req, 'rtj_refresh');
      if (token) await service.logout(token);
      if (isCookieTransport(req)) {
        const prefix = environment.PUBLIC_BASE_PATH;
        const cookieOptions = { httpOnly: true, secure: environment.NODE_ENV === 'production', sameSite: 'strict' as const };
        req.res!.clearCookie('rtj_access', { ...cookieOptions, path: prefix ? `${prefix}/api/v1` : '/api/v1' });
        req.res!.clearCookie('rtj_refresh', { ...cookieOptions, path: prefix ? `${prefix}/api/v1/auth` : '/api/v1/auth' });
      }
      req.res!.json({ success: true, data: null });
    }),
    me: asyncHandler(async (req) => {
      const principal = req.user as AuthPrincipal | undefined;
      if (!principal) throw new UnauthorizedError();
      const user = await service.findById(principal.userId);
      req.res!.json({ success: true, data: { user: toIdentityUserDto(user) } });
    }),
  };
}
