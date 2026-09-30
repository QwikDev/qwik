import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { System, WorkerInputMessage, WorkerOutputMessage } from './types';

const workers = vi.hoisted(() => [] as InstanceType<typeof FakeWorker>[]);

// Mimics Bun: messages posted before the worker has attached its listener are dropped.
class FakeWorker extends EventEmitter {
  received: WorkerInputMessage[] = [];
  isListening = false;
  constructor() {
    super();
    workers.push(this);
  }
  unref() {}
  async terminate() {
    return 0;
  }
  postMessage(msg: WorkerInputMessage) {
    if (this.isListening) {
      this.received.push(msg);
    }
  }
  attachListener() {
    this.isListening = true;
    this.emit('message', { type: 'ready' } satisfies WorkerOutputMessage);
  }
}

vi.mock('node:worker_threads', () => ({ Worker: FakeWorker }));

const { createWorkerPool } = await import('./worker-pool');

const sys = {
  createLogger: async () => ({ debug() {}, error() {}, info() {} }),
} as unknown as System;

describe('createWorkerPool', () => {
  afterEach(() => {
    workers.length = 0;
  });

  it('holds render messages until the worker is ready', async () => {
    const pool = await createWorkerPool(sys, {
      outDir: '/out',
      sitemapOutFile: null,
      maxWorkers: 1,
      workerFilePath: '/run-ssg-worker.js',
    } as any);
    const [worker] = workers;

    const rendered = pool.render({ type: 'render', pathname: '/', params: undefined } as any);
    await Promise.resolve();
    worker.attachListener();
    await vi.waitFor(() => expect(worker.received).toHaveLength(1));

    worker.emit('message', {
      type: 'render',
      pathname: '/',
      url: 'https://example.com/',
      ok: true,
      error: null,
      filePath: null,
      contentType: null,
      resourceType: null,
    } satisfies WorkerOutputMessage);
    await expect(rendered).resolves.toMatchObject({ pathname: '/', ok: true });
  });
});
