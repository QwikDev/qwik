/** Bundler registry that manages WebWorkers per Qwik version */

import type { ReplInputOptions, ReplResult } from '../types';
import { getDeps, resolveOptimizerVersion } from './bundled';
import type { BundleMessage, InitMessage, OutgoingMessage } from './repl-bundler-worker';
import bundlerWorkerUrl from './repl-bundler-worker?worker&url';

const bundlers = new Map<string, Bundler>();

class Bundler {
  public worker: Worker | null = null;
  private initP: Promise<void> | null = null;
  private ready: (() => void) | null = null;
  private failInit: ((error: Error) => void) | null = null;

  timer: any = null;
  buildPromises = new Map<
    number,
    { resolve: (value: ReplResult) => void; reject: (reason?: any) => void }
  >();
  nextBuildId = 1;

  constructor(
    public version: string,
    public rustOptimizer: boolean
  ) {
    this.initWorker();
    this.keepAlive();
  }

  initWorker() {
    this.initP = new Promise<void>((res, rej) => {
      this.ready = res;
      this.failInit = rej;
    });
    // Builds see the rejection; this only silences it when no build is waiting.
    this.initP.catch(() => {});
    // Start from /repl so repl-sw can add COEP headers
    this.worker = new Worker(`/repl${bundlerWorkerUrl}`, { type: 'module' });
    this.worker.addEventListener('message', this.messageHandler);
    this.worker.addEventListener('error', (e: ErrorEvent) => {
      const error = new Error(
        `Bundler worker for ${this.version} failed: ${e.message || 'Unable to load worker'}`
      );
      console.error(error);
      this.terminateWorker(error);
    });
  }

  messageHandler = async (e: MessageEvent<OutgoingMessage>) => {
    const { type } = e.data;
    if (type === 'ready') {
      const { version, rustOptimizer } = this;
      let optimizerVersion: string;
      try {
        optimizerVersion = await resolveOptimizerVersion(version);
      } catch (error) {
        if (rustOptimizer) {
          // Retry the lookup in a fresh worker on the next build.
          this.terminateWorker(error as Error);
          return;
        }
        // The TS optimizer doesn't need it; only its Rust fallback would.
        optimizerVersion = version;
      }
      const message: InitMessage = {
        type: 'init',
        version,
        rustOptimizer,
        deps: getDeps(version, optimizerVersion),
      };
      this.worker?.postMessage(message);
      this.ready!();
    } else if (type === 'result' || type === 'error') {
      const { buildId } = e.data;
      const promise = this.buildPromises.get(buildId);
      if (promise) {
        this.buildPromises.delete(buildId);
        if (type === 'result') {
          promise.resolve(e.data.result);
        } else {
          const { error, stack, isFatal } = e.data;
          const err = new Error(error);
          if (stack) {
            err.stack = stack;
          }
          promise.reject(err);
          if (isFatal) {
            // A failed module import stays cached in the worker, so start a fresh one.
            this.terminateWorker(err);
          }
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

  terminateWorker(error = new Error('Worker terminated')): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.messageHandler);
      this.worker.terminate();
      this.worker = null;
      this.failInit?.(error);
      this.buildPromises.forEach((p) => p.reject(error));
      this.buildPromises.clear();
      console.debug(`Bundler worker for ${this.version} terminated`);
    }
  }
}

export const getBundler = (version: string, rustOptimizer: boolean): Bundler => {
  const key = `${version}${rustOptimizer ? ':rust' : ''}`;
  let bundler = bundlers.get(key);
  if (!bundler) {
    bundler = new Bundler(version, rustOptimizer);
    bundlers.set(key, bundler);
  }
  return bundler;
};
