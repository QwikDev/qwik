import type { QRL } from '@qwik.dev/core';
import nodeWorkerAssetUrl from './worker.node.js?worker&url';
import type { Worker as NodeWorker } from 'node:worker_threads';
import {
  getNodeDistUrl as resolveNodeDistUrl,
  getNodeWorkerQrlBaseUrlFromDist,
  getNodeWorkerUrlFromDist,
  tryParseUrl,
  type RuntimeFsLike,
} from './worker-runtime-node-paths';
import { getOrCreateWorker, getWorkerName, type WorkerTransport } from './worker-runtime-shared';

type RuntimeProcessLike = {
  getBuiltinModule?: (id: string) => unknown;
};

type RuntimeImportMetaLike = ImportMeta & {
  resolve?: (specifier: string) => string;
};

const runtimeGlobals = globalThis as typeof globalThis & {
  process?: RuntimeProcessLike;
};
const runtimeImportMeta = import.meta as RuntimeImportMetaLike;
const nodeWorkerThreadsModuleId = 'node:worker_threads';
const nodeFsModuleId = 'node:fs';

let resolvedNodeWorkerUrl: URL | null | undefined = undefined;
let resolvedNodeDistUrl: URL | null | undefined = undefined;

const getNodeWorkerConstructor = () => {
  const workerThreadsModule = runtimeGlobals.process?.getBuiltinModule?.(
    nodeWorkerThreadsModuleId
  ) as
    | {
        Worker?: typeof NodeWorker;
      }
    | undefined;

  return workerThreadsModule?.Worker;
};

const getNodeFsModule = () => {
  return runtimeGlobals.process?.getBuiltinModule?.(nodeFsModuleId) as RuntimeFsLike | undefined;
};

const getResolvedNodeWorkerModuleUrl = () => {
  const resolvedUrl = runtimeImportMeta.resolve?.('./worker.node.js');
  if (!resolvedUrl) {
    return null;
  }

  const workerUrl = tryParseUrl(resolvedUrl);
  if (!workerUrl) {
    return null;
  }

  const fsModule = getNodeFsModule();
  if (!fsModule?.existsSync?.(workerUrl)) {
    return null;
  }

  return workerUrl;
};

const getNodeDistUrl = () => {
  if (resolvedNodeDistUrl !== undefined) {
    return resolvedNodeDistUrl;
  }

  resolvedNodeDistUrl = resolveNodeDistUrl(import.meta.url, getNodeFsModule());
  return resolvedNodeDistUrl;
};

const getNodeWorkerUrl = (): URL => {
  if (resolvedNodeWorkerUrl != undefined) {
    return resolvedNodeWorkerUrl;
  }

  const resolvedModuleUrl = getResolvedNodeWorkerModuleUrl();
  if (resolvedModuleUrl) {
    resolvedNodeWorkerUrl = resolvedModuleUrl;
    return resolvedNodeWorkerUrl;
  }

  if (nodeWorkerAssetUrl.startsWith('/')) {
    const distUrl = getNodeDistUrl();
    if (distUrl) {
      resolvedNodeWorkerUrl = getNodeWorkerUrlFromDist(nodeWorkerAssetUrl, distUrl);
      return resolvedNodeWorkerUrl;
    }
  }

  resolvedNodeWorkerUrl = new URL(nodeWorkerAssetUrl, import.meta.url);
  return resolvedNodeWorkerUrl;
};

const getNodeWorkerQrlBaseUrl = () => {
  const resolvedModuleUrl = getResolvedNodeWorkerModuleUrl();
  if (resolvedModuleUrl) {
    return new URL('../build/', resolvedModuleUrl);
  }

  if (nodeWorkerAssetUrl.startsWith('/')) {
    const distUrl = getNodeDistUrl();
    const qrlBaseUrl = distUrl && getNodeWorkerQrlBaseUrlFromDist(nodeWorkerAssetUrl, distUrl);
    if (qrlBaseUrl) {
      return qrlBaseUrl;
    }
  }

  return new URL('../build/', getNodeWorkerUrl());
};

const createNodeWorkerTransport = (worker: NodeWorker): WorkerTransport => {
  return {
    offError(handler) {
      worker.off('error', handler);
    },
    offMessage(handler) {
      worker.off('message', handler);
    },
    onError(handler) {
      worker.on('error', handler);
    },
    onMessage(handler) {
      worker.on('message', handler);
    },
    postMessage(data) {
      worker.postMessage(data);
    },
  };
};

export const getNodeWorker = (qrl: QRL) => {
  return getOrCreateWorker(qrl, () => {
    const WorkerConstructor = getNodeWorkerConstructor();
    if (!WorkerConstructor) {
      return null;
    }

    const worker = new WorkerConstructor(getNodeWorkerUrl(), {
      name: getWorkerName(qrl),
      workerData: {
        qrlBaseUrl: getNodeWorkerQrlBaseUrl().href,
      },
    });
    worker.unref();
    return createNodeWorkerTransport(worker);
  });
};
