import type {
  MainContext,
  StaticGenerateOptions,
  StaticRoute,
  StaticWorkerRenderResult,
  WorkerOutputMessage,
  WorkerInputMessage,
  System,
} from '../types';
import fs from 'node:fs';
import { cpus as nodeCpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { ensureDir } from './node-system';
import { normalizePath } from '../../utils/fs';

export async function createNodeMainProcess(sys: System, opts: StaticGenerateOptions) {
  const ssgWorkers: StaticGeneratorWorker[] = [];
  const sitemapBuffer: string[] = [];
  let sitemapPromise: Promise<any> | null = null;
  let hasExited = false;
  opts = { ...opts };

  let outDir = opts.outDir;
  if (typeof outDir !== 'string') {
    throw new Error(`Missing "outDir" option`);
  }
  if (!isAbsolute(outDir)) {
    throw new Error(`"outDir" must be an absolute file path, received: ${outDir}`);
  }
  outDir = normalizePath(outDir);

  let maxWorkers = nodeCpus().length;
  if (typeof opts.maxWorkers === 'number') {
    maxWorkers = Math.max(1, Math.min(opts.maxWorkers, maxWorkers));
  }

  let maxTasksPerWorker = 20;
  if (typeof opts.maxTasksPerWorker === 'number') {
    maxTasksPerWorker = Math.max(1, Math.min(opts.maxTasksPerWorker, 50));
  }

  let sitemapOutFile = opts.sitemapOutFile;
  if (sitemapOutFile !== null) {
    if (typeof sitemapOutFile !== 'string') {
      sitemapOutFile = 'sitemap.xml';
    }
    if (!isAbsolute(sitemapOutFile)) {
      sitemapOutFile = resolve(outDir, sitemapOutFile);
    }
  }

  const createWorker = () => {
    let terminateResolve: (() => void) | null = null;
    const mainTasks = new Map<string, WorkerMainTask>();

    let workerFilePath: string | URL;

    // Launch the worker using the package's index module, which bootstraps the worker thread.
    if (typeof __filename === 'string') {
      // CommonJS path
      const ext = extname(__filename) || '.js';
      workerFilePath = join(dirname(__filename), `index${ext}`);
    } else {
      // ESM path (import.meta.url)
      const thisUrl = new URL(import.meta.url);
      const pathname = thisUrl.pathname || '';
      let ext = '.js';
      if (pathname.endsWith('.ts')) {
        ext = '.ts';
      } else if (pathname.endsWith('.mjs')) {
        ext = '.mjs';
      }

      workerFilePath = new URL(`./index${ext}`, thisUrl);
    }

    const nodeWorker = new Worker(workerFilePath, { workerData: opts });
    nodeWorker.unref();
    const ssgWorker: StaticGeneratorWorker = {
      activeTasks: 0,
      totalTasks: 0,

      render: (staticRoute) => {
        return new Promise((resolve, reject) => {
          try {
            ssgWorker.activeTasks++;
            ssgWorker.totalTasks++;
            mainTasks.set(staticRoute.pathname, resolve);
            nodeWorker.postMessage(staticRoute);
          } catch (e) {
            ssgWorker.activeTasks--;
            mainTasks.delete(staticRoute.pathname);
            reject(e);
          }
        });
      },

      terminate: async () => {
        mainTasks.clear();
        const msg: WorkerInputMessage = { type: 'close' };
        await new Promise<void>((resolve) => {
          terminateResolve = resolve;
          nodeWorker.postMessage(msg);
        });
        // Wait for worker to exit naturally (it calls process.exit(0) after close)
        // If it doesn't exit in time, force terminate
        const maxWaitMs = 1000;
        const startTime = Date.now();
        while (!hasExited && Date.now() - startTime < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (!hasExited) {
          await nodeWorker.terminate();
        }
      },
    };

    nodeWorker.on('message', (msg: WorkerOutputMessage) => {
      switch (msg.type) {
        case 'render': {
          const mainTask = mainTasks.get(msg.pathname);
          if (mainTask) {
            mainTasks.delete(msg.pathname);
            ssgWorker.activeTasks--;
            mainTask(msg);
          }
          break;
        }
        case 'close': {
          if (terminateResolve) {
            terminateResolve();
            terminateResolve = null;
          }
          break;
        }
      }
    });

    nodeWorker.on('error', (e) => {
      console.error(`worker error`, e);
    });

    nodeWorker.on('exit', (code) => {
      hasExited = true;
      if (code !== 0) {
        console.error(`worker exit ${code}`);
      }
    });

    return ssgWorker;
  };

  const getNextWorker = () => ssgWorkers.sort(ssgWorkerCompare)[0];

  const hasAvailableWorker = () => {
    const ssgWorker = getNextWorker();
    return ssgWorker.activeTasks < maxTasksPerWorker;
  };

  const render = async (staticRoute: StaticRoute) => {
    const ssgWorker = getNextWorker();

    const result = await ssgWorker.render(staticRoute);

    if (sitemapOutFile && result.ok && result.resourceType === 'page') {
      sitemapBuffer.push(`<url><loc>${result.url}</loc></url>`);
      if (sitemapBuffer.length > 50) {
        if (sitemapPromise) {
          await sitemapPromise;
        }
        const siteMapUrls = sitemapBuffer.join('\n') + '\n';
        sitemapBuffer.length = 0;
        sitemapPromise = fs.promises.appendFile(sitemapOutFile, siteMapUrls);
      }
    }

    return result;
  };

  const close = async () => {
    const promises: Promise<any>[] = [];

    if (sitemapOutFile) {
      if (sitemapPromise) {
        await sitemapPromise;
      }
      sitemapBuffer.push(`</urlset>`);
      promises.push(fs.promises.appendFile(sitemapOutFile, sitemapBuffer.join('\n')));
      sitemapBuffer.length = 0;
    }

    for (const ssgWorker of ssgWorkers) {
      try {
        promises.push(ssgWorker.terminate());
      } catch (e) {
        console.error(e);
      }
    }

    await Promise.all(promises);
    ssgWorkers.length = 0;

    // On Windows, give extra time for all workers to fully exit
    // This prevents resource conflicts in back-to-back builds
    if (process.platform === 'win32') {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  if (sitemapOutFile) {
    await ensureDir(sitemapOutFile);
    await fs.promises.writeFile(
      sitemapOutFile,
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    );
  }

  for (let i = 0; i < maxWorkers; i++) {
    ssgWorkers.push(createWorker());
    // On Windows, add delay between worker creation to avoid resource contention
    if (process.platform === 'win32' && i < maxWorkers - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const mainCtx: MainContext = {
    hasAvailableWorker,
    render,
    close,
  };

  return mainCtx;
}

function ssgWorkerCompare(a: StaticGeneratorWorker, b: StaticGeneratorWorker) {
  if (a.activeTasks < b.activeTasks) {
    return -1;
  }
  if (a.activeTasks > b.activeTasks) {
    return 1;
  }
  return a.totalTasks < b.totalTasks ? -1 : 1;
}

type WorkerMainTask = (result: StaticWorkerRenderResult) => void;

interface StaticGeneratorWorker {
  activeTasks: number;
  totalTasks: number;
  render: (staticRoute: StaticRoute) => Promise<StaticWorkerRenderResult>;
  terminate: () => Promise<void>;
}
