import rateLimit, { MemoryStore, Options, Store } from 'express-rate-limit';
import { createClient } from 'redis';
import { AuthRequest } from './auth';

type RateLimitConfig = Pick<Options, 'windowMs' | 'limit'> & Partial<Pick<Options, 'keyGenerator'>> & { name: string };

const redisUrl = process.env.REDIS_URL?.trim();
const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;
redisClient?.on('error', (error) => {
    console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_redis_error', errorName: error.name }));
});

class SharedRateLimitStore implements Store {
    readonly localKeys = false;
    private readonly localStore = new MemoryStore();
    private readonly windowMs: number;
    private readonly keyPrefix: string;

    constructor(name: string, windowMs: number) {
        this.windowMs = windowMs;
        this.keyPrefix = `rtjukebox:rate-limit:${name}:`;
    }

    init(options: Options) {
        this.localStore.init(options);
    }

    async increment(key: string) {
        if (!redisClient?.isReady) return this.localStore.increment(key);
        try {
            const result = await redisClient.eval(
                "local hits = redis.call('INCR', KEYS[1]); if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {hits, redis.call('PTTL', KEYS[1])}",
                { keys: [`${this.keyPrefix}${key}`], arguments: [String(this.windowMs)] },
            ) as number[];
            const ttlMs = Math.max(0, Number(result[1]));
            return { totalHits: Number(result[0]), resetTime: new Date(Date.now() + ttlMs) };
        } catch (error) {
            console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_redis_fallback', errorName: error instanceof Error ? error.name : 'Error' }));
            return this.localStore.increment(key);
        }
    }

    async decrement(key: string) {
        if (!redisClient?.isReady) return this.localStore.decrement(key);
        try {
            const redisKey = `${this.keyPrefix}${key}`;
            await redisClient.eval("local hits = redis.call('DECR', KEYS[1]); if hits <= 0 then redis.call('DEL', KEYS[1]); end; return hits", { keys: [redisKey], arguments: [] });
        } catch {
            await this.localStore.decrement(key);
        }
    }

    async resetKey(key: string) {
        this.localStore.resetKey(key);
        if (redisClient?.isReady) await redisClient.del(`${this.keyPrefix}${key}`).catch(() => undefined);
    }

    async get(key: string) {
        if (!redisClient?.isReady) return this.localStore.get(key);
        try {
            const result = await redisClient.multi()
                .get(`${this.keyPrefix}${key}`)
                .pTTL(`${this.keyPrefix}${key}`)
                .exec() as unknown as Array<string | number | null>;
            if (result[0] === null) return undefined;
            return { totalHits: Number(result[0]), resetTime: new Date(Date.now() + Math.max(0, Number(result[1]))) };
        } catch {
            return this.localStore.get(key);
        }
    }
}

export async function startRateLimitRedis() {
    if (!redisClient || redisClient.isOpen) return;
    try {
        await redisClient.connect();
        console.info(JSON.stringify({ level: 'info', event: 'rate_limit_redis_ready' }));
    } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_redis_unavailable', errorName: error instanceof Error ? error.name : 'Error' }));
    }
}

export async function stopRateLimitRedis() {
    if (redisClient?.isOpen) await redisClient.quit().catch(() => undefined);
}

function createRateLimit(options: RateLimitConfig) {
    return rateLimit({
        ...options,
        store: new SharedRateLimitStore(options.name, options.windowMs),
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({
            success: false,
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            requestId: req.requestId,
        }),
    });
}

const userKey = (req: AuthRequest) => `user:${req.user!.id}`;

export const authRateLimit = createRateLimit({ name: 'auth', windowMs: 60_000, limit: 5 });
export const guestRateLimit = createRateLimit({ name: 'guest', windowMs: 60 * 60_000, limit: 3 });
export const writeRateLimit = createRateLimit({ name: 'write', windowMs: 60_000, limit: 30, keyGenerator: (req) => userKey(req as AuthRequest) });
export const heartbeatRateLimit = createRateLimit({ name: 'heartbeat', windowMs: 60_000, limit: 1, keyGenerator: (req) => userKey(req as AuthRequest) });
export const adminRateLimit = createRateLimit({ name: 'admin', windowMs: 60_000, limit: 100, keyGenerator: (req) => userKey(req as AuthRequest) });
export const readRateLimit = createRateLimit({ name: 'read', windowMs: 60_000, limit: 120 });
export const globalApiRateLimit = createRateLimit({ name: 'global-api', windowMs: 60_000, limit: 500 });
