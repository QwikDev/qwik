import {
  $,
  implicit$FirstArg,
  type QRL,
  _getContextElement,
  _serializeData,
} from '@builder.io/qwik';

//@ts-ignore
import workerUrl from './worker.js?worker&url';

export interface ServerFunction {
  (...args: any[]): any;
}
export interface WorkerConstructorQRL {
  <T extends ServerFunction>(fnQrl: QRL<T>): QRL<T>;
}

const qwikWorkers = new Map<string, Worker>();
let workerRequests = 0;

const getWorkerRequest = () => {
  workerRequests++;
  return workerRequests;
};

const getWorker = (qrl: QRL) => {
  let worker = qwikWorkers.get(qrl.getHash());
  if (!worker) {
    qwikWorkers.set(
      qrl.getHash(),
      (worker = new Worker(workerUrl, {
        name: `worker$(${qrl.getSymbol()})`,
        type: 'module',
      }))
    );
  }
  return worker;
};

export const workerQrl: WorkerConstructorQRL = (qrl) => {
  return $(async (...args: any[]) => {
    const containerEl =
      (_getContextElement() as HTMLElement | undefined)?.closest('[q\\:container]') ??
      document.documentElement;
    const worker = getWorker(qrl);
    const requestId = getWorkerRequest();
    const qbase = containerEl.getAttribute('q:base') ?? '/';
    const baseURI = document.baseURI;
    const filtered = args.map((arg) => {
      if (arg instanceof SubmitEvent && arg.target instanceof HTMLFormElement) {
        return new FormData(arg.target);
      } else if (arg instanceof Event) {
        return null;
      } else if (arg instanceof Node) {
        return null;
      }
      return arg;
    });
    const data = await _serializeData([qrl, ...filtered], false);
    return new Promise((resolve, reject) => {
      const handler = ({ data }: MessageEvent) => {
        if (Array.isArray(data) && data.length === 3 && data[0] === requestId) {
          worker.removeEventListener('message', handler);
          if (data[1] === true) {
            resolve(data[2]);
          } else {
            reject(data[2]);
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage([requestId, baseURI, qbase, data]);
    });
  }) as any;
};

export const worker$ = implicit$FirstArg(workerQrl);
