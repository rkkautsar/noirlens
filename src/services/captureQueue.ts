export interface CaptureQueueJob {
  id: string;
  /** Source language hint passed to the recognizer ('' for auto). */
  hint: string;
  image: string;
  /** OCR revision; results are only applied while this is current. */
  revision: number;
}

export interface CaptureQueueDeps<T> {
  recognize: (job: CaptureQueueJob) => Promise<T>;
  start: (job: CaptureQueueJob) => Promise<void>;
  finish: (job: CaptureQueueJob, result: T) => Promise<void>;
  fail: (job: CaptureQueueJob, message: string) => Promise<void>;
  isDeleted: (id: string) => boolean;
}

/**
 * Applies OCR results by capture id, never by arrival order, so a slow result
 * can never overwrite a newer capture. Concurrency is bounded; jobs beyond
 * the bound stay pending in storage and are picked up on the next drain.
 */
export class CaptureQueue<T> {
  private queued: CaptureQueueJob[] = [];
  private activeRevisions = new Map<string, number>();
  private active = 0;
  private disposed = false;

  constructor(
    private readonly deps: CaptureQueueDeps<T>,
    private readonly concurrency = 2,
  ) {}

  enqueue(job: CaptureQueueJob): void {
    if (this.disposed) {
      return;
    }
    // Same-revision duplicates (a double Retry) are dropped. A newer revision
    // is queued behind an active job; an older one is stale and dropped.
    const activeRevision = this.activeRevisions.get(job.id);
    if (activeRevision !== undefined && job.revision <= activeRevision) {
      return;
    }
    const queuedIndex = this.queued.findIndex((entry) => entry.id === job.id);
    if (queuedIndex >= 0) {
      if (job.revision <= this.queued[queuedIndex]!.revision) {
        return;
      }
      this.queued[queuedIndex] = job;
    } else {
      this.queued.push(job);
    }
    void this.drain();
  }

  get size(): number {
    return this.queued.length + this.active;
  }

  dispose(): void {
    this.disposed = true;
    this.queued = [];
  }

  private async drain(): Promise<void> {
    while (!this.disposed && this.active < this.concurrency) {
      const job = this.queued.shift();
      if (!job) {
        return;
      }
      this.active += 1;
      this.activeRevisions.set(job.id, job.revision);
      void this.run(job).finally(() => {
        this.active -= 1;
        if (this.activeRevisions.get(job.id) === job.revision) {
          this.activeRevisions.delete(job.id);
        }
        void this.drain();
      });
    }
  }

  private async run(job: CaptureQueueJob): Promise<void> {
    if (this.deps.isDeleted(job.id)) {
      return;
    }
    try {
      await this.deps.start(job);
      if (this.deps.isDeleted(job.id)) {
        return;
      }
      const result = await this.deps.recognize(job);
      if (this.deps.isDeleted(job.id)) {
        return;
      }
      await this.deps.finish(job, result);
    } catch (error) {
      if (this.deps.isDeleted(job.id)) {
        return;
      }
      const message =
        typeof error === 'object' &&
        error !== null &&
        typeof (error as Record<string, unknown>).message === 'string'
          ? ((error as Record<string, unknown>).message as string)
          : 'Text recognition failed.';
      await this.deps.fail(job, message).catch(() => {});
    }
  }
}
