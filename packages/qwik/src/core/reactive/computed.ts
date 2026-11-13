import type { SsrContentContext } from '../ssr/output';
import type { ContainerContext } from '../runtime/container-context';
import { Brand, brandClass } from '../shared/utils/brand';
import { isServer } from '@qwik.dev/core/build';
import { QError, qError } from '../shared/error/error';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  isPromise,
  retryInLifetime,
  retryOnPromise,
  thenInLifetime,
} from '../shared/utils/promises';
import { qTest } from '../shared/utils/qdev';
import type { ValueOrPromise } from '../shared/utils/types';
import { isServerPlatform } from '../shared/platform/platform';
import { cleanupDeps, runLateCleanup } from './cleanup';
import { ComputedFlags, OwnerFlags } from './flags';
import { isNotReadyError, NotReadyError } from './not-ready';
import { notifySourceSubscribers } from './notify';
import { Signal } from './signal';
import type { Source, SourceSubs } from './source';
import { isStore } from './store';
import { getActiveCollector, runWithCollector, runWithCollector1, track } from './tracking';
import type { RuntimeContainerContext } from '../runtime/invoke-context';
import { getLiveOwner, getOrCreateContextOwner, type Owner } from '../runtime/owner';
import { getActiveInvokeContextOrNull } from '../runtime/invoke-context';
import { SubscriberKind, type ComputedSubscriber } from '../runtime/subscriber';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { getFunctionOrResolve } from '../utils/qrl';
import { setCaptures } from '../shared/qrl/qrl-captures';
import type { AsyncCtx, ComputedOptions, ComputedSignal, ComputeCtx } from './public-types';
import { isSubscriberDisposed } from '../runtime/subscriber';
import { handleError } from '../dom/content/catch-boundary';

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

  get isCancelled(): boolean {
    return (
      !this.canWrite ||
      this.signal.current !== this ||
      isSubscriberDisposed(this.signal) ||
      this.abortController?.signal.aborted === true
    );
  }

  // Getters, so a body that never reads them allocates no callback; both work destructured.
  get track(): AsyncCtx<T>['track'] {
    const computed = this.signal;
    return ((obj: (() => unknown) | object, prop?: PropertyKey) =>
      runWithCollector(computed, trackInput, obj, prop)) as AsyncCtx<T>['track'];
  }

  get cleanup(): AsyncCtx<T>['cleanup'] {
    return (callback) => {
      if (typeof callback !== 'function') {
        return;
      }
      if (this.isCancelled) {
        runLateCleanup(callback);
        return;
      }
      (this.cleanups ??= []).push(callback);
    };
  }

  get abortSignal(): AbortSignal {
    return (this.abortController ??= new AbortController()).signal;
  }

  get previous(): T | undefined {
    return this.signal.flags & ComputedFlags.HasValue ? this.signal.v : undefined;
  }
}

/** Readers of `pending` and `error`, kept apart so value readers skip loading changes. */
export class ComputedStatus implements Source<undefined> {
  v = undefined;
  subs: SourceSubs = null;
}

export class Computed<T> extends Signal<T> implements ComputedSubscriber<T>, ComputedSignal<T> {
  readonly kind = SubscriberKind.Computed;
  owner: Owner | null = null;
  deps: Source[] | null = null;
  flags = ComputedFlags.Dirty;
  status: ComputedStatus | null = null;

  loadingValue = false;
  errorValue: Error | undefined = undefined;
  current: AsyncJob<T> | null = null;
  storedCleanups: Array<() => ValueOrPromise<void>> | null = null;
  cleanupPromise: Promise<void> | null = null;
  declare private cleanupObservation?: { computed?: Computed<T> };
  declare nextSettle?: { promise: Promise<void>; resolve: () => void };
  /** The missing input of the last computation; only that source can settle its readers. */
  declare private missingInput?: NotReadyError;
  info: unknown;

  constructor(
    public computeQrl: ComputeSignalQrl<T> | null,
    public computeFn: ComputeSignalFn<T> | null = null,
    public container?: RuntimeContainerContext,
    public options?: ComputedOptions<T>
  ) {
    super(readInitialValue(options) as T);
    this.setOptions(options);
    if (hasInitial(options)) {
      this.flags |= ComputedFlags.HasValue;
    }
  }

  override get value(): T {
    if (!isSubscriberDisposed(this)) {
      track(this);
    }
    return this.readValue();
  }

  override set value(value: T) {
    this.abort();
    this.errorValue = undefined;
    this.flags &= ~ComputedFlags.Dirty;
    this.publishValue(value);
  }

  override get untrackedValue(): T {
    return this.readValue();
  }

  override set untrackedValue(value: T) {
    this.flags =
      (this.flags & ~(ComputedFlags.Dirty | ComputedFlags.ShowsServerValue)) |
      ComputedFlags.HasValue;
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
    this.trackStatus();
    return this.untrackedPending;
  }

  get untrackedPending(): boolean {
    this.computeStatusIfNeeded();
    if ((qTest ? isServerPlatform() : isServer) && this.current?.promise) {
      throw this.current.promise;
    }
    return this.loadingValue;
  }

  set untrackedLoading(value: boolean) {
    this.setLoading(value);
  }

  get error(): Error | undefined {
    this.trackStatus();
    return this.untrackedError;
  }

  set error(value: Error | undefined) {
    this.untrackedError = value;
  }

  get untrackedError(): Error | undefined {
    this.computeStatusIfNeeded();
    if ((qTest ? isServerPlatform() : isServer) && this.current?.promise) {
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

  force(): void {
    this.invalidate();
  }

  clear(): void {
    this.flags &= ~ComputedFlags.HasValue;
    this.invalidate();
  }

  invalidate(info?: unknown): void {
    if (arguments.length > 0) {
      this.info = info;
    }
    this.flags |= ComputedFlags.Dirty;
    this.abort();
    this.notify();
  }

  abort(reason?: unknown): ValueOrPromise<void> {
    const job = this.current;
    if (job === null) {
      return;
    }
    job.canWrite = false;
    job.abortController?.abort(reason);
    this.current = null;
    this.setLoading(false);
    return this.runCleanups(job.cleanups);
  }

  /** Runs the user cleanups ahead of disposal, keeping the subscriptions in place. */
  runUserCleanups(): ValueOrPromise<void> {
    const pending = this.abort();
    return this.runStoredCleanups() ?? pending;
  }

  async promise(): Promise<void> {
    await retryOnPromise(() => this.computeIfNeeded());
    while (this.current?.promise) {
      await this.current.promise;
    }
  }

  override trigger(): void {
    this.notify();
  }

  dispose(): void {
    try {
      void this.runUserCleanups();
    } finally {
      cleanupDeps(this);
      this.subs = null;
      this.status = null;
      if (this.cleanupObservation !== undefined) {
        this.cleanupObservation.computed = undefined;
        this.cleanupObservation = undefined;
      }
      this.cleanupPromise = null;
    }
  }

  resume(): ValueOrPromise<void> {
    if (this.flags & ComputedFlags.Dirty) {
      return retryOnPromise(() => this.computeIfNeeded());
    }
  }

  setOptions(options: ComputedOptions<T> | undefined): void {
    this.options = options;
  }

  readValue(): T {
    if (isSubscriberDisposed(this)) {
      if (this.flags & ComputedFlags.HasValue) {
        return this.v;
      }
      throw qError(QError.disposedComputedWithoutValue);
    }
    this.computeIfNeeded();
    const current = this.current;
    if (current?.promise) {
      if ((qTest ? isServerPlatform() : isServer) || !(this.flags & ComputedFlags.HasValue)) {
        throw current.promise;
      }
      return this.v;
    }
    if (this.errorValue !== undefined) {
      throw this.errorValue;
    }
    if (
      (qTest ? isServerPlatform() : isServer) &&
      this.options?.clientOnly &&
      !(this.flags & ComputedFlags.HasValue)
    ) {
      throw qError(QError.asyncClientOnlyValueDuringSSR);
    }
    if (!(this.flags & ComputedFlags.HasValue)) {
      // Cancelled work left nothing to return; the reader reruns once a value arrives.
      this.flags |= ComputedFlags.ReadNotReady;
      throw this.missingInput ?? new NotReadyError(this);
    }
    return this.v;
  }

  /** A status read never throws for a loading body: the computed is pending until it loads. */
  private computeStatusIfNeeded(): void {
    try {
      this.computeIfNeeded();
    } catch (error) {
      if (!isPromise(error)) {
        throw error;
      }
      this.loadingValue = true;
      // the status readers read again and start the computation
      error.then(() => this.setLoading(false));
    }
  }

  computeIfNeeded(): void {
    if (isSubscriberDisposed(this)) {
      return;
    }
    if (this.flags & ComputedFlags.Computing) {
      throw qError(QError.circularComputed);
    }
    if (!(this.flags & ComputedFlags.Dirty) || this.current !== null) {
      return;
    }
    if ((qTest ? isServerPlatform() : isServer) && this.options?.clientOnly) {
      this.loadingValue = true;
      addToEagerResume(this);
      return;
    }
    const loadingBody = this.loadSyncBody();
    if (loadingBody !== null) {
      // Like a sync body throwing a promise: the reader retries once the body loads.
      throw loadingBody;
    }

    this.flags |= ComputedFlags.Computing;
    this.missingInput = undefined;
    const job = new AsyncJob(this, this.info);
    this.info = undefined;
    this.current = job;
    const readerOwner = getActiveCollector()?.owner;
    const invokeContext = getActiveInvokeContextOrNull();

    let result: ValueOrPromise<T>;
    try {
      result = thenInLifetime(job, this.runStoredCleanups(), () => {
        cleanupDeps(this);
        const run = this.computeFn ?? getFunctionOrResolve(this.computeQrl!, this.container, false);
        if (isPromise(run) && !(qTest ? isServerPlatform() : isServer)) {
          // Importing the compute chunk is framework work: the flush must outlast it, or the
          // subscribers this computed then notifies land after the interaction has settled.
          (this.container as ContainerContext | undefined)?.scheduler.waitFor(
            run,
            readerOwner ?? getOrCreateContextOwner(invokeContext)
          );
        }
        // a loaded body skips the wait; evaluate checks the job's lifetime itself
        return isPromise(run)
          ? thenInLifetime(job, run, (run) => this.evaluate(job, run))
          : this.evaluate(job, run);
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
      // A synchronous pull only ever follows a dirty mark that already told the subscribers.
      this.publishValue(result, false);
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

  /** The not yet imported body of a sync computed; loading it is no async computation. */
  private loadSyncBody(): Promise<void> | null {
    if (
      this.computeFn !== null ||
      this.flags & ComputedFlags.Async ||
      (qTest ? isServerPlatform() : isServer)
    ) {
      return null;
    }
    const run = getFunctionOrResolve(this.computeQrl!, this.container, false);
    if (!isPromise(run)) {
      return null;
    }
    // Importing the body is framework work: the flush must outlast it.
    (this.container as ContainerContext | undefined)?.scheduler.waitFor(
      run,
      getActiveCollector()?.owner ?? getOrCreateContextOwner(getActiveInvokeContextOrNull())
    );
    return run.then(
      () => {},
      (error) => {
        // a value assigned meanwhile is newer than this failed load
        if (!(this.flags & ComputedFlags.Dirty)) {
          return;
        }
        // a body that failed to load is a failed computation
        this.flags &= ~ComputedFlags.Dirty;
        this.untrackedError = error as Error;
      }
    );
  }

  private evaluate(job: AsyncJob<T>, run: ComputeSignalFn<T>): ValueOrPromise<T> {
    const qrl =
      this.computeFn === null ? (this.computeQrl as QRLInternal<ComputeSignalFn<T>>) : null;
    const captures =
      qrl?.resolved === run
        ? undefined
        : (qrl?.$captures$ as readonly unknown[] | null | undefined);
    return retryInLifetime(job, () => {
      if (!job.canWrite || isSubscriberDisposed(this)) {
        return undefined as T;
      }
      if (captures) {
        setCaptures(captures);
      }
      return runWithCollector1(this, run, job, this);
    });
  }

  private publishValue(value: T, notify = true): void {
    const showsOtherValue = !!(
      this.flags &
      (ComputedFlags.ShowsServerValue | ComputedFlags.ReadNotReady)
    );
    // First materialization is not a change, unless subscribers rendered something else.
    const changed =
      showsOtherValue || (!!(this.flags & ComputedFlags.HasValue) && !Object.is(this.v, value));
    this.v = value;
    this.flags =
      (this.flags | ComputedFlags.HasValue) &
      ~(ComputedFlags.ShowsServerValue | ComputedFlags.ReadNotReady);
    if (changed && (notify || showsOtherValue)) {
      this.notify();
    }
    this.settle();
  }

  private setError(job: AsyncJob<T>, error: Error): void {
    if (job !== this.current || !job.canWrite) {
      return;
    }
    job.canWrite = false;
    // a cancellation or a missing input is no error
    if (isNotReadyError(error)) {
      this.missingInput = error;
      return;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    this.errorValue = error;
    this.flags &= ~ComputedFlags.HasValue;
    this.notify();
    this.settle();
  }

  private settle(): void {
    const next = this.nextSettle;
    if (next !== undefined) {
      this.nextSettle = undefined;
      next.resolve();
    }
  }

  private setLoading(value: boolean): void {
    if (this.loadingValue !== value) {
      this.loadingValue = value;
      this.notifyStatus();
    }
  }

  private trackStatus(): void {
    // allocate only for a tracking read
    if (getActiveCollector() !== null) {
      track((this.status ??= new ComputedStatus()));
    }
  }

  private notifyStatus(): void {
    if (this.status !== null) {
      notifySourceSubscribers(this.status);
    }
  }

  private notify(): void {
    notifySourceSubscribers(this);
    this.notifyStatus();
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
    const owner = getLiveOwner(this.owner);
    const result = runComputedCleanups(cleanups, this.cleanupPromise, owner);
    if (!isPromise(result)) {
      return result;
    }
    if (isSubscriberDisposed(this)) {
      if (!(qTest ? isServerPlatform() : isServer)) {
        (this.container as ContainerContext | undefined)?.scheduler.waitFor(result, owner);
      }
      return result;
    }
    this.cleanupPromise = result;
    if (this.cleanupObservation !== undefined) {
      this.cleanupObservation.computed = undefined;
    }
    const observation = (this.cleanupObservation = { computed: this });
    observeComputedCleanup(result, observation);
    return result;
  }
}

function observeComputedCleanup<T>(
  promise: Promise<void>,
  observation: { computed?: Computed<T> }
): void {
  const finish = () => {
    const computed = observation.computed;
    observation.computed = undefined;
    if (computed?.cleanupPromise === promise) {
      computed.cleanupPromise = null;
    }
  };
  promise.then(finish, finish);
}

function runComputedCleanups(
  cleanups: Array<() => ValueOrPromise<void>>,
  pending: Promise<void> | null,
  owner: Owner | null
): ValueOrPromise<void> {
  let index = 0;
  let failure: { error: unknown } | undefined;
  const onError = (error: unknown) => {
    if (owner !== null && owner.flags & OwnerFlags.HasCatch) {
      failure ??= { error };
    } else {
      console.error('Error in computed cleanup', error);
    }
  };
  const run = (): ValueOrPromise<void> => {
    while (index < cleanups.length) {
      try {
        const result = cleanups[index++]();
        if (isPromise(result)) {
          return result.then(run, (error) => {
            onError(error);
            return run();
          });
        }
      } catch (error) {
        onError(error);
      }
    }
    if (failure !== undefined) {
      return handleError(owner, failure.error);
    }
  };
  return pending === null ? run() : pending.then(run);
}

function trackInput(obj: (() => unknown) | object, prop?: PropertyKey): unknown {
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
  throw qError(QError.trackObjectWithoutProp);
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

/** Settles on the next value or error, for readers that cannot subscribe. */
export function whenComputedSettled(
  computed: Pick<Computed<unknown>, 'nextSettle'>
): Promise<void> {
  if (computed.nextSettle === undefined) {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => (resolve = done));
    computed.nextSettle = { promise, resolve };
  }
  return computed.nextSettle.promise;
}

/** A module function, not a method, so client bundles drop this server-only path. */
function addToEagerResume<T>(computed: Computed<T>): void {
  const container = computed.container as SsrContentContext | undefined;
  if (container?.markEagerResume !== undefined) {
    container.markEagerResume(computed);
  } else {
    container?.serializationCtx?.$eagerResume$.add(computed);
  }
}

export function readComputed<T>(computed: ComputedSubscriber<T>): T {
  if (!isSubscriberDisposed(computed)) {
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

isServer && brandClass(Computed, Brand.Computed);
isServer && brandClass(ComputedStatus, Brand.ComputedStatus);
