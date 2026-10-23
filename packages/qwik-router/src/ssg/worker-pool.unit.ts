import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  SsgWorkerRenderResult,
  System,
  WorkerInputMessage,
  WorkerOutputMessage,
} from './types';

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

const renderResult = (pathname: string, overrides: Partial<SsgWorkerRenderResult> = {}) =>
  ({
    type: 'render',
    pathname,
    url: `https://qwik.dev${pathname}`,
    ok: true,
    error: null,
    filePath: null,
    contentType: 'text/html',
    resourceType: 'page',
    ...overrides,
  }) satisfies WorkerOutputMessage;

describe('createWorkerPool', () => {
  afterEach(() => {
    workers.length = 0;
    vi.restoreAllMocks();
  });

  describe('worker startup', () => {
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

    it('does not replace a worker that crashes during startup', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await createWorkerPool(sys, {
        outDir: '/out',
        sitemapOutFile: null,
        maxWorkers: 1,
        workerFilePath: '/run-ssg-worker.js',
      } as any);

      workers[0].emit('error', new Error('entry.ssr failed to load'));
      workers[0].emit('exit', 1);

      expect(workers).toHaveLength(1);
    });

    it('fails waiting routes with the startup error when a worker crashes during startup', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const pool = await createWorkerPool(sys, {
        outDir: '/out',
        sitemapOutFile: null,
        maxWorkers: 1,
        workerFilePath: '/run-ssg-worker.js',
      } as any);

      const rendered = pool.render({ type: 'render', pathname: '/', params: undefined });
      workers[0].emit('error', new Error('entry.ssr failed to load'));
      workers[0].emit('exit', 1);

      await expect(rendered).rejects.toThrow('entry.ssr failed to load');
    });
  });

  describe('worker crashes', () => {
    it('replaces a crashed worker so later routes still render', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const pool = await createWorkerPool(sys, {
        outDir: '/out',
        sitemapOutFile: null,
        maxWorkers: 1,
        workerFilePath: '/run-ssg-worker.js',
      } as any);
      workers[0].attachListener();

      const crashed = pool.render({ type: 'render', pathname: '/crash', params: undefined });
      workers[0].emit('exit', 1);
      const next = pool.render({ type: 'render', pathname: '/fine', params: undefined });
      workers[1].attachListener();
      workers[1].emit('message', renderResult('/fine'));

      expect((await crashed).error?.message).toContain('Worker exited');
      expect((await next).ok).toBe(true);
    });
  });
});
