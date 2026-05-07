import { $, implicit$FirstArg, type QRL } from '@qwik.dev/core';
import { sanitizeWorkerArgs } from './worker-args';
import { getWorkerTransport, invokeWorker } from './worker-runtime';

/** @public */
export interface WorkerFunction {
  (...args: any[]): any;
}

/** @public */
export interface WorkerConstructorQRL {
  <T extends WorkerFunction>(fnQrl: QRL<T>): QRL<T>;
}

/** @public */
export const workerQrl: WorkerConstructorQRL = (qrl) => {
  return $(async (...args: any[]) => {
    const filtered = sanitizeWorkerArgs(args);
    const worker = await getWorkerTransport(qrl);
    if (!worker) {
      // Last resort for runtimes without worker support.
      return qrl(...filtered);
    }
    return invokeWorker(worker, qrl, filtered);
  }) as any;
};

/** @public */
export const worker$ = implicit$FirstArg(workerQrl);
