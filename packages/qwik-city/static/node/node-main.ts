import type {
  MainContext,
  StaticRoute,
  StaticGeneratorOptions,
  StaticWorkerRenderResult,
  WorkerOutputMessage,
  WorkerInputMessage,
} from '../generator/types';
import fs from 'fs';
import { cpus as nodeCpus } from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { isAbsolute, join } from 'path';
import { ensureDir } from './node-system';
import { normalizePath } from '../../buildtime/utils/fs';

export async function createNodeMainProcess(opts: StaticGeneratorOptions) {
  const currentFile = fileURLToPath(import.meta.url);
  const ssgWorkers: StaticGeneratorWorker[] = [];
  const sitemapBuffer: string[] = [];
  let sitemapPromise: Promise<any> | null = null;

  let outDir = opts.outDir;
  if (!isAbsolute(outDir)) {
    throw new Error(`"outDir" must be an absolute file path, received: ${outDir}`);
  }
  outDir = normalizePath(outDir);

  let maxWorkers = nodeCpus().length - 1;
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
      sitemapOutFile = join(outDir, sitemapOutFile);
    }
  }

  const createWorker = () => {
    let terminateResolve: (() => void) | null = null;
    const mainTasks = new Map<string, WorkerMainTask>();
    const nodeWorker = new Worker(currentFile);

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
        await nodeWorker.terminate();
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
      console.error(`worker error: ${e}`);
    });

    nodeWorker.on('exit', (code) => {
      if (code !== 1) {
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

    if (sitemapOutFile && result.ok) {
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
    ssgWorkers.length = 0;

    await Promise.all(promises);
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
