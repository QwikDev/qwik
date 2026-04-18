import type { QRL } from '@qwik.dev/core';
import { _serialize } from '@qwik.dev/core/internal';

export type WorkerMessageHandler = (data: unknown) => void;
export type WorkerErrorHandler = (error: unknown) => void;

export interface WorkerTransport {
  offError(handler: WorkerErrorHandler): void;
  offMessage(handler: WorkerMessageHandler): void;
  onError(handler: WorkerErrorHandler): void;
  onMessage(handler: WorkerMessageHandler): void;
  postMessage(data: unknown): void;
}

type WorkerResponseMessage = [requestId: number, ok: boolean, payload: unknown];

const qwikWorkers = new Map<string, WorkerTransport>();
const pendingWorkers = new Map<string, Promise<WorkerTransport | null>>();
let nextWorkerRequestId = 0;

const getWorkerRequestId = () => ++nextWorkerRequestId;
const getWorkerHash = (qrl: QRL) => qrl.getHash();

export const getWorkerName = (qrl: QRL) => `worker$(${qrl.getSymbol()})`;

export const getOrCreateWorker = (
  qrl: QRL,
  createWorker: () => WorkerTransport | Promise<WorkerTransport | null> | null
) => {
  const workerHash = getWorkerHash(qrl);
  const cachedWorker = qwikWorkers.get(workerHash);
  if (cachedWorker) {
    return Promise.resolve(cachedWorker);
  }

  const pendingWorker = pendingWorkers.get(workerHash);
  if (pendingWorker) {
    return pendingWorker;
  }

  const workerPromise = Promise.resolve(createWorker())
    .then((worker) => {
      if (worker) {
        qwikWorkers.set(workerHash, worker);
      }
      return worker;
    })
    .finally(() => {
      pendingWorkers.delete(workerHash);
    });

  pendingWorkers.set(workerHash, workerPromise);
  return workerPromise;
};

const isWorkerResponseMessage = (
  messageData: unknown,
  requestId: number
): messageData is WorkerResponseMessage =>
  Array.isArray(messageData) && messageData.length === 3 && messageData[0] === requestId;

export const invokeWorker = async (worker: WorkerTransport, qrl: QRL, args: any[]) => {
  const requestId = getWorkerRequestId();
  const data = await _serialize([qrl, ...args]);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.offError(errorHandler);
      worker.offMessage(messageHandler);
    };
    const errorHandler = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const messageHandler = (messageData: unknown) => {
      if (isWorkerResponseMessage(messageData, requestId)) {
        cleanup();
        if (messageData[1]) {
          resolve(messageData[2]);
        } else {
          reject(messageData[2]);
        }
      }
    };

    worker.onError(errorHandler);
    worker.onMessage(messageHandler);
    worker.postMessage([requestId, data]);
  });
};

export const __clearWorkerRuntimeCache = () => {
  qwikWorkers.clear();
  pendingWorkers.clear();
  nextWorkerRequestId = 0;
};
