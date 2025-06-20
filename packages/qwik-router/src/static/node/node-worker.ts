import { parentPort } from 'node:worker_threads';
import type { WorkerInputMessage, WorkerOutputMessage } from '../types';

export async function createNodeWorkerProcess(
  onMessage: (msg: WorkerInputMessage) => Promise<WorkerOutputMessage>
) {
  parentPort?.on('message', async (msg: WorkerInputMessage) => {
    parentPort?.postMessage(await onMessage(msg));
  });
}
