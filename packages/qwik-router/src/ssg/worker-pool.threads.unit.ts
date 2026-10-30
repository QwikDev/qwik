import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { System } from './types';
import { createWorkerPool } from './worker-pool';

const fixtureWorker = `
import { writeFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

parentPort.on('message', (msg) => {
  if (msg.type === 'close') {
    parentPort.postMessage({ type: 'close' });
    parentPort.close();
    return;
  }
  const filePath = workerData.outDir + msg.pathname + '.html';
  parentPort.postMessage({ type: 'file', pathname: msg.pathname, filePath });
  writeFileSync(filePath, '<html>' + msg.pathname + '</html>');
  if (msg.pathname === '/hang') {
    return;
  }
  parentPort.postMessage({
    type: 'render',
    pathname: msg.pathname,
    url: 'https://qwik.dev' + msg.pathname,
    ok: true,
    error: null,
    filePath,
    contentType: 'text/html',
    resourceType: 'page',
  });
});
parentPort.postMessage({ type: 'ready' });
`;

const sys = {
  createLogger: async () => ({ debug() {}, error() {}, info() {}, warn() {} }),
} as unknown as System;

describe('createWorkerPool with real worker threads', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'qwik-router-ssg-threads-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("deletes a timed-out route's files before the worker restart finishes", async () => {
    const workerFilePath = join(outDir, 'worker.mjs');
    await writeFile(workerFilePath, fixtureWorker);
    const pool = await createWorkerPool(sys, {
      outDir,
      sitemapOutFile: null,
      maxWorkers: 1,
      workerFilePath,
    } as any);
    try {
      const hangPath = join(outDir, 'hang.html');
      void pool.render({ type: 'render', pathname: '/hang', params: undefined });
      await vi.waitFor(() => access(hangPath));

      await pool.restartWorker('/hang');

      await expect(access(hangPath)).rejects.toThrow();
      const fine = await pool.render({ type: 'render', pathname: '/fine', params: undefined });
      expect(fine.ok).toBe(true);
    } finally {
      await pool.close();
    }
  });
});
