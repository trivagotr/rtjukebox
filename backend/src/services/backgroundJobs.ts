import { Job, Queue, Worker } from 'bullmq';
import { createClient } from 'redis';
import { createNodeRedisClient } from 'bullmq';
import { randomUUID } from 'crypto';

export type BackgroundJobName = 'scan-folder' | 'process-song' | 'sync-metadata' | 'podcast-feed-sync';
export type BackgroundJobPayload = {
    requestedBy: string;
    songId?: string;
    feedId?: string;
};

export type BackgroundJobProcessor = (name: BackgroundJobName, payload: BackgroundJobPayload, job: Job) => Promise<unknown>;

let queue: Queue<BackgroundJobPayload> | undefined;
let worker: Worker<BackgroundJobPayload> | undefined;
let redisClient: ReturnType<typeof createClient> | undefined;

export class BackgroundJobsUnavailableError extends Error {
    constructor() {
        super('Background job queue is not available');
        this.name = 'BackgroundJobsUnavailableError';
    }
}

export function areBackgroundJobsReady() {
    if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) return true;
    return Boolean(process.env.REDIS_URL?.trim() && queue && worker?.isRunning());
}

export async function startBackgroundJobs(processJob: BackgroundJobProcessor) {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
        console.warn(JSON.stringify({ level: 'warn', event: 'background_jobs_disabled', reason: 'redis_url_missing' }));
        return;
    }

    redisClient = createClient({
        url: redisUrl,
        socket: {
            connectTimeout: 5_000,
            reconnectStrategy: (retries) => retries < 3 ? Math.min(250 * (retries + 1), 1_000) : false,
        },
    });
    redisClient.on('error', (error) => {
        console.error(JSON.stringify({ level: 'error', event: 'background_jobs_redis_error', errorName: error.name }));
    });

    try {
        await redisClient.connect();
        const connection = createNodeRedisClient(redisClient);
        queue = new Queue<BackgroundJobPayload>('radiotedu-background-jobs', { connection });
        worker = new Worker<BackgroundJobPayload>(
            'radiotedu-background-jobs',
            async (job) => processJob(job.name as BackgroundJobName, job.data, job),
            { connection },
        );
        worker.on('failed', (job, error) => {
            console.error(JSON.stringify({ level: 'error', event: 'background_job_failed', jobId: job?.id, jobName: job?.name, errorName: error.name }));
        });
        console.info(JSON.stringify({ level: 'info', event: 'background_jobs_ready' }));
    } catch (error) {
        console.error(JSON.stringify({ level: 'error', event: 'background_jobs_start_failed', errorName: error instanceof Error ? error.name : 'Error' }));
        if (redisClient.isOpen) await redisClient.quit().catch(() => undefined);
        redisClient = undefined;
        queue = undefined;
        worker = undefined;
    }
}

export async function enqueueBackgroundJob(name: BackgroundJobName, payload: BackgroundJobPayload) {
    if (!queue) throw new BackgroundJobsUnavailableError();
    return queue.add(name, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 2_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
    });
}

export async function getBackgroundJob(jobId: string) {
    if (!queue) throw new BackgroundJobsUnavailableError();
    const job = await queue.getJob(jobId);
    if (!job) return null;
    return {
        ownerId: job.data.requestedBy,
        id: job.id,
        name: job.name,
        state: await job.getState(),
        progress: job.progress,
        result: job.returnvalue ?? null,
        failed: Boolean(job.failedReason),
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
}

export async function runWithLeaderLease(key: string, leaseMs: number, task: () => Promise<void>) {
    if (!process.env.REDIS_URL?.trim()) {
        await task();
        return true;
    }
    if (!redisClient?.isOpen) return false;

    const owner = randomUUID();
    const redisKey = `radiotedu:leader:${key}`;
    try {
        const acquired = await redisClient.set(redisKey, owner, { NX: true, PX: leaseMs });
        if (acquired !== 'OK') return false;
    } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', event: 'leader_lease_unavailable', key, errorName: error instanceof Error ? error.name : 'Error' }));
        return false;
    }

    let leaseLost = false;
    const renewTimer = setInterval(() => {
        void redisClient?.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
            { keys: [redisKey], arguments: [owner, String(leaseMs)] },
        ).then((renewed) => {
            if (Number(renewed) !== 1) leaseLost = true;
        }).catch(() => { leaseLost = true; });
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    renewTimer.unref?.();

    try {
        await task();
        return !leaseLost;
    } finally {
        clearInterval(renewTimer);
        await redisClient.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            { keys: [redisKey], arguments: [owner] },
        ).catch(() => undefined);
    }
}

export async function stopBackgroundJobs() {
    await worker?.close();
    await queue?.close();
    if (redisClient?.isOpen) await redisClient.quit().catch(() => undefined);
    worker = undefined;
    queue = undefined;
    redisClient = undefined;
}
