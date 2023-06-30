import { isMainThread, workerData } from 'node:worker_threads';
import { patchGlobalThis } from 'packages/qwik-city/middleware/node/node-fetch';
import { mainThread } from '../main-thread';
import type { StaticGenerateOptions } from '../types';
import { workerThread } from '../worker-thread';
import { createSystem } from './node-system';

export async function generate(opts: StaticGenerateOptions) {
  if (isMainThread) {
    const sys = await createSystem(opts);
    const result = await mainThread(sys);
    return result;
  }

  throw new Error(`generate() cannot be called from a worker thread`);
}

if (!isMainThread && workerData) {
  (async () => {
    patchGlobalThis();

    // self initializing worker thread with workerData
    const sys = await createSystem(workerData);
    await workerThread(sys);
  })();
}
