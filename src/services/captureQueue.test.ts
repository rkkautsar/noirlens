import { describe, expect, it } from 'vitest';

import { CaptureQueue, type CaptureQueueDeps } from './captureQueue';

interface Result {
  id: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function job(id: string, revision = 0) {
  return { id, hint: '', image: `${id}.jpg`, revision };
}

function harness(options: { deleted?: Set<string> } = {}) {
  const deleted = options.deleted ?? new Set<string>();
  const finished: string[] = [];
  const failed: { id: string; message: string }[] = [];
  const started: string[] = [];
  let active = 0;
  let maxActive = 0;
  const deps: CaptureQueueDeps<Result> = {
    recognize: async (job) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await delay(10);
        return { id: job.id };
      } finally {
        active -= 1;
      }
    },
    start: async (job) => {
      started.push(job.id);
    },
    finish: async (job) => {
      finished.push(job.id);
    },
    fail: async (job, message) => {
      failed.push({ id: job.id, message });
    },
    isDeleted: (id) => deleted.has(id),
  };
  return {
    deps,
    finished,
    failed,
    started,
    deleted,
    maxActive: () => maxActive,
  };
}

describe('CaptureQueue', () => {
  it('applies each result to its own capture regardless of order', async () => {
    const h = harness();
    const queue = new CaptureQueue(h.deps, 2);
    queue.enqueue(job('a'));
    queue.enqueue(job('b'));
    await delay(50);
    expect(h.finished.sort()).toEqual(['a', 'b']);
    expect(h.maxActive()).toBeLessThanOrEqual(2);
  });

  it('never exceeds the concurrency bound', async () => {
    const h = harness();
    const queue = new CaptureQueue(h.deps, 1);
    queue.enqueue(job('a'));
    queue.enqueue(job('b'));
    queue.enqueue(job('c'));
    await delay(80);
    expect(h.maxActive()).toBe(1);
    expect(h.finished.sort()).toEqual(['a', 'b', 'c']);
  });

  it('records failures and keeps draining', async () => {
    const h = harness();
    const queue = new CaptureQueue(
      {
        ...h.deps,
        recognize: async (job) => {
          if (job.id === 'a') {
            throw new Error('OCR exploded');
          }
          return { id: job.id };
        },
      },
      1,
    );
    queue.enqueue(job('a'));
    queue.enqueue(job('b'));
    await delay(60);
    expect(h.failed).toEqual([{ id: 'a', message: 'OCR exploded' }]);
    expect(h.finished).toEqual(['b']);
  });

  it('skips captures deleted mid-flight', async () => {
    const h = harness();
    const queue = new CaptureQueue(
      {
        ...h.deps,
        recognize: async (job) => {
          h.deleted.add(job.id);
          return { id: job.id };
        },
      },
      1,
    );
    queue.enqueue(job('a'));
    await delay(30);
    expect(h.finished).toEqual([]);
    expect(h.failed).toEqual([]);
  });

  it('queues a rerun behind an active job for the same capture', async () => {
    const h = harness();
    const queue = new CaptureQueue(h.deps, 1);
    queue.enqueue(job('a', 1));
    queue.enqueue(job('a', 2));
    await delay(60);
    // Both run; the revision guard in the deps decides which result wins.
    expect(h.started).toEqual(['a', 'a']);
  });
});
