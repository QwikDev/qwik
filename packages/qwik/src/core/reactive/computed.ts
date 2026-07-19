import { isServer } from '@qwik.dev/core/build';
import { QError, qError } from '../shared/error/error';
import type { QRL } from '../shared/qrl/qrl.public';
import { isPromise, maybeThen, retryOnPromise } from '../shared/utils/promises';
import { qTest } from '../shared/utils/qdev';
import type { ValueOrPromise } from '../shared/utils/types';
import { isServerPlatform } from '../shared/platform/platform';
import { cleanupDeps } from './cleanup';
import { ComputedFlags } from './flags';
import { notifySourceSubscribers } from './notify';
import { Signal } from './signal';
import type { Source, SourceSubs } from './source';
import { isStore } from './store';
import { runWithCollector, track } from './tracking';
import type { ContainerContext } from '../runtime/container-context';
import type { Owner } from '../runtime/owner';
import { SubscriberKind, type ComputedSubscriber } from '../runtime/subscriber';
import { getFunctionOrResolve } from '../utils/qrl';
import type { AsyncCtx, ComputedOptions, ComputedSignal, ComputeCtx } from './public-types';

export type ComputeSignalFn<T> = (ctx: ComputeCtx<T>) => ValueOrPromise<T>;
export type ComputeSignalQrl<T> = QRL<ComputeSignalFn<T>>;

class AsyncJob<T> implements AsyncCtx<T> {
  promise: Promise<void> | null = null;
  cleanups: Array<() => ValueOrPromise<void>> | null = null;
  abortController: AbortController | null = null;
  canWrite = true;

  constructor(
    readonly signal: Computed<T>,
    readonly info: unknown
  ) {}

  get track(): AsyncCtx<T>['track'] {
    return this.signal.trackSource;
  }

  cleanup = (callback: () => ValueOrPromise<void>): void => {
    if (typeof callback === 'function') {
      (this.cleanups ??= []).push(callback);
    }
  };

  get abortSignal(): AbortSignal {
    return (this.abortController ??= new AbortController()).signal;
  }

  get previous(): T | undefined {
    return this.signal.flags & ComputedFlags.HasValue ? this.signal.v : undefined;
  }
}

export class Computed<T> extends Signal<T> implements ComputedSubscriber<T>, ComputedSignal<T> {
  readonly kind = SubscriberKind.Computed;
  owner: Owner | null = null;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;
  flags = ComputedFlags.Dirty;
  subs: SourceSubs = null;

  loadingValue = false;
  errorValue: Error | undefined = undefined;
  current: AsyncJob<T> | null = null;
  storedCleanups: Array<() => ValueOrPromise<void>> | null = null;
  cleanupPromise: Promise<void> | null = null;
  info: unknown;

  private expiresValue = 0;
  private pollValue = true;
  private pollTimeoutId: ReturnType<typeof setTimeout> | undefined;

  constructor(
    public computeQrl: ComputeSignalQrl<T> | null,
    public computeFn: ComputeSignalFn<T> | null = null,
    public container?: ContainerContext,
    public options?: ComputedOptions<T>
  ) {
    super(readInitialValue(options) as T);
    this.setOptions(options);
    if (hasInitial(options)) {
      this.flags |= ComputedFlags.HasValue;
    }
  }

  compute(): T {
    return this.value;
  }

  override get value(): T {
    if (this.owner !== null) {
      track(this);
    }
    return this.readValue();
  }

  override set value(value: T) {
    this.abort();
    this.errorValue = undefined;
    this.flags &= ~ComputedFlags.Dirty;
    this.publishValue(value);
    this.scheduleNextPoll();
  }

  override get untrackedValue(): T {
    return this.readValue();
  }

  override set untrackedValue(value: T) {
    this.flags = (this.flags & ~ComputedFlags.Dirty) | ComputedFlags.HasValue;
    this.v = value;
  }

  get loading(): boolean {
    return this.pending;
  }

  set loading(value: boolean) {
    this.untrackedLoading = value;
  }

  get untrackedLoading(): boolean {
    return this.untrackedPending;
  }

  get pending(): boolean {
    track(this);
    return this.untrackedPending;
  }

  get untrackedPending(): boolean {
    this.computeIfNeeded();
    if (isServerEnv() && this.current?.promise) {
      throw this.current.promise;
    }
    return this.loadingValue;
  }

  set untrackedLoading(value: boolean) {
    this.setLoading(value);
  }

  get error(): Error | undefined {
    track(this);
    return this.errorValue;
  }

  set error(value: Error | undefined) {
    this.untrackedError = value;
  }

  get untrackedError(): Error | undefined {
    this.computeIfNeeded();
    if (isServerEnv() && this.current?.promise) {
      throw this.current.promise;
    }
    return this.errorValue;
  }

  set untrackedError(value: Error | undefined) {
    if (this.errorValue !== value) {
      this.errorValue = value;
      this.notify();
    }
  }

  get expires(): number {
    return this.expiresValue;
  }

  set expires(value: number) {
    this.clearNextPoll();
    this.expiresValue = value;
    this.scheduleNextPoll();
  }

  get poll(): boolean {
    return this.pollValue;
  }

  set poll(value: boolean) {
    this.pollValue = value;
    this.clearNextPoll();
    this.scheduleNextPoll();
  }

  /** @deprecated Use `expires` and `poll` instead. */
  get interval(): number {
    return this.pollValue ? this.expiresValue : -this.expiresValue;
  }

  set interval(value: number) {
    this.pollValue = value >= 0;
    this.expires = Math.abs(value);
  }

  force(): void {
    this.invalidate();
  }

  invalidate(info?: unknown): void {
    if (arguments.length > 0) {
      this.info = info;
    }
    this.clearNextPoll();
    this.flags |= ComputedFlags.Dirty;
    if (this.options?.allowStale === false) {
      this.flags &= ~ComputedFlags.HasValue;
    }
    this.abort();
    this.notify();
  }

  abort(reason?: unknown): void {
    this.clearNextPoll();
    const job = this.current;
    if (job === null) {
      return;
    }
    job.canWrite = false;
    job.abortController?.abort(reason);
    this.current = null;
    this.setLoading(false);
    void this.runCleanups(job.cleanups);
  }

  async promise(): Promise<void> {
    this.computeIfNeeded();
    while (this.current?.promise) {
      await this.current.promise;
    }
  }

  override trigger(): void {
    this.notify();
  }

  dispose(): void {
    this.clearNextPoll();
    this.abort();
    cleanupDeps(this);
    this.subs = null;
    void this.runStoredCleanups();
  }

  resume(): void {
    if (this.flags & ComputedFlags.Dirty) {
      this.computeIfNeeded();
      return;
    }
    this.scheduleNextPoll();
  }

  setOptions(options: ComputedOptions<T> | undefined): void {
    this.options = options;
    const interval = options?.interval;
    this.expiresValue = options?.expires ?? (interval ? Math.abs(interval) : 0);
    this.pollValue = !(options?.poll === false || (interval !== undefined && interval < 0));
  }

  trackSource: AsyncCtx<T>['track'] = ((obj: (() => unknown) | object, prop?: PropertyKey) => {
    return runWithCollector(this, () => {
      if (typeof obj === 'function') {
        return obj();
      }
      if (prop !== undefined) {
        return (obj as Record<PropertyKey, unknown>)[prop];
      }
      if (obj instanceof Signal) {
        return obj.value;
      }
      if (isStore(obj)) {
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
          (obj as Record<string, unknown>)[keys[i]];
        }
        return obj;
      }
      throw new Error('track() requires a function, signal, store, or store property.');
    });
  }) as AsyncCtx<T>['track'];

  readValue(): T {
    if (this.owner === null) {
      if (this.flags & ComputedFlags.HasValue) {
        return this.v;
      }
      throw new Error('Cannot read disposed computed without cached value');
    }
    this.computeIfNeeded();
    const current = this.current;
    if (current?.promise) {
      if (isServerEnv() || !(this.flags & ComputedFlags.HasValue)) {
        throw current.promise;
      }
      return this.v;
    }
    if (this.errorValue !== undefined) {
      throw this.errorValue;
    }
    if (isServerEnv() && this.options?.clientOnly && !(this.flags & ComputedFlags.HasValue)) {
      throw qError(QError.asyncClientOnlyValueDuringSSR);
    }
    if (!(this.flags & ComputedFlags.HasValue)) {
      this.computeIfNeeded();
      if (this.current?.promise) {
        throw this.current.promise;
      }
    }
    this.addPollingToEagerResume();
    return this.v;
  }

  computeIfNeeded(): void {
    if (this.flags & ComputedFlags.Computing) {
      throw new Error('Circular computed dependency');
    }
    if (!(this.flags & ComputedFlags.Dirty) || this.current !== null) {
      return;
    }
    this.clearNextPoll();
    if (isServerEnv() && this.options?.clientOnly) {
      this.loadingValue = true;
      this.addToEagerResume();
      return;
    }

    this.flags |= ComputedFlags.Computing;
    const job = new AsyncJob(this, this.info);
    this.info = undefined;
    this.current = job;

    let result: ValueOrPromise<T>;
    try {
      result = maybeThen(this.runStoredCleanups(), () => {
        cleanupDeps(this);
        const run = this.computeFn ?? getFunctionOrResolve(this.computeQrl!, this.container);
        return maybeThen(run, (run) => this.evaluate(job, run));
      });
    } catch (error) {
      this.flags &= ~(ComputedFlags.Dirty | ComputedFlags.Computing);
      this.setError(job, error as Error);
      this.finishJob(job);
      return;
    }

    if (isPromise(result)) {
      this.flags =
        (this.flags | ComputedFlags.Async) & ~(ComputedFlags.Dirty | ComputedFlags.Computing);
      this.setLoading(true);
      job.promise = this.settleComputation(job, result);
      return;
    }

    this.flags &= ~(ComputedFlags.Dirty | ComputedFlags.Computing);
    if (job.canWrite && this.current === job) {
      this.errorValue = undefined;
      this.publishValue(result);
    }
    this.finishJob(job);
  }

  private async settleComputation(job: AsyncJob<T>, pending: Promise<T>): Promise<void> {
    try {
      const value = await this.withTimeout(job, pending);
      job.promise = null;
      if (job.canWrite && this.current === job) {
        this.errorValue = undefined;
        this.publishValue(value);
      }
    } catch (error) {
      job.promise = null;
      this.setError(job, error as Error);
    } finally {
      this.finishJob(job);
    }
  }

  private finishJob(job: AsyncJob<T>): void {
    if (this.current !== job) {
      return;
    }
    this.current = null;
    this.storedCleanups = job.cleanups;
    if (this.flags & ComputedFlags.Dirty) {
      this.computeIfNeeded();
    } else {
      this.setLoading(false);
      this.scheduleNextPoll();
    }
  }

  private async withTimeout<TValue>(
    job: AsyncJob<T>,
    value: ValueOrPromise<TValue>
  ): Promise<TValue> {
    const timeout = this.options?.timeout ?? 0;
    if (!timeout) {
      return await value;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        value,
        new Promise<TValue>((_resolve, reject) => {
          timeoutId = setTimeout(() => {
            const error = new Error(`timeout ${timeout}ms`);
            job.abortController?.abort(error);
            reject(error);
          }, timeout);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private evaluate(job: AsyncJob<T>, run: ComputeSignalFn<T>): ValueOrPromise<T> {
    return retryOnPromise(() => runWithCollector(this, () => run.call(this, job)));
  }

  private publishValue(value: T): void {
    const changed = !(this.flags & ComputedFlags.HasValue) || !Object.is(this.v, value);
    this.v = value;
    this.flags |= ComputedFlags.HasValue;
    if (changed) {
      this.notify();
    }
  }

  private setError(job: AsyncJob<T>, error: Error): void {
    if (job !== this.current || !job.canWrite) {
      return;
    }
    job.canWrite = false;
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    this.errorValue = error;
    this.flags &= ~ComputedFlags.HasValue;
    this.notify();
  }

  private setLoading(value: boolean): void {
    if (this.loadingValue !== value) {
      this.loadingValue = value;
      this.notify();
    }
  }

  private notify(): void {
    this.version++;
    notifySourceSubscribers(this);
  }

  private addToEagerResume(): void {
    (
      this.container as { serializationCtx?: { $eagerResume$: Set<unknown> } } | undefined
    )?.serializationCtx?.$eagerResume$.add(this);
  }

  private addPollingToEagerResume(): void {
    if (isServerEnv() && this.expiresValue && this.pollValue) {
      this.addToEagerResume();
    }
  }

  private clearNextPoll(): void {
    if (this.pollTimeoutId !== undefined) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = undefined;
    }
  }

  private scheduleNextPoll(): void {
    if (isServerEnv() || !this.expiresValue || !this.hasSubscribers()) {
      return;
    }
    this.clearNextPoll();
    this.pollTimeoutId = setTimeout(() => {
      this.pollTimeoutId = undefined;
      this.flags |= ComputedFlags.Dirty;
      if (!this.pollValue && this.options?.allowStale === false) {
        this.flags &= ~ComputedFlags.HasValue;
      }
      this.notify();
      if (this.pollValue) {
        this.computeIfNeeded();
      }
    }, this.expiresValue);
    this.pollTimeoutId.unref?.();
  }

  private hasSubscribers(): boolean {
    return this.subs !== null && this.subs.length > 0;
  }

  private runStoredCleanups(): ValueOrPromise<void> {
    const cleanups = this.storedCleanups;
    this.storedCleanups = null;
    return this.runCleanups(cleanups);
  }

  private runCleanups(cleanups: Array<() => ValueOrPromise<void>> | null): ValueOrPromise<void> {
    if (cleanups === null || cleanups.length === 0) {
      return;
    }
    if (this.cleanupPromise !== null) {
      return this.cleanupPromise.then(() => this.runCleanups(cleanups));
    }

    let index = 0;
    const run = (): ValueOrPromise<void> => {
      while (index < cleanups.length) {
        try {
          const result = cleanups[index++]();
          if (isPromise(result)) {
            return result.then(run, (error) => {
              console.error('Error in computed cleanup', error);
              return run();
            });
          }
        } catch (error) {
          console.error('Error in computed cleanup', error);
        }
      }
    };
    const result = run();
    if (isPromise(result)) {
      const pending = result.finally(() => {
        if (this.cleanupPromise === pending) {
          this.cleanupPromise = null;
        }
      });
      this.cleanupPromise = pending;
      return pending;
    }
  }
}

function hasInitial<T>(options: ComputedOptions<T> | undefined): boolean {
  return !!options && Object.prototype.hasOwnProperty.call(options, 'initial');
}

function readInitialValue<T>(options: ComputedOptions<T> | undefined): T | undefined {
  if (!hasInitial(options)) {
    return undefined;
  }
  const initial = options!.initial;
  return typeof initial === 'function' ? (initial as () => T)() : initial;
}

function isServerEnv(): boolean {
  return qTest ? isServerPlatform() : isServer;
}

export function readComputed<T>(computed: ComputedSubscriber<T>): T {
  if (computed.owner !== null) {
    track(computed);
  }
  return (computed as Computed<T>).readValue();
}

export function readComputedUntracked<T>(computed: ComputedSubscriber<T>): T {
  return (computed as Computed<T>).readValue();
}

export function isAsyncComputed(computed: ComputedSubscriber): boolean {
  return !!(computed.flags & ComputedFlags.Async);
}
