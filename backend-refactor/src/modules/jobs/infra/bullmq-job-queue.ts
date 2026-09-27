import { Queue, Worker, type JobsOptions, type RedisOptions } from 'bullmq';
import type { JobQueue } from '../../../core/ports/job-queue.port.js';
import { ServiceUnavailableError } from '../../../core/errors/app-error.js';
import { logger } from '../../../core/logging/logger.js';

export interface JobPayload { requestedBy: string; feedId?: string; songId?: string }
export type JobProcessor = (name: string, payload: JobPayload, updateProgress: (value: number) => Promise<void>) => Promise<unknown>;

function connectionOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number.parseInt(url.pathname.slice(1), 10) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379)),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
    enableReadyCheck: false,
  };
}

const queueName = 'radiotedu-background-jobs';

export class BullMqJobQueue implements JobQueue {
  private readonly queue: Queue<JobPayload>;
  private readonly worker: Worker<JobPayload>;

  constructor(redisUrl: string, processor: JobProcessor) {
    const connection = connectionOptions(redisUrl);
    this.queue = new Queue<JobPayload>(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 2_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
      },
    });
    this.worker = new Worker<JobPayload>(queueName, (job) => processor(job.name, job.data, (progress) => job.updateProgress(progress)), { connection, concurrency: 2 });
    this.queue.on('error', (error) => logger.error({ err: error }, 'BullMQ queue connection error'));
    this.worker.on('error', (error) => logger.error({ err: error }, 'BullMQ worker connection error'));
  }

  async enqueue<TPayload>(name: string, payload: TPayload, options?: { jobId?: string }) {
    try {
      const job = await this.queue.add(name, payload as JobPayload, { ...(options?.jobId ? { jobId: options.jobId } : {}) } satisfies JobsOptions);
      return { jobId: String(job.id) };
    } catch (error) { throw new ServiceUnavailableError('Background jobs are unavailable', 'JOBS_UNAVAILABLE', { cause: error }); }
  }

  async getJobStatus(jobId: string) {
    let job;
    try { job = await this.queue.getJob(jobId); }
    catch (error) { throw new ServiceUnavailableError('Background jobs are unavailable', 'JOBS_UNAVAILABLE', { cause: error }); }
    if (!job) return null;
    return {
      ownerId: job.data.requestedBy,
      id: String(job.id),
      name: job.name,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue ?? null,
      failed: Boolean(job.failedReason),
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
  }

  async readinessCheck() {
    await this.queue.waitUntilReady();
    await this.queue.getJobCounts('waiting', 'active', 'failed');
    await this.worker.waitUntilReady();
  }

  async close() {
    await this.worker.close();
    await this.queue.close();
  }
}
