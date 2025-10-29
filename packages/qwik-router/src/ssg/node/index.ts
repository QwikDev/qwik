import type { SsgOptions } from '../types';
import { createSystem } from './node-system';
import { isMainThread, workerData, threadId } from 'node:worker_threads';
import { mainThread } from '../main-thread';
import { workerThread } from '../worker-thread';

export async function generate(opts: SsgOptions) {
  if (isMainThread) {
    const sys = await createSystem(opts);
    const result = await mainThread(sys);
    return result;
  }

  throw new Error(`generate() cannot be called from a worker thread`);
}

if (!isMainThread && workerData) {
  const opts = workerData as SsgOptions;
  (async () => {
    try {
      if (opts.log === 'debug') {
        // eslint-disable-next-line no-console
        console.debug(`Worker thread starting (ID: ${threadId})`);
      }
      // self initializing worker thread with workerData
      const sys = await createSystem(opts, threadId);
      await workerThread(sys);
    } catch (error) {
      console.error(`Error occurred in worker thread (ID: ${threadId}): ${error}`);
    }
  })().catch((e) => {
    console.error(e);
  });
}
