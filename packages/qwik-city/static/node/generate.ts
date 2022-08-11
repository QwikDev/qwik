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
import { workerRender } from '../generator/worker';
import { createNodeLogger, createNodeSystem } from './node-system';

export async function qwikCityGenerate(render: Render, opts: NodeStaticGeneratorOptions) {
  try {
    const normalizedOpts = normalizeOptions(opts);
    const nodeLog = createNodeLogger(normalizedOpts);
    const nodeSys = createNodeSystem();

    if (isMainThread) {
      const nodeMain = createNodeMain(normalizedOpts, nodeLog);
      await nodeMain.init();
      await main(normalizedOpts, nodeLog, nodeMain, nodeSys);
      await nodeMain.dispose();
    } else {
      parentPort?.on('message', async (config: NodeStaticWorkerRenderConfig) => {
        const result = await workerRender(normalizedOpts, nodeLog, nodeSys, render, config);
        const rsp: NodeStaticWorkerRenderResult = {
          taskId: config.taskId,
          ...result,
        };
        parentPort?.postMessage(rsp);
      });
    }
  } catch (e) {
    console.error(e);
  }
}
