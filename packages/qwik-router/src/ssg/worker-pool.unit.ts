import { EventEmitter } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
    this.emit('exit', 1);
    return 1;
  }
  postMessage(msg: WorkerInputMessage) {
    if (this.isListening) {
      this.received.push(msg);
      if (msg.type === 'close') {
        this.emit('message', { type: 'close' } satisfies WorkerOutputMessage);
      }
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
  createLogger: async () => ({ debug() {}, error() {}, info() {}, warn() {} }),
  ensureDir: (filePath: string) => mkdir(dirname(filePath), { recursive: true }),
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

  it('renders on a fresh worker after a worker crashes', async () => {
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

  it('leaves a failed render out of the sitemap even after a 200', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'qwik-router-ssg-pool-'));
    try {
      const pool = await createWorkerPool(sys, {
        outDir,
        sitemapOutFile: join(outDir, 'sitemap.xml'),
        maxWorkers: 1,
        workerFilePath: '/run-ssg-worker.js',
      } as any);
      const [worker] = workers;
      worker.attachListener();

      const partial = pool.render({ type: 'render', pathname: '/partial', params: undefined });
      worker.emit(
        'message',
        renderResult('/partial', { error: { message: 'failed after the 200', stack: undefined } })
      );
      await partial;
      const fine = pool.render({ type: 'render', pathname: '/fine', params: undefined });
      worker.emit('message', renderResult('/fine'));
      await fine;
      await pool.close();

      const sitemap = await readFile(join(outDir, 'sitemap.xml'), 'utf-8');
      expect(sitemap).toContain('<loc>https://qwik.dev/fine</loc>');
      expect(sitemap).not.toContain('/partial');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('leaves no HTML behind when a failed render is retried as a 404', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'qwik-router-ssg-pool-'));
    try {
      const pool = await createWorkerPool(sys, {
        outDir,
        sitemapOutFile: null,
        maxWorkers: 1,
        workerFilePath: '/run-ssg-worker.js',
      } as any);
      const [worker] = workers;
      worker.attachListener();
      const indexPath = join(outDir, 'index.html');
      const aboutPath = join(outDir, 'about', 'index.html');
      const faviconPath = join(outDir, 'favicon.ico');
      await writeFile(faviconPath, 'icon');

      const failed = pool.render({ type: 'render', pathname: '/', params: undefined });
      worker.emit('message', { type: 'file', pathname: '/', filePath: indexPath });
      await writeFile(indexPath, '<html>fallback</html>');
      worker.emit(
        'message',
        renderResult('/', { ok: false, error: { message: 'caught', stack: undefined } })
      );
      await failed;
      const retried = pool.render({ type: 'render', pathname: '/', params: undefined });
      worker.emit('message', renderResult('/', { ok: false }));
      await retried;
      const about = pool.render({ type: 'render', pathname: '/about', params: undefined });
      worker.emit('message', { type: 'file', pathname: '/about', filePath: aboutPath });
      await mkdir(dirname(aboutPath), { recursive: true });
      await writeFile(aboutPath, '<html>about</html>');
      worker.emit('message', renderResult('/about', { filePath: aboutPath }));
      await about;

      await expect(access(indexPath)).rejects.toThrow();
      await expect(access(aboutPath)).resolves.toBeUndefined();
      await expect(access(faviconPath)).resolves.toBeUndefined();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('removes the files of in-flight renders when their worker exits', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const outDir = await mkdtemp(join(tmpdir(), 'qwik-router-ssg-pool-'));
    try {
      const pool = await createWorkerPool(sys, {
        outDir,
        sitemapOutFile: null,
        maxWorkers: 1,
        workerFilePath: '/run-ssg-worker.js',
      } as any);
      workers[0].attachListener();
      const indexPath = join(outDir, 'index.html');

      const crashed = pool.render({ type: 'render', pathname: '/', params: undefined });
      workers[0].emit('message', { type: 'file', pathname: '/', filePath: indexPath });
      await writeFile(indexPath, '<html>partial');
      workers[0].emit('exit', 1);
      await crashed;

      await expect(access(indexPath)).rejects.toThrow();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('restarting a worker fails its in-flight renders and keeps the pool usable', async () => {
    const pool = await createWorkerPool(sys, {
      outDir: '/out',
      sitemapOutFile: null,
      maxWorkers: 1,
      workerFilePath: '/run-ssg-worker.js',
    } as any);
    workers[0].attachListener();

    const hung = pool.render({ type: 'render', pathname: '/hang', params: undefined });
    const hungToo = pool.render({ type: 'render', pathname: '/hang-too', params: undefined });
    await pool.restartWorker('/hang');
    const next = pool.render({ type: 'render', pathname: '/fine', params: undefined });
    workers[1].attachListener();
    workers[1].emit('message', renderResult('/fine'));

    expect((await hung).error?.message).toContain('/hang');
    expect((await hungToo).error?.message).toContain('/hang');
    expect((await next).ok).toBe(true);
  });
});
