import { parentPort } from 'worker_threads';
import type { StaticWorkerRenderConfig, StaticWorkerRenderResult } from '../generator/types';

export async function createNodeWorkerProcess(
  onRender: (config: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>
) {
  parentPort?.on('message', async (config) => {
    parentPort?.postMessage(await onRender(config));
  });
}
