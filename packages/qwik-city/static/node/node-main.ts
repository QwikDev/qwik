import type {
  MainContext,
  StaticGeneratorOptions,
  StaticWorkerRenderConfig,
  StaticWorkerRenderResult,
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
  if (sitemapOutFile) {
    if (!isAbsolute(sitemapOutFile)) {
      sitemapOutFile = join(outDir, sitemapOutFile);
    }
  }

  const createWorker = (index: number) => {
    const mainTasks = new Map<string, WorkerMainTask>();
    const nodeWorker = new Worker(currentFile);

    const ssgWorker: StaticGeneratorWorker = {
      activeTasks: 0,
      totalTasks: 0,

      render: (config) => {
        return new Promise((resolve, reject) => {
          try {
            ssgWorker.activeTasks++;
            ssgWorker.totalTasks++;
            mainTasks.set(config.pathname, resolve);
            nodeWorker.postMessage(config);
          } catch (e) {
            ssgWorker.activeTasks--;
            mainTasks.delete(config.pathname);
            reject(e);
          }
        });
      },

      terminate: async () => {
        mainTasks.clear();
        await nodeWorker.terminate();
      },
    };

    nodeWorker.on('message', (result: StaticWorkerRenderResult) => {
      const mainTask = mainTasks.get(result.pathname);
      if (mainTask) {
        mainTasks.delete(result.pathname);
        ssgWorker.activeTasks--;
        mainTask(result);
      }
    });

    nodeWorker.on('error', (e) => {
      console.error(`worker ${index} error: ${e}`);
    });

    nodeWorker.on('exit', (code) => {
      if (code !== 1) {
        console.error(`worker ${index} exit ${code}`);
      }
    });

    return ssgWorker;
  };

  const hasAvailableWorker = () => {
    const ssgWorker = ssgWorkers.sort(ssgWorkerCompare)[0];
    if (ssgWorker) {
      return ssgWorker.activeTasks < maxTasksPerWorker;
    }
    return false;
  };

  const render = async (config: StaticWorkerRenderConfig) => {
    const ssgWorker = ssgWorkers.sort(ssgWorkerCompare)[0]!;

    const result = await ssgWorker.render(config);

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
    ssgWorkers.push(createWorker(i));
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
  if (a.totalTasks < b.totalTasks) {
    return -1;
  }
  if (a.totalTasks > b.totalTasks) {
    return 1;
  }
  return Math.random() < 0.5 ? -1 : 1;
}

type WorkerMainTask = (result: StaticWorkerRenderResult) => void;

interface StaticGeneratorWorker {
  activeTasks: number;
  totalTasks: number;
  render: (config: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>;
  terminate: () => Promise<void>;
}
