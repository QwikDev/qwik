/* eslint-disable no-console */
import type { Render } from '@builder.io/qwik/server';
import type {
  NodeStaticGeneratorOptions,
  NodeStaticWorkerRenderConfig,
  NodeStaticWorkerRenderResult,
} from './types';
import { main, normalizeOptions } from '../generator';
import { createNodeMain } from './node-main';
import { isMainThread, parentPort } from 'worker_threads';
import { workerStaticRender } from '../generator/worker';
import { createNodeLogger, createNodeSystem } from './node-system';

// @builder.io/qwik-city/static/node

/**
 * @alpha
 */
export async function qwikCityGenerate(render: Render, opts: NodeStaticGeneratorOptions) {
  try {
    const normalizedOpts = normalizeOptions(opts);
    const nodeLog = createNodeLogger(normalizedOpts);
    const nodeSys = await createNodeSystem(normalizedOpts, nodeLog);

    if (isMainThread) {
      const nodeMain = createNodeMain(normalizedOpts, nodeLog);
      await nodeSys.init();
      await nodeMain.init();
      await main(normalizedOpts, nodeLog, nodeMain, nodeSys);
      await nodeMain.close();
      await nodeSys.close();
    } else {
      parentPort?.on('message', async (config: NodeStaticWorkerRenderConfig) => {
        const result = await workerStaticRender(normalizedOpts, nodeSys, render, config);
        const workerResult: NodeStaticWorkerRenderResult = {
          taskId: config.taskId,
          ...result,
        };
        parentPort?.postMessage(workerResult);
      });
    }
  } catch (e) {
    console.error(e);
  }
}
