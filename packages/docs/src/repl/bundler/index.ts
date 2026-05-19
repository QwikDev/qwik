/** Bundler registry that manages WebWorkers per Qwik version */

import type { ReplInputOptions, ReplResult } from '../types';
import { getDeps } from './bundled';
import type { BundleMessage, InitMessage, OutgoingMessage } from './repl-bundler-worker';
import bundlerWorkerUrl from './repl-bundler-worker?worker&url';

const bundlers = new Map<string, Bundler>();

class Bundler {
  public worker: Worker | null = null;
  private initP: Promise<void> | null = null;
  private ready: (() => void) | null = null;

  timer: any = null;
  buildPromises = new Map<
    number,
    { resolve: (value: ReplResult) => void; reject: (reason?: any) => void }
  >();
  nextBuildId = 1;

  constructor(public version: string) {
    this.initWorker();
    this.keepAlive();
  }

  initWorker() {
    this.initP = new Promise<void>((res) => (this.ready = res));
    // Start from /repl so repl-sw can add COEP headers
    this.worker = new Worker(`/repl${bundlerWorkerUrl}`, { type: 'module' });
    this.worker.addEventListener('message', this.messageHandler);
    this.worker.addEventListener('error', (e: ErrorEvent) => {
      console.error(`Bundler worker for ${this.version} failed`, e.message);
      this.terminateWorker();
    });
  }

  messageHandler = (e: MessageEvent<OutgoingMessage>) => {
    const { type } = e.data;
    if (type === 'ready') {
      const { version } = this;
      const message: InitMessage = {
        type: 'init',
        version,
        deps: getDeps(version),
      };
      this.worker!.postMessage(message);
      this.ready!();
    } else if (type === 'result' || type === 'error') {
      const { buildId } = e.data;
      const promise = this.buildPromises.get(buildId);
      if (promise) {
        this.buildPromises.delete(buildId);
        if (type === 'result') {
          promise.resolve(e.data.result);
        } else {
          const { error, stack } = e.data;
          const err = new Error(error);
          if (stack) {
            err.stack = stack;
          }
          promise.reject(err);
        }
      }
    }
  };

  keepAlive() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.terminateWorker(), 1000 * 60 * 5);
  }

  bundle(options: Omit<ReplInputOptions, 'version' | 'serverUrl'>): Promise<ReplResult> {
    if (!this.worker) {
      this.initWorker();
    }
    this.keepAlive();
    return this.initP!.then(() => {
      return new Promise((resolve, reject) => {
        const buildId = this.nextBuildId++;
        this.buildPromises.set(buildId, { resolve, reject });
        const message: BundleMessage = {
          type: 'bundle',
          buildId,
          data: options,
        };
        this.worker?.postMessage(message);
      });
    });
  }

  terminateWorker(): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.messageHandler);
      this.worker.terminate();
      this.worker = null;
      this.buildPromises.forEach((p) => p.reject(new Error('Worker terminated')));
      this.buildPromises.clear();
      console.debug(`Bundler worker for ${this.version} terminated`);
    }
  }
}

export const getBundler = (version: string): Bundler => {
  let bundler = bundlers.get(version);
  if (!bundler) {
    bundler = new Bundler(version);
    bundlers.set(version, bundler);
  }
  return bundler;
};
