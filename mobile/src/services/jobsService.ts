import api from './api';

export interface BackgroundJobStatus<T = unknown> {
  id: string;
  name: string;
  state: string;
  progress: number | Record<string, unknown>;
  result: T | null;
  failed: boolean;
  finishedAt: string | null;
}

export async function waitForBackgroundJob<T = unknown>(jobId: string): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30 * 60_000) {
    const response = await api.get(`/jobs/${encodeURIComponent(jobId)}`);
    const job = response.data?.data as BackgroundJobStatus<T> | undefined;
    if (!job) throw new Error('Job status was not returned');
    if (job.state === 'completed') return job.result as T;
    if (job.state === 'failed' || job.failed) throw new Error('Background job failed');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error('Background job timed out while waiting');
}
