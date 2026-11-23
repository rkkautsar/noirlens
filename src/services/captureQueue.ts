export interface CaptureQueueJob {
  id: string;
  /** Source language hint passed to the recognizer ('' for auto). */
  hint: string;
  image: string;
}

export interface CaptureQueueDeps<T> {
  recognize: (job: CaptureQueueJob) => Promise<T>;
  start: (id: string) => Promise<void>;
  finish: (id: string, result: T) => Promise<void>;
  fail: (id: string, message: string) => Promise<void>;
  isDeleted: (id: string) => boolean;
}

/**
 * Applies OCR results by capture id, never by arrival order, so a slow result
 * can never overwrite a newer capture. Concurrency is bounded; jobs beyond
 * the bound stay pending in storage and are picked up on the next drain.
 */
export class CaptureQueue<T> {
  private queued: CaptureQueueJob[] = [];
  private inFlight = new Set<string>();
  private active = 0;
  private disposed = false;

  constructor(
    private readonly deps: CaptureQueueDeps<T>,
    private readonly concurrency = 2,
  ) {}

  enqueue(job: CaptureQueueJob): void {
    if (
      this.disposed ||
      this.inFlight.has(job.id) ||
      this.queued.some((entry) => entry.id === job.id)
    ) {
      return;
    }
    this.queued.push(job);
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
      this.inFlight.add(job.id);
      void this.run(job).finally(() => {
        this.active -= 1;
        this.inFlight.delete(job.id);
        void this.drain();
      });
    }
  }

  private async run(job: CaptureQueueJob): Promise<void> {
    if (this.deps.isDeleted(job.id)) {
      return;
    }
    try {
      await this.deps.start(job.id);
      if (this.deps.isDeleted(job.id)) {
        return;
      }
      const result = await this.deps.recognize(job);
      if (this.deps.isDeleted(job.id)) {
        return;
      }
      await this.deps.finish(job.id, result);
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
      await this.deps.fail(job.id, message).catch(() => {});
    }
  }
}
