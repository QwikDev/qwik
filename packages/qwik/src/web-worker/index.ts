import { implicit$FirstArg } from '../core/shared/qrl/implicit_dollar';
import { _captures, type QRLInternal } from '../core/shared/qrl/qrl-class';
import { type QRL } from '../core/shared/qrl/qrl.public';
import { inlinedQrl } from '../core/shared/qrl/qrl';
import { _serialize } from '../core/shared/serdes/index';
import type { ClientContainer } from '../core/client/types';
import { _getContextContainer } from '../core/use/use-core';
// import workerUrl from './worker.js?worker&url';

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
      (worker = new Worker(new URL('./worker.js', import.meta.url), {
        name: `worker$(${qrl.getSymbol()})`,
        type: 'module',
      }))
    );
  }
  return worker;
};

/** @internal */
export const _worker = async (...args: any[]) => {
  const [qrl] = _captures as [QRLInternal<(...args: any[]) => any>];
  const containerEl =
    (_getContextContainer() as ClientContainer | undefined)?.element ?? document.documentElement;
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

  const qrlData = await _serialize([qrl, ...filtered]);
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
    worker.postMessage([requestId, baseURI, qbase, qrlData]);
  });
};

/**
 * Creates a worker-backed QRL which executes in a dedicated web worker.
 *
 * Use `workerQrl()` when you already have a `QRL` and want its work to run off the main thread. For
 * most application code, prefer {@link worker$}, which is the ergonomic shorthand.
 *
 * Arguments and return values must be serializable by Qwik. DOM nodes and browser events should not
 * be passed directly. If a form submit event is provided, it is converted to `FormData` before it
 * is serialized to the worker.
 *
 * The wrapped function runs in the worker context, so it must not depend on component hooks or
 * direct DOM access.
 *
 * @param qrl - The QRL to execute in the worker.
 * @returns A QRL proxy whose invocation resolves with the worker result.
 * @beta
 */
export const workerQrl = (<T extends (...args: any[]) => any>(qrl: QRL<T>): QRL<T> => {
  return inlinedQrl(_worker, '_wrk', [qrl]) as QRL<T>;
}) as <T extends (...args: any[]) => any>(fnQrl: QRL<T>) => QRL<T>;

/**
 * Wraps a function so it executes in a dedicated web worker.
 *
 * `worker$()` is equivalent to calling {@link workerQrl} with the function converted to a `QRL` as
 * the first argument. Use it for CPU-heavy client-side work that would otherwise block the main
 * thread, such as parsing, hashing, indexing, or image processing.
 *
 * @beta
 */
export const worker$ = implicit$FirstArg(workerQrl);
