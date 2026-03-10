import { parentPort } from 'node:worker_threads';
import type { WorkerInputMessage, WorkerOutputMessage } from '../types';

export async function createNodeWorkerProcess(
  onMessage: (msg: WorkerInputMessage) => Promise<WorkerOutputMessage>
) {
  // Prevent unhandled errors/rejections from crashing the worker thread.
  // SSR rendering can throw asynchronously (e.g., qwik's logErrorAndStop)
  // in microtasks not connected to any promise chain.
  process.on('uncaughtException', (e) => {
    console.error('Worker uncaught exception (suppressed):', e.message);
  });
  process.on('unhandledRejection', (e) => {
    console.error('Worker unhandled rejection (suppressed):', e instanceof Error ? e.message : e);
  });

  parentPort?.on('message', async (msg: WorkerInputMessage) => {
    try {
      parentPort?.postMessage(await onMessage(msg));
    } catch (e) {
      // Send error result back instead of crashing the worker
      if (msg.type === 'render') {
        const error = e instanceof Error ? e : new Error(String(e));
        parentPort?.postMessage({
          type: 'render',
          pathname: msg.pathname,
          url: '',
          ok: false,
          error: { message: error.message, stack: error.stack },
          filePath: null,
          contentType: null,
          resourceType: null,
        } satisfies WorkerOutputMessage);
      } else {
        console.error('Worker message handler error', e);
      }
    }
    if (msg.type === 'close') {
      parentPort?.close();
    }
  });
}
