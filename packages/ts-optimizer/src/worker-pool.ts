// Worker-thread pool for `transformModules`.
//
// Transforms materialize large oxc AST object trees; running them inside the
// bundler process (vite build + SSR in one process) piles that allocation
// pressure onto the host heap. The pool moves each `transformModules` call
// into a `node:worker_threads` worker with its own V8 heap, which also lets
// independent per-file transforms run in parallel.
//
// This module is its own worker entry: spawning `import.meta.url` with the
// `WORKER_FLAG` in workerData starts the message loop at the bottom of this
// file. Everything degrades to `null`/in-process on any failure so browser,
// deno, and constrained environments keep working unchanged.

import { runTransform } from './transform-run.js';

import type { NapiTransformModulesOptions, NapiTransformOutput } from './create-optimizer.js';

const WORKER_FLAG = '__qwik_ts_optimizer_worker__';

interface WorkerRequest {
  id: number;
  opts: NapiTransformModulesOptions;
}

interface WorkerResponse {
  id: number;
  output?: NapiTransformOutput;
  error?: string;
}

export interface TransformWorkerPool {
  transformModules(opts: NapiTransformModulesOptions): Promise<NapiTransformOutput>;
  dispose(): Promise<void>;
}

const isNode = typeof process === 'object' && !!process.versions?.node;

/** Resolve the pool size: explicit option > env override > default. 0/1 disables the pool. */
export function resolvePoolSize(workers?: number): number {
  if (typeof workers === 'number') return Math.floor(workers);
  if (!isNode) return 0;
  const env = process.env.QWIK_TS_OPTIMIZER_WORKERS;
  if (env !== undefined) {
    const parsed = Number(env);
    return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  }
  // Unit-test runners already parallelize across processes; don't nest pools.
  if (process.env.VITEST) return 0;
  const cores = globalThis.navigator?.hardwareConcurrency ?? 8;
  return Math.min(4, Math.max(1, cores - 1));
}

/**
 * Create a transform worker pool, or `null` when unsupported (non-node, size < 2 spawn failure).
 * Worker crashes after startup permanently fall back to in-process transforms for pending and
 * future calls — behavior stays identical, only isolation is lost.
 */
export async function createTransformWorkerPool(size: number): Promise<TransformWorkerPool | null> {
  if (!isNode || size < 1) return null;
  let wt: typeof import('node:worker_threads');
  try {
    wt = await import('node:worker_threads');
  } catch {
    return null;
  }

  interface PoolWorker {
    worker: import('node:worker_threads').Worker;
    inflight: number;
  }

  const pending = new Map<
    number,
    {
      opts: NapiTransformModulesOptions;
      resolve: (output: NapiTransformOutput) => void;
      reject: (error: Error) => void;
      holder: PoolWorker;
    }
  >();
  let nextId = 0;
  let broken = false;
  const workers: PoolWorker[] = [];

  const runInProcess = (opts: NapiTransformModulesOptions): Promise<NapiTransformOutput> => {
    try {
      return Promise.resolve(runTransform(opts));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  /** A worker died: re-run its in-flight jobs in-process and stop using the pool. */
  const breakPool = (holder: PoolWorker) => {
    broken = true;
    for (const [id, job] of pending) {
      if (job.holder === holder) {
        pending.delete(id);
        runInProcess(job.opts).then(job.resolve, job.reject);
      }
    }
  };

  try {
    for (let i = 0; i < size; i++) {
      const worker = new wt.Worker(new URL(import.meta.url), {
        workerData: { [WORKER_FLAG]: true },
      });
      const holder: PoolWorker = { worker, inflight: 0 };
      worker.on('message', (msg: WorkerResponse) => {
        const job = pending.get(msg.id);
        if (!job) return;
        pending.delete(msg.id);
        holder.inflight--;
        if (holder.inflight === 0) holder.worker.unref();
        if (msg.error !== undefined) {
          job.reject(new Error(msg.error));
        } else {
          job.resolve(msg.output!);
        }
      });
      worker.on('error', () => breakPool(holder));
      worker.on('exit', () => {
        if (!broken && holder.inflight > 0) breakPool(holder);
      });
      // After listener setup: attaching 'message' re-refs a worker, so unref
      // last or the pool keeps the host process alive.
      worker.unref();
      workers.push(holder);
    }
  } catch {
    await Promise.all(workers.map((w) => w.worker.terminate()));
    return null;
  }

  return {
    transformModules(opts) {
      // Pre-parsed ASTs are large; cloning them defeats the purpose.
      const hasPreparsedAst = opts.input?.some((input) => input.program || input.module) ?? false;
      if (broken || hasPreparsedAst) return runInProcess(opts);
      const holder = workers.reduce((a, b) => (b.inflight < a.inflight ? b : a));
      const id = nextId++;
      return new Promise<NapiTransformOutput>((resolve, reject) => {
        pending.set(id, { opts, resolve, reject, holder });
        holder.inflight++;
        // A busy worker must keep the host loop alive until it responds.
        if (holder.inflight === 1) holder.worker.ref();
        holder.worker.postMessage({ id, opts } satisfies WorkerRequest);
      });
    },
    async dispose() {
      broken = true;
      await Promise.all(workers.map((w) => w.worker.terminate()));
    },
  };
}

let sharedPool: Promise<TransformWorkerPool | null> | undefined;

/**
 * Process-wide shared pool for default-configured optimizers. Bundlers create one optimizer per
 * plugin instance (one per build); sharing keeps the worker count flat when many builds run in one
 * process. Never disposed — workers are unref'd and die with the process.
 */
export function getSharedTransformPool(size: number): Promise<TransformWorkerPool | null> {
  sharedPool ??= createTransformWorkerPool(size);
  return sharedPool;
}

/** Worker-side bootstrap: runs the message loop when loaded with the pool's workerData flag. */
async function maybeStartWorkerLoop(): Promise<void> {
  if (!isNode) return;
  let wt: typeof import('node:worker_threads');
  try {
    wt = await import('node:worker_threads');
  } catch {
    return;
  }
  if (wt.isMainThread || !wt.parentPort) return;
  if ((wt.workerData as Record<string, unknown> | null)?.[WORKER_FLAG] !== true) return;
  const port = wt.parentPort;
  port.on('message', ({ id, opts }: WorkerRequest) => {
    try {
      port.postMessage({ id, output: runTransform(opts) } satisfies WorkerResponse);
    } catch (err) {
      const error = err instanceof Error ? (err.stack ?? err.message) : String(err);
      port.postMessage({ id, error } satisfies WorkerResponse);
    }
  });
}

void maybeStartWorkerLoop();
