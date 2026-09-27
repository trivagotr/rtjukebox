import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import type { Environment } from '../../../core/config/env.js';
import { verifyAccessToken } from '../../../core/auth/auth.middleware.js';
import type { AuthPrincipal } from '../../../core/auth/auth.types.js';
import type { JukeboxService } from '../jukebox.service.js';
import type { SocketIoJukeboxEvents } from './socket-io-jukebox-events.js';

const deviceIdSchema = z.string().uuid();
const joinSchema = z.union([deviceIdSchema, z.object({ device_id: deviceIdSchema }).strict()]);
const playbackProgressSchema = z.object({
  device_id: deviceIdSchema,
  currentTime: z.number().finite().min(0).max(86_400),
  duration: z.number().finite().min(0).max(86_400),
  percent: z.number().finite().min(0).max(100),
}).strict();
const kioskHeartbeatSchema = z.object({ device_id: deviceIdSchema, timestamp: z.number().finite() }).strict();
type SocketIdentity = { principal?: AuthPrincipal; kiosk?: { deviceId: string; credential: string } };

function accessCookie(cookieHeader: string | undefined) {
  for (const part of (cookieHeader ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== 'rtj_access') continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function tokenExpiration(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isInteger(payload.exp) ? payload.exp : null;
  } catch { return null; }
}

export function attachJukeboxSocketServer(server: HttpServer, environment: Environment, jukebox: JukeboxService, events: SocketIoJukeboxEvents) {
  const io = new Server(server, {
    path: `${environment.PUBLIC_BASE_PATH || ''}/socket.io`,
    cors: { origin: environment.CORS_ORIGINS.length ? environment.CORS_ORIGINS : false, credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });
  events.attach(io);

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown; device_id?: unknown; kiosk_credential?: unknown };
    const token = typeof auth.token === 'string' ? auth.token : accessCookie(socket.handshake.headers.cookie);
    const principal = token ? verifyAccessToken(token, environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS) : null;
    if (principal) {
      socket.data.identity = { principal } satisfies SocketIdentity;
      socket.data.expiresAt = tokenExpiration(token!);
      next();
      return;
    }
    if (typeof auth.device_id === 'string' && z.string().uuid().safeParse(auth.device_id).success && typeof auth.kiosk_credential === 'string') {
      const kiosk = { deviceId: auth.device_id, credential: auth.kiosk_credential };
      try {
        if (await jukebox.canReadQueue({ deviceId: kiosk.deviceId, isAdmin: false, kioskCredential: kiosk.credential })) {
          socket.data.identity = { kiosk } satisfies SocketIdentity;
          next();
          return;
        }
      } catch { /* Authentication failures stay opaque to the client. */ }
    }
    next(new Error('Unauthorized'));
  });

  io.on('connection', (socket) => {
    const eventCounts = new Map<string, { count: number; startedAt: number }>();
    const allowEvent = (name: string, limit: number, windowMs: number) => {
      const now = Date.now();
      const current = eventCounts.get(name);
      if (!current || now - current.startedAt >= windowMs) {
        eventCounts.set(name, { count: 1, startedAt: now });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    };
    const identity = socket.data.identity as SocketIdentity | undefined;
    const expiration = socket.data.expiresAt as number | null | undefined;
    const expiryTimer = expiration ? setTimeout(() => socket.disconnect(true), Math.max(0, expiration * 1000 - Date.now())) : null;
    const kioskCredentialWatchdog = identity?.kiosk
      ? setInterval(() => {
        void jukebox.canReadQueue({ deviceId: identity.kiosk!.deviceId, isAdmin: false, kioskCredential: identity.kiosk!.credential })
          .then((valid) => { if (!valid) socket.disconnect(true); })
          .catch(() => socket.disconnect(true));
      }, 60_000)
      : null;
    socket.once('disconnect', () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      if (kioskCredentialWatchdog) clearInterval(kioskCredentialWatchdog);
    });
    socket.on('join_device', async (value: unknown, acknowledge?: (result: { success: boolean }) => void) => {
      if (!allowEvent('join_device', 10, 60_000)) { socket.disconnect(true); return; }
      const parsed = joinSchema.safeParse(value);
      if (!parsed.success) { acknowledge?.({ success: false }); return; }
      const identity = socket.data.identity as SocketIdentity | undefined;
      if (!identity) { acknowledge?.({ success: false }); return; }
      const requestedDevice = typeof parsed.data === 'string' ? parsed.data : parsed.data.device_id;
      if (identity.kiosk && identity.kiosk.deviceId !== requestedDevice) { acknowledge?.({ success: false }); return; }
      const authorized = await jukebox.canReadQueue({
        deviceId: requestedDevice,
        userId: identity.principal?.userId,
        isAdmin: identity.principal?.roles.includes('ADMIN') ?? false,
        kioskCredential: identity.kiosk?.credential,
      }).catch(() => false);
      if (!authorized) { acknowledge?.({ success: false }); return; }
      for (const room of socket.rooms) if (room.startsWith('device:')) await socket.leave(room);
      await socket.join(`device:${requestedDevice}`);
      acknowledge?.({ success: true });
    });
    socket.on('leave_device', async (value: unknown) => {
      if (!allowEvent('leave_device', 10, 60_000)) { socket.disconnect(true); return; }
      const parsed = deviceIdSchema.safeParse(value);
      if (!parsed.success) return;
      const room = `device:${parsed.data}`;
      if (socket.rooms.has(room)) await socket.leave(room);
    });
    socket.on('playback_progress', (value: unknown) => {
      if (!allowEvent('playback_progress', 180, 60_000)) return;
      const parsed = playbackProgressSchema.safeParse(value);
      const identity = socket.data.identity as SocketIdentity | undefined;
      const kiosk = identity?.kiosk;
      if (!parsed.success || !kiosk || parsed.data.device_id !== kiosk.deviceId || !socket.rooms.has(`device:${kiosk.deviceId}`)) return;
      events.playbackProgress(kiosk.deviceId, { currentTime: parsed.data.currentTime, duration: parsed.data.duration, percent: parsed.data.percent });
    });
    socket.on('kiosk_heartbeat', async (value: unknown) => {
      if (!allowEvent('kiosk_heartbeat', 6, 60_000)) return;
      const parsed = kioskHeartbeatSchema.safeParse(value);
      const identity = socket.data.identity as SocketIdentity | undefined;
      const kiosk = identity?.kiosk;
      if (!parsed.success || !kiosk || parsed.data.device_id !== kiosk.deviceId
          || Math.abs(Date.now() - parsed.data.timestamp) > 120_000
          || !socket.rooms.has(`device:${kiosk.deviceId}`)) return;
      try {
        await jukebox.kioskHeartbeat({ deviceId: kiosk.deviceId, credential: kiosk.credential });
        events.kioskHeartbeat(kiosk.deviceId, parsed.data.timestamp);
      } catch { socket.disconnect(true); }
    });
  });
  return io;
}
