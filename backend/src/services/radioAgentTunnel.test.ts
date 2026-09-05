import {createHmac, randomUUID} from 'node:crypto';
import {createServer, Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import WebSocket, {RawData} from 'ws';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  buildRadioAgentConnectPaths,
  createRadioAgentTunnel,
  RADIO_AGENT_PROTOCOL,
  RadioAgentHandshakeVerifier,
  RadioAgentTunnel,
  verifyRadioAgentHandshake,
  type RadioAgentRequestContext,
  type RadioAgentTunnelOptions,
} from './radioAgentTunnel';

const SECRET = 'radio-agent-test-secret-which-is-never-production';
const AGENT_ID = 'school-radio-pc';
const CAPABILITIES = ['radio.playout', 'radio.voting', 'radio.cover-art', 'radio.heartbeat'];

interface Harness {
  server: Server;
  tunnel: RadioAgentTunnel;
  port: number;
  clients: Set<WebSocket>;
  nextTimestamp: () => number;
  cleanup: () => Promise<void>;
}

const harnesses = new Set<Harness>();

function signature(agentId: string, timestamp: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${agentId}:${timestamp}`).digest('base64url');
}

async function createHarness(options: Partial<RadioAgentTunnelOptions> = {}): Promise<Harness> {
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const tunnel = createRadioAgentTunnel({
    requestSecret: SECRET,
    allowedAgentIds: [AGENT_ID],
    audit: vi.fn(),
    ...options,
  }).attach(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const clients = new Set<WebSocket>();
  let timestampOffset = -20;
  const harness: Harness = {
    server,
    tunnel,
    port,
    clients,
    nextTimestamp: () => Math.floor(Date.now() / 1000) + timestampOffset++,
    cleanup: async () => {
      for (const client of clients) client.terminate();
      clients.clear();
      tunnel.close();
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      harnesses.delete(harness);
    },
  };
  harnesses.add(harness);
  return harness;
}

async function openSocket(
  harness: Harness,
  options: {agentId?: string; path?: string; timestamp?: number; signature?: string} = {},
): Promise<WebSocket> {
  const agentId = options.agentId ?? AGENT_ID;
  const timestamp = options.timestamp ?? harness.nextTimestamp();
  const client = new WebSocket(`ws://127.0.0.1:${harness.port}${options.path ?? '/api/v1/next-song-voting/agent/connect'}`, {
    headers: {
      'x-radio-agent-id': agentId,
      'x-radio-agent-timestamp': String(timestamp),
      'x-radio-agent-signature': options.signature ?? signature(agentId, timestamp),
    },
  });
  harness.clients.add(client);
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  return client;
}

async function connectAgent(
  harness: Harness,
  options: {path?: string; timestamp?: number} = {},
): Promise<WebSocket> {
  const client = await openSocket(harness, options);
  client.send(JSON.stringify({
    protocol: RADIO_AGENT_PROTOCOL,
    type: 'agent_connect',
    agent_id: AGENT_ID,
    capabilities: CAPABILITIES,
  }));
  await waitUntil(() => harness.tunnel.isAgentConnected(AGENT_ID));
  return client;
}

function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('test_wait_timeout'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

function waitForMessage(
  client: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 1_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error('test_message_timeout'));
    }, timeoutMs);
    const onMessage = (raw: RawData) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!predicate(parsed)) return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(parsed);
    };
    client.on('message', onMessage);
  });
}

function waitForClose(client: WebSocket, timeoutMs = 1_000): Promise<{code: number; reason: string}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test_close_timeout')), timeoutMs);
    client.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({code, reason: reason.toString()});
    });
  });
}

afterEach(async () => {
  await Promise.all([...harnesses].map((harness) => harness.cleanup()));
});

describe('radio agent tunnel handshake authentication', () => {
  it('accepts a valid HMAC-SHA256 base64url handshake', () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = Math.floor(nowMs / 1000);
    expect(verifyRadioAgentHandshake({
      agentId: AGENT_ID,
      timestamp: String(timestamp),
      signature: signature(AGENT_ID, timestamp),
    }, {
      secret: SECRET,
      allowedAgentIds: [AGENT_ID],
      nowMs,
      timestampToleranceSeconds: 60,
    })).toEqual({ok: true, agentId: AGENT_ID, timestamp});
  });

  it('rejects an invalid HMAC signature', () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = Math.floor(nowMs / 1000);
    const signed = signature(AGENT_ID, timestamp);
    expect(verifyRadioAgentHandshake({
      agentId: AGENT_ID,
      timestamp: String(timestamp),
      signature: `${signed.startsWith('A') ? 'B' : 'A'}${signed.slice(1)}`,
    }, {
      secret: SECRET,
      allowedAgentIds: [AGENT_ID],
      nowMs,
      timestampToleranceSeconds: 60,
    })).toEqual({ok: false, code: 'invalid_signature'});
  });

  it('rejects an otherwise valid signature with an expired timestamp', () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = Math.floor(nowMs / 1000) - 61;
    expect(verifyRadioAgentHandshake({
      agentId: AGENT_ID,
      timestamp: String(timestamp),
      signature: signature(AGENT_ID, timestamp),
    }, {
      secret: SECRET,
      allowedAgentIds: [AGENT_ID],
      nowMs,
      timestampToleranceSeconds: 60,
    })).toEqual({ok: false, code: 'timestamp_out_of_range'});
  });

  it('rejects a valid HMAC generated for an unknown agent ID', () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = Math.floor(nowMs / 1000);
    const unknownAgentId = 'unknown-radio-pc';
    expect(verifyRadioAgentHandshake({
      agentId: unknownAgentId,
      timestamp: String(timestamp),
      signature: signature(unknownAgentId, timestamp),
    }, {
      secret: SECRET,
      allowedAgentIds: [AGENT_ID],
      nowMs,
      timestampToleranceSeconds: 60,
    })).toEqual({ok: false, code: 'agent_not_allowed'});
  });

  it('clamps an oversized configured timestamp tolerance to 60 seconds', () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = Math.floor(nowMs / 1000) - 61;
    expect(verifyRadioAgentHandshake({
      agentId: AGENT_ID,
      timestamp: String(timestamp),
      signature: signature(AGENT_ID, timestamp),
    }, {
      secret: SECRET,
      allowedAgentIds: [AGENT_ID],
      nowMs,
      timestampToleranceSeconds: 600,
    })).toEqual({ok: false, code: 'timestamp_out_of_range'});
  });

  it('rejects a replay of the same signed handshake', () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = Math.floor(nowMs / 1000);
    const verifier = new RadioAgentHandshakeVerifier({
      secret: SECRET,
      allowedAgentIds: [AGENT_ID],
      nowMs,
      timestampToleranceSeconds: 60,
    });
    const input = {agentId: AGENT_ID, timestamp: String(timestamp), signature: signature(AGENT_ID, timestamp)};
    expect(verifier.verify(input, nowMs).ok).toBe(true);
    expect(verifier.verify(input, nowMs)).toEqual({ok: false, code: 'replayed_handshake'});
  });

  it('registers both unprefixed and PUBLIC_BASE_PATH-prefixed endpoint paths', () => {
    expect(buildRadioAgentConnectPaths('/jukebox')).toEqual([
      '/api/v1/next-song-voting/agent/connect',
      '/jukebox/api/v1/next-song-voting/agent/connect',
    ]);
  });
});

describe('radio agent tunnel connection and dispatch', () => {
  it('requires agent_connect before accepting request messages', async () => {
    const harness = await createHarness();
    const client = await openSocket(harness);
    const closed = waitForClose(client);
    client.send(JSON.stringify({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'request',
      request_id: randomUUID(),
      method: 'round.active',
      payload: {},
    }));
    await expect(closed).resolves.toMatchObject({code: 4008});
    expect(harness.tunnel.isAgentConnected(AGENT_ID)).toBe(false);
  });

  it('replaces a duplicate connection and accepts a later reconnect', async () => {
    const harness = await createHarness();
    const first = await connectAgent(harness);
    const firstClosed = waitForClose(first);
    const second = await connectAgent(harness);
    await expect(firstClosed).resolves.toEqual({code: 4001, reason: 'replaced'});
    expect(harness.tunnel.isAgentConnected(AGENT_ID)).toBe(true);

    const secondClosed = waitForClose(second);
    second.close(1000, 'test_disconnect');
    await secondClosed;
    await waitUntil(() => !harness.tunnel.isAgentConnected(AGENT_ID));
    expect(harness.tunnel.getAgentStatus(AGENT_ID).connected).toBe(false);

    await connectAgent(harness);
    expect(harness.tunnel.getAgentStatus(AGENT_ID)).toMatchObject({
      connected: true,
      agentId: AGENT_ID,
      capabilities: CAPABILITIES,
    });
  });

  it('dispatches allowed methods and correlates out-of-order responses by request_id', async () => {
    const pending = new Map<string, (value: unknown) => void>();
    const handler = vi.fn((context: RadioAgentRequestContext) => new Promise((resolve) => {
      pending.set(context.requestId, resolve);
    }));
    const harness = await createHarness({requestHandler: handler});
    const client = await connectAgent(harness, {path: '/api/v1/next-song-voting/agent/connect'});
    const firstId = randomUUID();
    const secondId = randomUUID();
    const firstResponse = waitForMessage(client, (message) => message.request_id === firstId);
    const secondResponse = waitForMessage(client, (message) => message.request_id === secondId);

    client.send(JSON.stringify({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'request',
      request_id: firstId,
      method: 'round.publish',
      payload: {id: 'round-1'},
    }));
    client.send(JSON.stringify({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'request',
      request_id: secondId,
      method: 'round.active',
      payload: {},
    }));
    await waitUntil(() => pending.size === 2);
    pending.get(secondId)?.({round: {id: 'round-1'}});
    pending.get(firstId)?.({published: true});

    await expect(secondResponse).resolves.toMatchObject({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'response',
      request_id: secondId,
      ok: true,
      payload: {round: {id: 'round-1'}},
    });
    await expect(firstResponse).resolves.toMatchObject({
      request_id: firstId,
      ok: true,
      payload: {published: true},
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('uses only fixed safe error codes in handler failure responses', async () => {
    const harness = await createHarness({
      requestHandler: async () => {
        throw new Error('database connection includes sensitive implementation detail');
      },
    });
    const client = await connectAgent(harness);
    const requestId = randomUUID();
    const response = waitForMessage(client, (message) => message.request_id === requestId);
    client.send(JSON.stringify({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'request',
      request_id: requestId,
      method: 'round.resolve',
      payload: {roundId: 'round-1'},
    }));
    await expect(response).resolves.toEqual({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'response',
      request_id: requestId,
      ok: false,
      error: 'internal_error',
    });
  });

  it('keeps a responsive connection alive with protocol ping/pong', async () => {
    const harness = await createHarness({pingIntervalMs: 15, idleTimeoutMs: 1_000});
    const client = await connectAgent(harness);
    const before = harness.tunnel.getAgentStatus(AGENT_ID).lastSeen;
    const ping = await waitForMessage(client, (message) => message.type === 'ping', 3_000);
    expect(ping).toMatchObject({protocol: RADIO_AGENT_PROTOCOL, type: 'ping'});
    await new Promise((resolve) => setTimeout(resolve, 5));
    client.send(JSON.stringify({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'pong',
      sent_at: new Date().toISOString(),
    }));
    await waitUntil(() => harness.tunnel.getAgentStatus(AGENT_ID).lastSeen !== before);
    expect(harness.tunnel.isAgentConnected(AGENT_ID)).toBe(true);
  });
});
