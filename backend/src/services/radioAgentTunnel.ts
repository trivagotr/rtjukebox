import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage, Server as HttpServer} from 'node:http';
import type {Duplex} from 'node:stream';
import WebSocket, {RawData, WebSocketServer} from 'ws';

export const RADIO_AGENT_PROTOCOL = 'radiotedu-radio-agent/v1' as const;
export const RADIO_AGENT_CONNECT_PATH = '/api/v1/next-song-voting/agent/connect' as const;

export const RADIO_AGENT_LIMITS = Object.freeze({
  maxMessageBytes: 7 * 1024 * 1024,
  maxJsonDepth: 12,
  maxJsonNodes: 20_000,
  maxStringBytes: 2_200_000,
  maxMessagesPerWindow: 120,
  rateWindowMs: 60_000,
  maxInflightRequests: 8,
  maxPendingConnections: 16,
  connectTimeoutMs: 5_000,
  requestTimeoutMs: 10_000,
});

const RADIO_AGENT_METHODS = new Set<RadioAgentMethod>([
  'round.publish',
  'round.active',
  'round.resolve',
]);

const RADIO_AGENT_CAPABILITIES = new Set<RadioAgentCapability>([
  'radio.playout',
  'radio.voting',
  'radio.cover-art',
  'radio.heartbeat',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type RadioAgentMethod = 'round.publish' | 'round.active' | 'round.resolve';
export type RadioAgentCapability =
  | 'radio.playout'
  | 'radio.voting'
  | 'radio.cover-art'
  | 'radio.heartbeat';

export type RadioAgentSafeErrorCode =
  | 'invalid_payload'
  | 'not_authorized'
  | 'not_found'
  | 'conflict'
  | 'duplicate_request'
  | 'rate_limited'
  | 'service_unavailable'
  | 'request_timeout'
  | 'internal_error';

const SAFE_REQUEST_ERROR_CODES = new Set<RadioAgentSafeErrorCode>([
  'invalid_payload',
  'not_authorized',
  'not_found',
  'conflict',
  'duplicate_request',
  'rate_limited',
  'service_unavailable',
  'request_timeout',
  'internal_error',
]);

export type RadioAgentAuthFailureCode =
  | 'credentials_missing'
  | 'invalid_agent_id'
  | 'invalid_timestamp'
  | 'timestamp_out_of_range'
  | 'invalid_signature'
  | 'agent_not_allowed'
  | 'replayed_handshake';

export type RadioAgentAuthResult =
  | {ok: true; agentId: string; timestamp: number}
  | {ok: false; code: RadioAgentAuthFailureCode};

export interface RadioAgentHandshakeInput {
  agentId?: string;
  timestamp?: string;
  signature?: string;
}

export interface RadioAgentHandshakeOptions {
  secret: string;
  allowedAgentIds: ReadonlySet<string> | readonly string[];
  timestampToleranceSeconds?: number;
  nowMs?: number;
}

export interface RadioAgentRequestContext {
  agentId: string;
  requestId: string;
  method: RadioAgentMethod;
  payload: Readonly<Record<string, unknown>>;
}

export type RadioAgentRequestHandler = (context: RadioAgentRequestContext) => Promise<unknown>;

export interface RadioAgentStatus {
  agentId: string;
  connected: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSeen: string | null;
  capabilities: RadioAgentCapability[];
}

export type RadioAgentAuditEvent =
  | 'handshake_rejected'
  | 'connection_accepted'
  | 'connection_rejected'
  | 'connection_replaced'
  | 'agent_connected'
  | 'agent_disconnected'
  | 'request_completed'
  | 'request_rejected'
  | 'idle_timeout';

export type RadioAgentAuditLogger = (
  event: RadioAgentAuditEvent,
  details: Readonly<Record<string, string | number | boolean | null>>,
) => void;

export interface RadioAgentTunnelOptions {
  publicBasePath?: string;
  requestSecret?: string;
  allowedAgentIds?: readonly string[];
  timestampToleranceSeconds?: number;
  pingIntervalMs?: number;
  idleTimeoutMs?: number;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxPayloadBytes?: number;
  maxJsonDepth?: number;
  maxJsonNodes?: number;
  maxStringBytes?: number;
  maxMessagesPerWindow?: number;
  rateWindowMs?: number;
  maxInflightRequests?: number;
  maxPendingConnections?: number;
  now?: () => number;
  requestHandler?: RadioAgentRequestHandler;
  audit?: RadioAgentAuditLogger;
}

interface ResolvedRadioAgentTunnelOptions {
  publicBasePath: string;
  requestSecret: string;
  allowedAgentIds: readonly string[];
  timestampToleranceSeconds: number;
  pingIntervalMs: number;
  idleTimeoutMs: number;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  maxPayloadBytes: number;
  maxJsonDepth: number;
  maxJsonNodes: number;
  maxStringBytes: number;
  maxMessagesPerWindow: number;
  rateWindowMs: number;
  maxInflightRequests: number;
  maxPendingConnections: number;
  now: () => number;
  requestHandler?: RadioAgentRequestHandler;
  audit: RadioAgentAuditLogger;
}

interface AgentConnectionState {
  ws: WebSocket;
  authenticatedAgentId: string;
  connected: boolean;
  capabilities: RadioAgentCapability[];
  connectedAtMs: number | null;
  lastSeenMs: number;
  rateWindowStartedAtMs: number;
  messagesInWindow: number;
  inflightRequestIds: Set<string>;
  recentRequestIds: Map<string, number>;
  connectTimer: ReturnType<typeof setTimeout>;
}

interface JsonLimitResult {
  ok: boolean;
  reason?: 'depth' | 'nodes' | 'string';
}

export class RadioAgentRequestError extends Error {
  readonly code: RadioAgentSafeErrorCode;

  constructor(code: RadioAgentSafeErrorCode) {
    super(code);
    this.name = 'RadioAgentRequestError';
    this.code = code;
  }
}

function asPositiveInteger(value: string | number | undefined, fallback: number, minimum = 1): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function boundedTimestampTolerance(value: string | number | undefined): number {
  return Math.min(60, asPositiveInteger(value, 60));
}

function normalizePublicBasePath(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function parseAllowedAgentIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry, index, all) => Boolean(entry) && all.indexOf(entry) === index);
}

function defaultAudit(event: RadioAgentAuditEvent, details: Readonly<Record<string, string | number | boolean | null>>) {
  console.info(JSON.stringify({component: 'radio_agent_tunnel', event, ...details}));
}

function resolveOptions(options: RadioAgentTunnelOptions): ResolvedRadioAgentTunnelOptions {
  const requestSecret = options.requestSecret ?? process.env.RADIO_AGENT_REQUEST_SECRET ?? '';
  const allowedAgentIds = options.allowedAgentIds ?? parseAllowedAgentIds(process.env.RADIO_AGENT_ALLOWED_IDS);
  if (Buffer.byteLength(requestSecret, 'utf8') < 32) {
    throw new Error('radio_agent_request_secret_missing_or_too_short');
  }
  if (allowedAgentIds.length === 0) {
    throw new Error('radio_agent_allowed_ids_missing');
  }

  return {
    publicBasePath: normalizePublicBasePath(options.publicBasePath ?? process.env.PUBLIC_BASE_PATH),
    requestSecret,
    allowedAgentIds: [...new Set(allowedAgentIds)],
    timestampToleranceSeconds: boundedTimestampTolerance(
      options.timestampToleranceSeconds ?? process.env.RADIO_AGENT_TIMESTAMP_TOLERANCE_SECONDS,
    ),
    pingIntervalMs: asPositiveInteger(
      options.pingIntervalMs ?? process.env.RADIO_AGENT_PING_INTERVAL_MS,
      25_000,
    ),
    idleTimeoutMs: asPositiveInteger(
      options.idleTimeoutMs ?? process.env.RADIO_AGENT_IDLE_TIMEOUT_MS,
      60_000,
    ),
    connectTimeoutMs: asPositiveInteger(options.connectTimeoutMs, RADIO_AGENT_LIMITS.connectTimeoutMs),
    requestTimeoutMs: asPositiveInteger(options.requestTimeoutMs, RADIO_AGENT_LIMITS.requestTimeoutMs),
    maxPayloadBytes: asPositiveInteger(options.maxPayloadBytes, RADIO_AGENT_LIMITS.maxMessageBytes),
    maxJsonDepth: asPositiveInteger(options.maxJsonDepth, RADIO_AGENT_LIMITS.maxJsonDepth),
    maxJsonNodes: asPositiveInteger(options.maxJsonNodes, RADIO_AGENT_LIMITS.maxJsonNodes),
    maxStringBytes: asPositiveInteger(options.maxStringBytes, RADIO_AGENT_LIMITS.maxStringBytes),
    maxMessagesPerWindow: asPositiveInteger(
      options.maxMessagesPerWindow,
      RADIO_AGENT_LIMITS.maxMessagesPerWindow,
    ),
    rateWindowMs: asPositiveInteger(options.rateWindowMs, RADIO_AGENT_LIMITS.rateWindowMs),
    maxInflightRequests: asPositiveInteger(options.maxInflightRequests, RADIO_AGENT_LIMITS.maxInflightRequests),
    maxPendingConnections: asPositiveInteger(
      options.maxPendingConnections,
      RADIO_AGENT_LIMITS.maxPendingConnections,
    ),
    now: options.now ?? Date.now,
    requestHandler: options.requestHandler,
    audit: options.audit ?? defaultAudit,
  };
}

function safeHeaderValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function signatureBuffer(signature: string): Buffer | null {
  if (!BASE64URL_SHA256_PATTERN.test(signature)) return null;
  const decoded = Buffer.from(signature, 'base64url');
  return decoded.length === 32 ? decoded : null;
}

/**
 * Pure handshake verification. Replay protection is deliberately separate so
 * deterministic tests and non-HTTP callers can use the cryptographic check.
 */
export function verifyRadioAgentHandshake(
  input: RadioAgentHandshakeInput,
  options: RadioAgentHandshakeOptions,
): RadioAgentAuthResult {
  const agentId = input.agentId;
  const timestampText = input.timestamp;
  const signature = input.signature;
  if (!agentId || !timestampText || !signature) return {ok: false, code: 'credentials_missing'};
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(agentId)) return {ok: false, code: 'invalid_agent_id'};
  if (!/^\d{1,12}$/.test(timestampText)) return {ok: false, code: 'invalid_timestamp'};

  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp)) return {ok: false, code: 'invalid_timestamp'};
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const tolerance = boundedTimestampTolerance(options.timestampToleranceSeconds);
  if (Math.abs(nowSeconds - timestamp) > tolerance) return {ok: false, code: 'timestamp_out_of_range'};

  const expected = createHmac('sha256', options.secret).update(`${agentId}:${timestamp}`).digest();
  const provided = signatureBuffer(signature);
  const comparable = provided ?? Buffer.alloc(expected.length);
  const signatureMatches = timingSafeEqual(expected, comparable) && provided !== null;
  if (!signatureMatches) return {ok: false, code: 'invalid_signature'};

  const allowed = options.allowedAgentIds instanceof Set
    ? options.allowedAgentIds
    : new Set(options.allowedAgentIds);
  if (!allowed.has(agentId)) return {ok: false, code: 'agent_not_allowed'};
  return {ok: true, agentId, timestamp};
}

export class RadioAgentReplayCache {
  private readonly entries = new Map<string, number>();

  claim(agentId: string, timestamp: number, signature: string, nowMs: number, ttlMs: number): boolean {
    this.prune(nowMs);
    const key = createHash('sha256').update(`${agentId}:${timestamp}:${signature}`).digest('base64url');
    if (this.entries.has(key)) return false;
    this.entries.set(key, nowMs + ttlMs);
    if (this.entries.size > 10_000) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
    }
    return true;
  }

  prune(nowMs: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= nowMs) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export class RadioAgentHandshakeVerifier {
  readonly replayCache: RadioAgentReplayCache;

  constructor(
    private readonly options: RadioAgentHandshakeOptions,
    replayCache = new RadioAgentReplayCache(),
  ) {
    this.replayCache = replayCache;
  }

  verify(input: RadioAgentHandshakeInput, nowMs = this.options.nowMs ?? Date.now()): RadioAgentAuthResult {
    const result = verifyRadioAgentHandshake(input, {...this.options, nowMs});
    if (!result.ok) return result;
    const tolerance = boundedTimestampTolerance(this.options.timestampToleranceSeconds);
    if (!this.replayCache.claim(result.agentId, result.timestamp, input.signature!, nowMs, tolerance * 2_000)) {
      return {ok: false, code: 'replayed_handshake'};
    }
    return result;
  }
}

export function buildRadioAgentConnectPaths(publicBasePath?: string): readonly string[] {
  const basePath = normalizePublicBasePath(publicBasePath);
  return basePath
    ? [RADIO_AGENT_CONNECT_PATH, `${basePath}${RADIO_AGENT_CONNECT_PATH}`]
    : [RADIO_AGENT_CONNECT_PATH];
}

function rawDataByteLength(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.byteLength, 0);
  return data.byteLength;
}

function rawDataToUtf8(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

function validateJsonLimits(
  value: unknown,
  limits: Pick<ResolvedRadioAgentTunnelOptions, 'maxJsonDepth' | 'maxJsonNodes' | 'maxStringBytes'>,
): JsonLimitResult {
  const stack: Array<{value: unknown; depth: number}> = [{value, depth: 1}];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > limits.maxJsonNodes) return {ok: false, reason: 'nodes'};
    if (current.depth > limits.maxJsonDepth) return {ok: false, reason: 'depth'};
    if (typeof current.value === 'string' && Buffer.byteLength(current.value, 'utf8') > limits.maxStringBytes) {
      return {ok: false, reason: 'string'};
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) stack.push({value: child, depth: current.depth + 1});
    } else if (current.value !== null && typeof current.value === 'object') {
      for (const child of Object.values(current.value as Record<string, unknown>)) {
        stack.push({value: child, depth: current.depth + 1});
      }
    }
  }
  return {ok: true};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function toSafeRequestErrorCode(error: unknown): RadioAgentSafeErrorCode {
  if (error instanceof RadioAgentRequestError && SAFE_REQUEST_ERROR_CODES.has(error.code)) return error.code;
  return 'internal_error';
}

function writeUpgradeError(socket: Duplex, status: 400 | 401 | 403 | 429 | 503): void {
  const label: Record<typeof status, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    429: 'Too Many Requests',
    503: 'Service Unavailable',
  };
  if (socket.destroyed) return;
  socket.end(
    `HTTP/1.1 ${status} ${label[status]}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Cache-Control: no-store\r\n' +
      'Content-Length: 0\r\n\r\n',
  );
}

export class RadioAgentTunnel {
  readonly connectPaths: readonly string[];

  private readonly options: ResolvedRadioAgentTunnelOptions;
  private readonly webSocketServer: WebSocketServer;
  private readonly verifier: RadioAgentHandshakeVerifier;
  private readonly connectedAgents = new Map<string, AgentConnectionState>();
  private readonly statuses = new Map<string, RadioAgentStatus>();
  private readonly allConnections = new Set<AgentConnectionState>();
  private requestHandler?: RadioAgentRequestHandler;
  private attachedServer: HttpServer | null = null;
  private closed = false;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;

  private readonly upgradeListener = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    this.handleUpgrade(request, socket, head);
  };

  constructor(options: RadioAgentTunnelOptions = {}) {
    this.options = resolveOptions(options);
    this.requestHandler = this.options.requestHandler;
    this.connectPaths = buildRadioAgentConnectPaths(this.options.publicBasePath);
    this.verifier = new RadioAgentHandshakeVerifier({
      secret: this.options.requestSecret,
      allowedAgentIds: this.options.allowedAgentIds,
      timestampToleranceSeconds: this.options.timestampToleranceSeconds,
    });
    this.webSocketServer = new WebSocketServer({
      noServer: true,
      maxPayload: this.options.maxPayloadBytes,
      perMessageDeflate: false,
      clientTracking: false,
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.options.pingIntervalMs);
    this.heartbeatTimer.unref();
  }

  attach(server: HttpServer): this {
    if (this.closed) throw new Error('radio_agent_tunnel_closed');
    if (this.attachedServer && this.attachedServer !== server) throw new Error('radio_agent_tunnel_already_attached');
    if (!this.attachedServer) {
      this.attachedServer = server;
      server.prependListener('upgrade', this.upgradeListener);
    }
    return this;
  }

  setRequestHandler(handler: RadioAgentRequestHandler): void {
    this.requestHandler = handler;
  }

  handlesUpgrade(request: IncomingMessage): boolean {
    let parsed: URL;
    try {
      parsed = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      return false;
    }
    return this.connectPaths.includes(parsed.pathname);
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    let parsed: URL;
    try {
      parsed = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      return false;
    }
    if (!this.connectPaths.includes(parsed.pathname)) return false;

    if (this.closed) {
      writeUpgradeError(socket, 503);
      return true;
    }
    if (parsed.search.length > 0) {
      this.options.audit('handshake_rejected', {reason: 'query_not_allowed'});
      writeUpgradeError(socket, 400);
      return true;
    }
    if (this.allConnections.size >= this.options.maxPendingConnections + this.connectedAgents.size) {
      this.options.audit('handshake_rejected', {reason: 'connection_limit'});
      writeUpgradeError(socket, 429);
      return true;
    }

    const authResult = this.verifier.verify({
      agentId: safeHeaderValue(request.headers['x-radio-agent-id']),
      timestamp: safeHeaderValue(request.headers['x-radio-agent-timestamp']),
      signature: safeHeaderValue(request.headers['x-radio-agent-signature']),
    }, this.options.now());
    if (!authResult.ok) {
      const status = authResult.code === 'agent_not_allowed' ? 403 : 401;
      this.options.audit('handshake_rejected', {reason: authResult.code});
      writeUpgradeError(socket, status);
      return true;
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (ws) => {
      this.acceptConnection(ws, authResult.agentId);
    });
    return true;
  }

  getAgentStatus(agentId: string): RadioAgentStatus {
    const active = this.connectedAgents.get(agentId);
    if (active) {
      const connected = active.ws.readyState === WebSocket.OPEN;
      return {
        agentId,
        connected,
        connectedAt: active.connectedAtMs === null ? null : new Date(active.connectedAtMs).toISOString(),
        disconnectedAt: connected ? null : new Date(this.options.now()).toISOString(),
        lastSeen: new Date(active.lastSeenMs).toISOString(),
        capabilities: [...active.capabilities],
      };
    }
    const status = this.statuses.get(agentId);
    return status
      ? {...status, capabilities: [...status.capabilities]}
      : {
          agentId,
          connected: false,
          connectedAt: null,
          disconnectedAt: null,
          lastSeen: null,
          capabilities: [],
        };
  }

  getAllAgentStatuses(): RadioAgentStatus[] {
    return this.options.allowedAgentIds.map((agentId) => this.getAgentStatus(agentId));
  }

  isAgentConnected(agentId: string): boolean {
    return this.connectedAgents.get(agentId)?.ws.readyState === WebSocket.OPEN;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeatTimer);
    if (this.attachedServer) {
      this.attachedServer.removeListener('upgrade', this.upgradeListener);
      this.attachedServer = null;
    }
    for (const connection of this.allConnections) {
      clearTimeout(connection.connectTimer);
      connection.ws.terminate();
    }
    this.allConnections.clear();
    this.connectedAgents.clear();
    this.verifier.replayCache.clear();
    this.webSocketServer.close();
  }

  private acceptConnection(ws: WebSocket, authenticatedAgentId: string): void {
    const now = this.options.now();
    const state = {} as AgentConnectionState;
    state.ws = ws;
    state.authenticatedAgentId = authenticatedAgentId;
    state.connected = false;
    state.capabilities = [];
    state.connectedAtMs = null;
    state.lastSeenMs = now;
    state.rateWindowStartedAtMs = now;
    state.messagesInWindow = 0;
    state.inflightRequestIds = new Set();
    state.recentRequestIds = new Map();
    state.connectTimer = setTimeout(() => {
      if (!state.connected) this.rejectConnection(state, 'agent_connect_timeout', 4008);
    }, this.options.connectTimeoutMs);
    state.connectTimer.unref();
    this.allConnections.add(state);
    this.options.audit('connection_accepted', {agentId: authenticatedAgentId});

    ws.on('message', (data, isBinary) => this.onMessage(state, data, isBinary));
    ws.on('error', () => undefined);
    ws.on('close', () => this.onClose(state));
  }

  private onMessage(state: AgentConnectionState, data: RawData, isBinary: boolean): void {
    const now = this.options.now();
    state.lastSeenMs = now;
    if (isBinary) {
      this.rejectConnection(state, 'binary_not_allowed', 4003);
      return;
    }
    if (rawDataByteLength(data) > this.options.maxPayloadBytes) {
      this.rejectConnection(state, 'message_too_large', 4009);
      return;
    }
    if (!this.takeRateLimitToken(state, now)) {
      this.options.audit('request_rejected', {agentId: state.authenticatedAgentId, reason: 'rate_limited'});
      this.rejectConnection(state, 'rate_limited', 4008);
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(rawDataToUtf8(data));
    } catch {
      this.rejectConnection(state, 'invalid_json', 4007);
      return;
    }
    const jsonLimits = validateJsonLimits(message, this.options);
    if (!jsonLimits.ok || !isRecord(message)) {
      this.rejectConnection(state, `invalid_json_${jsonLimits.reason ?? 'shape'}`, 4007);
      return;
    }
    if (message.protocol !== RADIO_AGENT_PROTOCOL) {
      this.rejectConnection(state, 'invalid_protocol', 4002);
      return;
    }

    if (!state.connected) {
      this.handleAgentConnect(state, message, now);
      return;
    }
    if (message.type === 'pong') {
      if (!hasOnlyKeys(message, ['protocol', 'type', 'sent_at']) ||
          (message.sent_at !== undefined && typeof message.sent_at !== 'string')) {
        this.rejectConnection(state, 'invalid_pong', 4007);
      }
      return;
    }
    if (message.type === 'agent_connect') {
      this.rejectConnection(state, 'duplicate_agent_connect', 4008);
      return;
    }
    this.handleRequest(state, message, now);
  }

  private handleAgentConnect(state: AgentConnectionState, message: Record<string, unknown>, now: number): void {
    if (message.type !== 'agent_connect' ||
        !hasOnlyKeys(message, ['protocol', 'type', 'agent_id', 'capabilities']) ||
        message.agent_id !== state.authenticatedAgentId ||
        !Array.isArray(message.capabilities) ||
        message.capabilities.length === 0 ||
        message.capabilities.length > RADIO_AGENT_CAPABILITIES.size) {
      this.rejectConnection(state, 'invalid_agent_connect', 4008);
      return;
    }

    const capabilities = message.capabilities;
    if (!capabilities.every((capability): capability is RadioAgentCapability =>
      typeof capability === 'string' && RADIO_AGENT_CAPABILITIES.has(capability as RadioAgentCapability)) ||
      new Set(capabilities).size !== capabilities.length) {
      this.rejectConnection(state, 'invalid_capabilities', 4008);
      return;
    }

    clearTimeout(state.connectTimer);
    state.connected = true;
    state.connectedAtMs = now;
    state.capabilities = [...capabilities];

    const existing = this.connectedAgents.get(state.authenticatedAgentId);
    this.connectedAgents.set(state.authenticatedAgentId, state);
    this.statuses.set(state.authenticatedAgentId, {
      agentId: state.authenticatedAgentId,
      connected: true,
      connectedAt: new Date(now).toISOString(),
      disconnectedAt: null,
      lastSeen: new Date(now).toISOString(),
      capabilities: [...state.capabilities],
    });
    if (existing && existing !== state) {
      this.options.audit('connection_replaced', {agentId: state.authenticatedAgentId});
      this.closeSocket(existing.ws, 4001, 'replaced');
    }
    this.options.audit('agent_connected', {agentId: state.authenticatedAgentId});
  }

  private handleRequest(state: AgentConnectionState, message: Record<string, unknown>, now: number): void {
    if (message.type !== 'request' ||
        !hasOnlyKeys(message, ['protocol', 'type', 'request_id', 'method', 'payload']) ||
        typeof message.request_id !== 'string' ||
        !UUID_PATTERN.test(message.request_id) ||
        typeof message.method !== 'string' ||
        !RADIO_AGENT_METHODS.has(message.method as RadioAgentMethod) ||
        !isRecord(message.payload)) {
      this.rejectConnection(state, 'invalid_request_envelope', 4007);
      return;
    }

    const requestId = message.request_id;
    const method = message.method as RadioAgentMethod;
    this.pruneRecentRequestIds(state, now);
    if (state.inflightRequestIds.has(requestId) || state.recentRequestIds.has(requestId)) {
      this.sendError(state.ws, requestId, 'duplicate_request');
      return;
    }
    if (state.inflightRequestIds.size >= this.options.maxInflightRequests) {
      this.sendError(state.ws, requestId, 'service_unavailable');
      return;
    }
    state.inflightRequestIds.add(requestId);
    state.recentRequestIds.set(requestId, now);
    void this.dispatchRequest(state, requestId, method, message.payload);
  }

  private async dispatchRequest(
    state: AgentConnectionState,
    requestId: string,
    method: RadioAgentMethod,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!this.requestHandler) throw new RadioAgentRequestError('service_unavailable');
      const result = await this.withTimeout(
        this.requestHandler({agentId: state.authenticatedAgentId, requestId, method, payload}),
      );
      if (state.ws.readyState !== WebSocket.OPEN) return;
      const response = JSON.stringify({
        protocol: RADIO_AGENT_PROTOCOL,
        type: 'response',
        request_id: requestId,
        ok: true,
        payload: result ?? {},
      });
      if (Buffer.byteLength(response, 'utf8') > this.options.maxPayloadBytes) {
        this.sendError(state.ws, requestId, 'internal_error');
        return;
      }
      state.ws.send(response);
      this.options.audit('request_completed', {
        agentId: state.authenticatedAgentId,
        requestId,
        method,
      });
    } catch (error) {
      const code = toSafeRequestErrorCode(error);
      this.sendError(state.ws, requestId, code);
      this.options.audit('request_rejected', {
        agentId: state.authenticatedAgentId,
        requestId,
        method,
        reason: code,
      });
    } finally {
      state.inflightRequestIds.delete(requestId);
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => reject(new RadioAgentRequestError('request_timeout')), this.options.requestTimeoutMs);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private heartbeat(): void {
    if (this.closed) return;
    const now = this.options.now();
    for (const [agentId, state] of this.connectedAgents) {
      if (state.ws.readyState !== WebSocket.OPEN) continue;
      if (now - state.lastSeenMs > this.options.idleTimeoutMs) {
        this.options.audit('idle_timeout', {agentId});
        this.closeSocket(state.ws, 4008, 'idle_timeout');
        continue;
      }
      state.ws.send(JSON.stringify({
        protocol: RADIO_AGENT_PROTOCOL,
        type: 'ping',
        sent_at: new Date(now).toISOString(),
      }));
    }
  }

  private takeRateLimitToken(state: AgentConnectionState, now: number): boolean {
    if (now - state.rateWindowStartedAtMs >= this.options.rateWindowMs) {
      state.rateWindowStartedAtMs = now;
      state.messagesInWindow = 0;
    }
    state.messagesInWindow += 1;
    return state.messagesInWindow <= this.options.maxMessagesPerWindow;
  }

  private pruneRecentRequestIds(state: AgentConnectionState, now: number): void {
    const cutoff = now - Math.max(this.options.requestTimeoutMs * 2, 60_000);
    for (const [requestId, seenAt] of state.recentRequestIds) {
      if (seenAt <= cutoff) state.recentRequestIds.delete(requestId);
    }
  }

  private sendError(ws: WebSocket, requestId: string, error: RadioAgentSafeErrorCode): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      protocol: RADIO_AGENT_PROTOCOL,
      type: 'response',
      request_id: requestId,
      ok: false,
      error,
    }));
  }

  private rejectConnection(state: AgentConnectionState, reason: string, closeCode: number): void {
    this.options.audit('connection_rejected', {
      agentId: state.authenticatedAgentId,
      reason,
    });
    this.closeSocket(state.ws, closeCode, reason);
  }

  private closeSocket(ws: WebSocket, code: number, reason: string): void {
    if (ws.readyState === WebSocket.CLOSED) return;
    if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
      return;
    }
    ws.close(code, reason.slice(0, 123));
    const timer = setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    }, 1_000);
    timer.unref();
  }

  private onClose(state: AgentConnectionState): void {
    clearTimeout(state.connectTimer);
    this.allConnections.delete(state);
    const active = this.connectedAgents.get(state.authenticatedAgentId);
    if (active !== state) return;

    this.connectedAgents.delete(state.authenticatedAgentId);
    const now = this.options.now();
    const previous = this.statuses.get(state.authenticatedAgentId);
    this.statuses.set(state.authenticatedAgentId, {
      agentId: state.authenticatedAgentId,
      connected: false,
      connectedAt: previous?.connectedAt ?? null,
      disconnectedAt: new Date(now).toISOString(),
      lastSeen: new Date(state.lastSeenMs).toISOString(),
      capabilities: [...state.capabilities],
    });
    this.options.audit('agent_disconnected', {agentId: state.authenticatedAgentId});
  }
}

export function createRadioAgentTunnel(options: RadioAgentTunnelOptions = {}): RadioAgentTunnel {
  return new RadioAgentTunnel(options);
}

export function attachRadioAgentTunnel(
  server: HttpServer,
  options: RadioAgentTunnelOptions = {},
): RadioAgentTunnel {
  return new RadioAgentTunnel(options).attach(server);
}
