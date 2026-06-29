import { isServer } from '@qwik.dev/core/build';
import { isGenerator } from '../../shared/utils/async-generator';
import { QError, qError } from '../../shared/error/error';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import { retryOnPromise } from '../../shared/utils/promises';
import { qTest } from '../../shared/utils/qdev';
import type { ValueOrPromise } from '../../shared/utils/types';
import { isServerPlatform } from '../../shared/platform/platform';
import type { AsyncCtx, AsyncSignalOptions } from '../../reactive-primitives/types';
import type { AsyncSignal as PublicAsyncSignal } from '../../reactive-primitives/signal.public';
import { cleanupDeps } from './cleanup';
import { ComputedFlags } from './flags';
import { notifySourceSubscribers } from './notify';
import { Signal } from './signal';
import type { Dependency, SourceSubs } from './source';
import { isStore } from './store';
import { runWithCollector, track } from './tracking';
import type { ContainerContext } from '../runtime/container-context';
import { drainGenerator } from '../runtime/generator';
import { getActiveInvokeContextOrNull } from '../runtime/invoke-context';
import { registerSubscriberToOwner } from '../runtime/owner';
import type { Owner } from '../runtime/owner';
import { SubscriberKind, type ComputedSubscriber } from '../runtime/subscriber';
import { getFunctionOrResolve } from '../utils/qrl';

export type AsyncSignalFn<T> = (
  ctx: AsyncCtx<T>
) => ValueOrPromise<T> | Generator<unknown, T, unknown>;
export type AsyncSignalQrl<T> = QRL<AsyncSignalFn<T>>;

class AsyncJob<T> implements AsyncCtx<T> {
  promise: Promise<void> | null = null;
  cleanups: Array<() => ValueOrPromise<void>> | null = null;
  abortController: AbortController | null = null;
  generator: Generator<unknown> | null = null;
  canWrite = true;

  constructor(
    readonly signal: AsyncSignal<T>,
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

export class AsyncSignal<T>
  extends Signal<T>
  implements ComputedSubscriber<T>, PublicAsyncSignal<T>
{
  readonly kind = SubscriberKind.Computed;
  owner: Owner | null = null;
  deps: Dependency[] | null = null;
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
    public computeQrl: AsyncSignalQrl<T> | null,
    public computeFn: AsyncSignalFn<T> | null = null,
    public container?: ContainerContext,
    public options?: AsyncSignalOptions<T>
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
    track(this);
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
    track(this);
    return this.untrackedLoading;
  }

  set loading(value: boolean) {
    this.untrackedLoading = value;
  }

  get untrackedLoading(): boolean {
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
    this.closeGenerator(job);
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

  setOptions(options: AsyncSignalOptions<T> | undefined): void {
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
    if (!(this.flags & ComputedFlags.Dirty) || this.current !== null) {
      return;
    }
    this.clearNextPoll();
    if (isServerEnv() && this.options?.clientOnly) {
      this.loadingValue = true;
      this.addToEagerResume();
      return;
    }

    this.flags &= ~ComputedFlags.Dirty;
    const job = new AsyncJob(this, this.info);
    this.info = undefined;
    this.current = job;
    this.setLoading(true);
    job.promise = this.runComputation(job).catch((error) => {
      this.setError(job, error as Error);
    });
  }

  async runComputation(job: AsyncJob<T>): Promise<void> {
    try {
      await this.runStoredCleanups();
      cleanupDeps(this);

      const run = this.computeFn ?? (await getFunctionOrResolve(this.computeQrl!, this.container));
      const value = await this.withTimeout(job, this.evaluate(job, run));
      job.promise = null;

      if (job.canWrite && this.current === job) {
        this.errorValue = undefined;
        this.publishValue(value);
      }
    } catch (error) {
      job.promise = null;
      this.setError(job, error as Error);
    } finally {
      if (this.current === job) {
        this.current = null;
        this.storedCleanups = job.cleanups;
        if (this.flags & ComputedFlags.Dirty) {
          this.computeIfNeeded();
        } else {
          this.setLoading(false);
          this.scheduleNextPoll();
        }
      }
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
            this.closeGenerator(job);
            reject(error);
          }, timeout);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private evaluate(job: AsyncJob<T>, run: AsyncSignalFn<T>): ValueOrPromise<T> {
    return retryOnPromise(() =>
      this.resolveResult(
        job,
        runWithCollector(this, () => run(job))
      )
    );
  }

  private resolveResult(job: AsyncJob<T>, result: ReturnType<AsyncSignalFn<T>>): ValueOrPromise<T> {
    if (!isGenerator(result)) {
      return result;
    }
    job.generator = result;
    return drainGenerator(this, result) as Promise<T>;
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

  private closeGenerator(job: AsyncJob<T>): void {
    if (typeof job.generator?.return === 'function') {
      void job.generator.return(undefined);
    }
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

  private async runStoredCleanups(): Promise<void> {
    const cleanups = this.storedCleanups;
    this.storedCleanups = null;
    await this.runCleanups(cleanups);
  }

  private async runCleanups(cleanups: Array<() => ValueOrPromise<void>> | null): Promise<void> {
    if (cleanups === null || cleanups.length === 0) {
      return;
    }
    if (this.cleanupPromise !== null) {
      await this.cleanupPromise;
    }
    this.cleanupPromise = Promise.all(
      cleanups.map(async (cleanup) => {
        try {
          await cleanup();
        } catch (error) {
          console.error('Error in async signal cleanup', error);
        }
      })
    ).then(() => {});
    try {
      await this.cleanupPromise;
    } finally {
      this.cleanupPromise = null;
    }
  }
}

export function createAsync<T>(
  compute: AsyncSignalFn<T>,
  options?: AsyncSignalOptions<T>
): AsyncSignal<T> {
  return registerSubscriberToOwner(
    new AsyncSignal<T>(null, compute, getActiveInvokeContextOrNull()?.container, options)
  );
}

export function createAsyncQrl<T>(
  computeQrl: AsyncSignalQrl<T>,
  options?: AsyncSignalOptions<T>
): AsyncSignal<T> {
  const container = getActiveInvokeContextOrNull()?.container;
  const signal = new AsyncSignal<T>(computeQrl, null, container, options);
  void (signal.computeQrl as QRLInternal<AsyncSignalFn<T>>).resolve(container).catch(() => {});
  return registerSubscriberToOwner(signal);
}

export const createAsync$: <T>(
  qrl: (ctx: AsyncCtx<T>) => ValueOrPromise<T>,
  options?: AsyncSignalOptions<T>
) => PublicAsyncSignal<T> = /*#__PURE__*/ implicit$FirstArg(createAsyncQrl as any);

function hasInitial<T>(options: AsyncSignalOptions<T> | undefined): boolean {
  return !!options && Object.prototype.hasOwnProperty.call(options, 'initial');
}

function readInitialValue<T>(options: AsyncSignalOptions<T> | undefined): T | undefined {
  if (!hasInitial(options)) {
    return undefined;
  }
  const initial = options!.initial;
  return typeof initial === 'function' ? (initial as () => T)() : initial;
}

function isServerEnv(): boolean {
  return qTest ? isServerPlatform() : isServer;
}
