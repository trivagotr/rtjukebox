export interface JobQueue {
  enqueue<TPayload>(
    name: string,
    payload: TPayload,
    options?: { jobId?: string },
  ): Promise<{ jobId: string }>;
}
