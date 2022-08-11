import type {
  Logger,
  MainContext,
  NormalizedStaticGeneratorOptions,
  StaticWorkerRenderConfig,
  StaticWorkerRenderResult,
} from '../generator/types';
import { cpus as nodeCpus } from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import type { NodeStaticWorkerRenderConfig, NodeStaticWorkerRenderResult } from './types';

export function createNodeMain(opts: NormalizedStaticGeneratorOptions, log: Logger) {
  const __filename = fileURLToPath(import.meta.url);

  const ssgWorkers: StaticGeneratorWorker[] = [];

  const init = async () => {
    log.debug(`Static Node: ${__filename}`);

    const maxWorkers = nodeCpus().length - 1;
    if (typeof opts.maxWorkers !== 'number') {
      opts.maxWorkers = maxWorkers;
    } else {
      opts.maxWorkers = Math.max(1, Math.min(opts.maxWorkers, maxWorkers));
    }

    log.debug(`main: max workers ${maxWorkers}, max tasks per worker ${opts.maxTasksPerWorker}`);

    for (let i = 0; i < opts.maxWorkers; i++) {
      ssgWorkers.push(createWorker(i));
    }

    log.debug(`main: created ${ssgWorkers.length} worker(s)`);
  };

  const createWorker = (index: number) => {
    const mainTasks = new Map<number, WorkerMainTask>();
    const nodeWorker = new Worker(__filename);
    log.debug(`main: created worker ${index}`);

    const ssgWorker: StaticGeneratorWorker = {
      activeTasks: 0,

      totalTasks: 0,

      render: (input) => {
        return new Promise((resolve, reject) => {
          ssgWorker.activeTasks++;
          const taskId = ssgWorker.totalTasks++;
          try {
            mainTasks.set(taskId, resolve);
            const taskInput: NodeStaticWorkerRenderConfig = {
              taskId,
              ...input,
            };
            nodeWorker.postMessage(taskInput);
          } catch (e) {
            ssgWorker.activeTasks--;
            mainTasks.delete(taskId);
            reject(e);
          }
        });
      },

      terminate: async () => {
        mainTasks.clear();
        log.debug(`main: terminated worker ${index}`);
        await nodeWorker.terminate();
      },
    };

    nodeWorker.on('message', (rsp: NodeStaticWorkerRenderResult) => {
      const mainTask = mainTasks.get(rsp.taskId);
      if (mainTask) {
        mainTasks.delete(rsp.taskId);
        ssgWorker.activeTasks--;
        mainTask(rsp);
      }
    });

    nodeWorker.on('error', (e) => {
      log.debug(`main: worker ${index} error: ${e}`);
    });

    nodeWorker.on('exit', (code) => {
      if (code !== 1) {
        log.error(`main: worker ${index} exit ${code}`);
      } else {
        log.debug(`main: worker ${index} exit ${code}`);
      }
    });

    return ssgWorker;
  };

  const hasAvailableWorker = () => {
    const ssgWorker = ssgWorkers.sort(ssgWorkerCompare)[0];
    if (ssgWorker) {
      return ssgWorker.activeTasks < opts.maxTasksPerWorker;
    }
    return false;
  };

  const render = (config: StaticWorkerRenderConfig) => {
    const ssgWorker = ssgWorkers.sort(ssgWorkerCompare)[0]!;
    return ssgWorker.render(config);
  };

  const dispose = async () => {
    await Promise.all(
      ssgWorkers.map(async (ssgWorker) => {
        try {
          await ssgWorker.terminate();
        } catch (e) {
          log.error(e);
        }
      })
    );
    ssgWorkers.length = 0;
  };

  const mainCtx: MainContext = {
    init,
    hasAvailableWorker,
    render,
    dispose,
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

type WorkerMainTask = (result: NodeStaticWorkerRenderResult) => void;

interface StaticGeneratorWorker {
  activeTasks: number;
  totalTasks: number;
  render: (req: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>;
  terminate: () => Promise<void>;
}
