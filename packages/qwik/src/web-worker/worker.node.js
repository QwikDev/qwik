import { runWorkerMessage, setNodeWorkerPlatform } from './worker.shared.js';

const workerThreadsModule = process.getBuiltinModule?.('node:worker_threads');
const parentPort = workerThreadsModule?.parentPort;
setNodeWorkerPlatform(workerThreadsModule?.workerData?.qrlBaseUrl);

parentPort?.on('message', (data) => {
  return runWorkerMessage(
    data,
    (response) => {
      parentPort.postMessage(response);
    },
    globalThis
  );
});
