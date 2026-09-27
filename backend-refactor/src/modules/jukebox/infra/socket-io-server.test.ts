import { createServer } from 'node:http';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '../../../core/config/env.js';
import type { JukeboxService } from '../jukebox.service.js';
import { SocketIoJukeboxEvents } from './socket-io-jukebox-events.js';
import { attachJukeboxSocketServer } from './socket-io-server.js';

const deviceId = '5e25467d-70d9-433a-aafd-9b6b839cd530';
const clients: Socket[] = [];
const closeHandlers: Array<() => Promise<void>> = [];

async function connectKiosk() {
  const httpServer = createServer();
  const events = new SocketIoJukeboxEvents();
  const jukebox = {
    canReadQueue: vi.fn().mockResolvedValue(true),
    kioskHeartbeat: vi.fn().mockResolvedValue(undefined),
  } as unknown as JukeboxService;
  const environment = { CORS_ORIGINS: [], PUBLIC_BASE_PATH: '/radio', JWT_SECRET: 'a'.repeat(32), JWT_ISSUER: 'test-issuer', JWT_AUDIENCE: 'test-client', JWT_ALLOW_LEGACY_TOKENS: false } as unknown as Environment;
  const io = attachJukeboxSocketServer(httpServer, environment, jukebox, events);
  httpServer.listen(0);
  await new Promise<void>((resolve) => httpServer.once('listening', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Socket test server did not bind');
  closeHandlers.push(() => new Promise<void>((resolve) => io.close(() => resolve())));
  const client = createClient(`http://127.0.0.1:${address.port}`, {
    auth: { device_id: deviceId, kiosk_credential: 'test-kiosk-credential' },
    path: '/radio/socket.io',
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return { client, jukebox };
}

async function joinDevice(client: Socket) {
  await new Promise<void>((resolve, reject) => {
    client.emit('join_device', deviceId, (result: { success: boolean }) => result.success ? resolve() : reject(new Error('Device join was denied')));
  });
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await Promise.all(closeHandlers.splice(0).map((close) => close()));
});

describe('Socket.IO kiosk compatibility events', () => {
  it('accepts the active kiosk raw-UUID join payload and relays playback progress', async () => {
    const { client } = await connectKiosk();
    await joinDevice(client);
    const progress = new Promise<{ device_id: string; currentTime: number; duration: number; percent: number }>((resolve) => client.once('playback_progress', resolve));
    client.emit('playback_progress', { device_id: deviceId, currentTime: 12.5, duration: 180, percent: 6.94 });
    await expect(progress).resolves.toEqual({ device_id: deviceId, currentTime: 12.5, duration: 180, percent: 6.94 });
  });

  it('accepts a fresh authenticated kiosk heartbeat and broadcasts it', async () => {
    const { client, jukebox } = await connectKiosk();
    await joinDevice(client);
    const timestamp = Date.now();
    const heartbeat = new Promise<{ device_id: string; timestamp: number }>((resolve) => client.once('kiosk_heartbeat', resolve));
    client.emit('kiosk_heartbeat', { device_id: deviceId, timestamp });
    await expect(heartbeat).resolves.toEqual({ device_id: deviceId, timestamp });
    expect(jukebox.kioskHeartbeat).toHaveBeenCalledWith({ deviceId, credential: 'test-kiosk-credential' });
  });
});
