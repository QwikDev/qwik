import { runWorkerMessage } from './worker.shared.js';

globalThis.onmessage = ({ data }) => {
  return runWorkerMessage(
    data,
    (response) => {
      self.postMessage(response);
    },
    globalThis
  );
};
