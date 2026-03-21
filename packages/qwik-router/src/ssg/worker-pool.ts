import type {
  MainContext,
  SsgGenerateOptions,
  SsgRoute,
  SsgWorkerRenderResult,
  WorkerOutputMessage,
  WorkerInputMessage,
  System,
} from './types';
import fs from 'node:fs';
import { cpus as nodeCpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { isAbsolute, resolve } from 'node:path';
import { normalizePath } from '../utils/fs';

export async function createWorkerPool(sys: System, opts: SsgGenerateOptions) {
  const ssgWorkers: SsgWorker[] = [];
  const sitemapBuffer: string[] = [];
  let sitemapStream: fs.WriteStream | null = null;

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

  // workerFilePath must be provided - it points to the entry file that handles both
  // main thread and worker thread modes (detected via isMainThread)
  if (!opts.workerFilePath) {
    throw new Error('Missing "workerFilePath" option for SSG worker creation');
  }
  // Node's Worker requires a URL object for file:// URLs, not a string
  const workerFilePath =
    typeof opts.workerFilePath === 'string' && opts.workerFilePath.startsWith('file://')
      ? new URL(opts.workerFilePath)
      : opts.workerFilePath;

  // workerData only carries serializable options (no functions like render/qwikRouterConfig)
  const { render: _r, qwikRouterConfig: _c, workerFilePath: _w, ...workerData } = opts;

  const createWorker = () => {
    let terminateResolve: (() => void) | null = null;
    const mainTasks = new Map<string, WorkerMainTask>();
    let terminateTimeout: number | null = null;

    const nodeWorker = new Worker(workerFilePath, { workerData });
    nodeWorker.unref();

    const ssgWorker: SsgWorker = {
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
          terminateResolve = () => {
            // Worker acknowledged close, it will exit naturally
            resolve();
          };
          // Fallback: force-terminate if worker doesn't respond within 1s
          terminateTimeout = setTimeout(async () => {
            terminateTimeout = null;
            terminateResolve = null;
            await nodeWorker.terminate();
            resolve();
          }, 1000) as unknown as number;
          nodeWorker.postMessage(msg);
        });
        // If worker responded gracefully, cancel the force-terminate
        if (terminateTimeout) {
          clearTimeout(terminateTimeout);
          terminateTimeout = null;
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
      if (terminateTimeout) {
        clearTimeout(terminateTimeout);
        terminateTimeout = null;
      }
      // Resolve any pending tasks so the main thread doesn't hang
      if (mainTasks.size > 0) {
        for (const [pathname, resolve] of mainTasks) {
          ssgWorker.activeTasks--;
          resolve({
            type: 'render',
            pathname,
            url: '',
            ok: false,
            error: { message: `Worker exited with code ${code}`, stack: undefined },
            filePath: null,
            contentType: null,
            resourceType: null,
          });
        }
        mainTasks.clear();
      }
      // Resolve terminate if it was waiting
      if (terminateResolve) {
        terminateResolve();
        terminateResolve = null;
      }
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

  const render = async (ssgRoute: SsgRoute) => {
    const ssgWorker = getNextWorker();

    const result = await ssgWorker.render(ssgRoute);

    if (sitemapOutFile && result.ok && result.resourceType === 'page') {
      sitemapBuffer.push(`<url><loc>${result.url}</loc></url>`);
      if (sitemapBuffer.length > 50) {
        const siteMapUrls = sitemapBuffer.join('\n') + '\n';
        sitemapBuffer.length = 0;
        if (sitemapStream) {
          sitemapStream.write(siteMapUrls);
        }
      }
    }

    return result;
  };

  const close = async () => {
    const promises: Promise<unknown>[] = [];

    if (sitemapStream) {
      sitemapBuffer.push(`</urlset>`);
      sitemapStream.write(sitemapBuffer.join('\n'));
      sitemapBuffer.length = 0;

      await new Promise<void>((resolve, reject) => {
        if (sitemapStream) {
          sitemapStream.end((err?: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });

      sitemapStream = null;
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
    await sys.ensureDir(sitemapOutFile);
    sitemapStream = fs.createWriteStream(sitemapOutFile, {
      flags: 'w',
    });

    sitemapStream.write(
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

function ssgWorkerCompare(a: SsgWorker, b: SsgWorker) {
  if (a.activeTasks < b.activeTasks) {
    return -1;
  }
  if (a.activeTasks > b.activeTasks) {
    return 1;
  }
  return a.totalTasks < b.totalTasks ? -1 : 1;
}

type WorkerMainTask = (result: SsgWorkerRenderResult) => void;

interface SsgWorker {
  activeTasks: number;
  totalTasks: number;
  render: (staticRoute: SsgRoute) => Promise<SsgWorkerRenderResult>;
  terminate: () => Promise<void>;
}
