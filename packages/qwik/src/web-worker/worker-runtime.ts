import type { QRL } from '@qwik.dev/core';
import { getBrowserWorker } from './worker-runtime-browser';
import { getNodeWorker } from './worker-runtime-node';
export { invokeWorker, type WorkerTransport } from './worker-runtime-shared';

type RuntimeProcessLike = {
  versions?: {
    bun?: string;
    node?: string;
  };
};

const runtimeGlobals = globalThis as typeof globalThis & {
  Deno?: {
    version?: {
      deno?: string;
    };
  };
  document?: Document;
  process?: RuntimeProcessLike;
};

export const getWorkerTransport = async (qrl: QRL) => {
  if (isNodeRuntime()) {
    return getNodeWorker(qrl);
  }
  if (isBrowserRuntime()) {
    return getBrowserWorker(qrl);
  }
  return null;
};

const isBrowserRuntime = () => !!runtimeGlobals.document;

const isBunRuntime = () => !!runtimeGlobals.process?.versions?.bun;

const isDenoRuntime = () => !!runtimeGlobals.Deno?.version?.deno;

export const isNodeRuntime = () =>
  !!runtimeGlobals.process?.versions?.node && !isBunRuntime() && !isDenoRuntime();
