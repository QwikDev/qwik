import type { QRL } from '@qwik.dev/core';
import workerUrl from './worker.js?worker&url';
import {
  getOrCreateWorker,
  getWorkerName,
  type WorkerErrorHandler,
  type WorkerMessageHandler,
  type WorkerTransport,
} from './worker-runtime-shared';

type BrowserGlobals = typeof globalThis & {
  Worker?: typeof Worker;
};

const browserGlobals = globalThis as BrowserGlobals;

const createBrowserWorkerTransport = (worker: Worker): WorkerTransport => {
  const errorListenerMap = new Map<WorkerErrorHandler, EventListener>();
  const listenerMap = new Map<WorkerMessageHandler, EventListener>();

  return {
    offError(handler) {
      const listener = errorListenerMap.get(handler);
      if (listener) {
        errorListenerMap.delete(handler);
        worker.removeEventListener('error', listener);
      }
    },
    offMessage(handler) {
      const listener = listenerMap.get(handler);
      if (listener) {
        listenerMap.delete(handler);
        worker.removeEventListener('message', listener);
      }
    },
    onError(handler) {
      const listener = ((event: ErrorEvent) => handler(event.error ?? event)) as EventListener;
      errorListenerMap.set(handler, listener);
      worker.addEventListener('error', listener);
    },
    onMessage(handler) {
      const listener = ((event: MessageEvent) => handler(event.data)) as EventListener;
      listenerMap.set(handler, listener);
      worker.addEventListener('message', listener);
    },
    postMessage(data) {
      worker.postMessage(data);
    },
  };
};

export const getBrowserWorker = (qrl: QRL) => {
  const WorkerConstructor = browserGlobals.Worker;
  if (!WorkerConstructor) {
    return Promise.resolve(null);
  }

  return getOrCreateWorker(qrl, () =>
    createBrowserWorkerTransport(
      new WorkerConstructor(workerUrl, {
        name: getWorkerName(qrl),
        type: 'module',
      })
    )
  );
};
