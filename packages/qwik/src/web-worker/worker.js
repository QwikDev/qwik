import { runWorkerMessage, setBrowserWorkerPlatform } from './worker.shared.js';

setBrowserWorkerPlatform(import.meta.url);

globalThis.onmessage = ({ data }) => {
  return runWorkerMessage(
    data,
    (response) => {
      self.postMessage(response);
    },
    globalThis
  );
};
