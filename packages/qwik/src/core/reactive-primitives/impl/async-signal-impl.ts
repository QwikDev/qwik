import { isBrowser, isDev, isServer } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../../debug';
import { assertTrue } from '../../shared/error/assert';
import { isServerPlatform } from '../../shared/platform/platform';
import type { Container } from '../../shared/types';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import type { SSRContainer } from '../../ssr/ssr-types';
import { tryGetInvokeContext } from '../../use/use-core';
import { trackFn } from '../../use/utils/tracker';
import { _EFFECT_BACK_REF, type BackRef } from '../backref';
import type { AsyncSignal } from '../signal.public';
import {
  AsyncQRL,
  AsyncSignalFlags,
  EffectProperty,
  EffectSubscription,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
  type AsyncCtx,
  type AsyncSignalOptions,
} from '../types';
import {
  addQrlToSerializationCtx,
  ensureContainsBackRef,
  ensureContainsSubscription,
  scheduleEffects,
} from '../utils';
import { ComputedSignalImpl } from './computed-signal-impl';

const DEBUG = false;
const log = (...args: any[]) =>
  // eslint-disable-next-line no-console
  console.log('ASYNC COMPUTED SIGNAL', ...args.map(qwikDebugToString));

/** Retains job metadata and also serves as the argument for the compute function */
class AsyncJob<T> implements AsyncCtx<T> {
  /** First holds the compute promise and then the cleanup promise */
  $promise$: Promise<void> | null = null;
  $cleanupRequested$: boolean = false;
  $canWrite$: boolean = true;
  $track$: AsyncCtx<T>['track'] | undefined;
  $cleanups$: Parameters<AsyncCtx<T>['cleanup']>[0][] | undefined;
  $abortController$: AbortController | undefined;

  constructor(
    readonly $signal$: AsyncSignalImpl<T>,
    readonly info: unknown,
    readonly $infoVersion$: number
  ) {}

  get track(): AsyncCtx<T>['track'] {
    return (this.$track$ ||= trackFn(this.$signal$, this.$signal$.$container$));
  }

  get abortSignal(): AbortSignal {
    return (this.$abortController$ ||= new AbortController()).signal;
  }

  /** Backward compatible cache method for resource */
  cache(): void {
    isDev &&
      console.error(
        'useResource cache() method does not do anything. Use `useAsync$` instead of `useResource$`, use the `interval` option for polling behavior.'
      );
  }

  get previous(): T | undefined {
    const val = this.$signal$.$untrackedValue$;
    if (val !== NEEDS_COMPUTATION) {
      return val;
    }
  }

  cleanup(callback: () => void) {
    if (typeof callback === 'function') {
      (this.$cleanups$ ||= []).push(callback);
    }
  }
}

/**
 * # ================================
 *
 * AsyncSignalImpl
 *
 * # ================================
 *
 * @internal
 */
export class AsyncSignalImpl<T>
  extends ComputedSignalImpl<T, AsyncQRL<T>>
  implements BackRef, AsyncSignal<T>
{
  $untrackedLoading$: boolean = false;
  $untrackedError$: Error | undefined = undefined;

  $loadingEffects$: undefined | Set<EffectSubscription> = undefined;
  $errorEffects$: undefined | Set<EffectSubscription> = undefined;
  $current$: AsyncJob<T> | null = null;
  // TODO only create the array if concurrency > 1
  $jobs$: AsyncJob<T>[] = [];
  $concurrency$: number = 1;
  $interval$: number = 0;
  $timeoutMs$: number | undefined;
  $info$: unknown = undefined;
  $infoVersion$: number = 0;
  declare $pollTimeoutId$: ReturnType<typeof setTimeout> | undefined;
  declare $computationTimeoutId$: ReturnType<typeof setTimeout> | undefined;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: AsyncQRL<T>,
    flags: SignalFlags | SerializationSignalFlags = SignalFlags.INVALID |
      SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS,
    options?: AsyncSignalOptions<T>
  ) {
    super(container, fn, flags);
    const interval = options?.interval;
    const concurrency = options?.concurrency ?? 1;
    const initial = options?.initial;
    const timeout = options?.timeout;
    const eagerCleanup = options?.eagerCleanup;
    const clientOnly = options?.clientOnly;

    // Handle initial value - eagerly evaluate if function, set $untrackedValue$ and $promiseValue$
    // Do NOT call setValue() which would clear the INVALID flag and prevent async computation
    if (initial !== undefined) {
      const initialValue = typeof initial === 'function' ? (initial as () => T)() : initial;
      this.$untrackedValue$ = initialValue;
    }

    this.$concurrency$ = concurrency;
    if (timeout) {
      this.$timeoutMs$ = timeout;
    }
    if (eagerCleanup) {
      this.$flags$ |= AsyncSignalFlags.EAGER_CLEANUP;
    }
    if (clientOnly) {
      this.$flags$ |= AsyncSignalFlags.CLIENT_ONLY;
    }
    if (interval) {
      this.interval = interval;
    }
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    if (this.$current$?.$promise$) {
      if (
        this.$untrackedValue$ === NEEDS_COMPUTATION ||
        (import.meta.env.TEST ? isServerPlatform() : isServer)
      ) {
        DEBUG && log('Throwing promise while computing initial value', this);
        throw this.$current$?.$promise$;
      }
      DEBUG &&
        log('Returning stale value', this.$untrackedValue$, 'while computing', this.$current$);
      return this.$untrackedValue$;
    }
    if (this.$untrackedError$) {
      DEBUG && log('Throwing error while reading value', this);
      throw this.$untrackedError$;
    }
    // For clientOnly signals without initial value during SSR, throw if trying to read value
    // During SSR, clientOnly signals are skipped, so there's no computed value available
    if (
      (import.meta.env.TEST ? isServerPlatform() : isServer) &&
      this.$flags$ & AsyncSignalFlags.CLIENT_ONLY &&
      this.$untrackedValue$ === NEEDS_COMPUTATION
    ) {
      throw new Error(
        isDev
          ? 'During SSR, cannot read .value from clientOnly async signal without an initial value. Use .loading or provide an initial value.'
          : 'Cannot read .value from clientOnly'
      );
    }
    return this.$untrackedValue$;
  }
  set untrackedValue(value: T) {
    this.$untrackedValue$ = value;
  }

  /**
   * Read the value, subscribing if in a tracking context. Triggers computation if needed.
   *
   * Setting the value will mark the signal as not loading and clear any error, and prevent any
   * pending computations from writing their results.
   *
   * If you want to set the value without affecting loading or error state, set `untrackedValue`
   * instead and make sure to trigger effects manually if needed.
   *
   * If you want to abort pending computations when setting, you have to call `abort()` manually.
   */
  override get value(): T {
    return super.value;
  }

  override set value(value: T) {
    this.$flags$ &= ~SignalFlags.INVALID;
    this.untrackedLoading = false;
    this.untrackedError = undefined;
    this.$info$ = undefined;
    // Prevent pending computations from overwriting this value
    for (let i = 0; i < this.$jobs$.length; i++) {
      this.$jobs$[i].$canWrite$ = false;
    }
    this.$clearNextPoll$();
    super.value = value;
    this.$scheduleNextPoll$();
  }

  /**
   * Loading is true if the signal is still waiting for the promise to resolve, false if the promise
   * has resolved or rejected.
   *
   * Accessing .loading will trigger computation if needed, since it's often used like
   * `signal.loading ? <Loading /> : signal.value`.
   */
  get loading(): boolean {
    const val = this.untrackedLoading;
    const ctx = tryGetInvokeContext();
    if (ctx && (this.$container$ ||= ctx.$container$ || null)) {
      isDev &&
        assertTrue(
          !ctx.$container$ || ctx.$container$ === this.$container$,
          'Do not use signals across containers'
        );
      const effectSubscriber = ctx.$effectSubscriber$;
      if (effectSubscriber) {
        ensureContainsSubscription((this.$loadingEffects$ ||= new Set()), effectSubscriber);
        ensureContainsBackRef(effectSubscriber, this);
        addQrlToSerializationCtx(effectSubscriber, this.$container$);
      }
    }
    return val;
  }

  set untrackedLoading(value: boolean) {
    if (value !== this.$untrackedLoading$) {
      this.$untrackedLoading$ = value;
      DEBUG && log('Set untrackedLoading', value);
      scheduleEffects(this.$container$, this, this.$loadingEffects$);
    }
  }

  get untrackedLoading() {
    // reading `.loading` means someone is interested in the result, so we should trigger the computation. The alternative is eager computation or imperative calls to invalidate; this seems nicer.
    this.$computeIfNeeded$();
    // During SSR there's no such thing as loading state, we must render complete results
    if ((import.meta.env.TEST ? isServerPlatform() : isServer) && this.$current$?.$promise$) {
      DEBUG && log('Throwing loading promise for SSR');
      throw this.$current$?.$promise$;
    }
    return this.$untrackedLoading$;
  }

  /** The error that occurred when the signal was resolved. */
  get error(): Error | undefined {
    const val = this.untrackedError;
    const ctx = tryGetInvokeContext();
    if (ctx && (this.$container$ ||= ctx.$container$ || null)) {
      isDev &&
        assertTrue(
          !ctx.$container$ || ctx.$container$ === this.$container$,
          'Do not use signals across containers'
        );
      const effectSubscriber = ctx.$effectSubscriber$;
      if (effectSubscriber) {
        ensureContainsSubscription((this.$errorEffects$ ||= new Set()), effectSubscriber);
        ensureContainsBackRef(effectSubscriber, this);
        addQrlToSerializationCtx(effectSubscriber, this.$container$);
      }
    }
    return val;
  }

  set untrackedError(value: Error | undefined) {
    if (value !== this.$untrackedError$) {
      this.$untrackedError$ = value;
      scheduleEffects(this.$container$, this, this.$errorEffects$);
    }
  }

  get untrackedError() {
    return this.$untrackedError$;
  }

  get interval() {
    return this.$interval$;
  }

  set interval(value: number) {
    this.$clearNextPoll$();
    this.$interval$ = value;
    if (this.$interval$ !== 0 && this.$hasSubscribers$()) {
      this.$scheduleNextPoll$();
    }
  }

  /** Invalidates the signal, causing it to re-compute its value. */
  override async invalidate(info?: unknown) {
    this.$flags$ |= SignalFlags.INVALID;
    this.$clearNextPoll$();
    if (arguments.length > 0) {
      this.$info$ = info;
      this.$infoVersion$++;
    }
    if (this.$effects$?.size || this.$loadingEffects$?.size || this.$errorEffects$?.size) {
      // compute in next microtask
      await true;
      this.$computeIfNeeded$();
    }
  }

  /** Abort the current computation and run cleanups if needed. */
  abort(reason?: any): void {
    if (this.$current$) {
      this.$requestCleanups$(this.$current$, reason);
    }
  }

  /** Schedule eager cleanup on next macro task if no subscribers remain. */
  $scheduleEagerCleanup$(): void {
    if (!(this.$flags$ & AsyncSignalFlags.EAGER_CLEANUP) || this.$hasSubscribers$()) {
      return;
    }
    if (!(import.meta.env.TEST ? !isServerPlatform() : isBrowser)) {
      return;
    }
    setTimeout(() => {
      if (!this.$hasSubscribers$()) {
        this.abort();
      }
    });
  }

  /** Returns a promise resolves when the signal finished computing. */
  async promise(): Promise<void> {
    this.$computeIfNeeded$();
    // Wait for the current computation to finish, but if we became invalid while running, we need to wait for the new computation instead. So we loop until we are no longer invalid
    while (this.$current$?.$promise$) {
      await this.$current$?.$promise$;
    }
  }

  /** Run the computation if needed */
  $computeIfNeeded$(): void {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return;
    }
    // Skip computation on SSR for clientOnly signals
    if (
      (import.meta.env.TEST ? isServerPlatform() : isServer) &&
      this.$flags$ & AsyncSignalFlags.CLIENT_ONLY
    ) {
      // We must pretend to load, and register as a listener for the captures
      this.$untrackedLoading$ = true;
      (this.$container$ as SSRContainer)?.serializationCtx.$eagerResume$.add(this);
      return;
    }
    this.$clearNextPoll$();

    if (this.$current$) {
      this.$requestCleanups$(this.$current$);
    }

    const limit = this.$concurrency$ === 0 ? Number.POSITIVE_INFINITY : this.$concurrency$;
    if (this.$jobs$.length >= limit) {
      DEBUG && log(`Concurrency limit ${limit} reached, not starting new computation`);
      // We requested cleanups for all the previous jobs, once one finishes it will be removed from the jobs array and trigger computeIfNeeded
      return;
    }

    DEBUG && log('Starting new async computation');

    this.$flags$ &= ~SignalFlags.INVALID;

    // We put the actual computation in a separate method so we can easily retain the promise
    const infoVersion = this.$infoVersion$;
    const running = new AsyncJob(this, this.$info$, infoVersion);
    this.$current$ = running;
    this.$jobs$.push(running);
    running.$promise$ = this.$runComputation$(running);
  }

  async $runComputation$(running: AsyncJob<T>): Promise<void> {
    const isCurrent = () => running === this.$current$;

    this.untrackedLoading = true;

    const fn = this.$computeQrl$.resolved || (await this.$computeQrl$.resolve());

    try {
      if (this.$timeoutMs$) {
        this.$computationTimeoutId$ = setTimeout(() => {
          running.$abortController$?.abort();
          const error = new Error(`timeout`);
          if (isCurrent()) {
            this.untrackedError = error;
            running.$canWrite$ = false;
          }
        }, this.$timeoutMs$);
      }

      // Try to stay sync if possible
      const valuePromise = retryOnPromise(fn.bind(null, running));
      const value = isPromise(valuePromise) ? await valuePromise : valuePromise;

      running.$promise$ = null;

      if (running.$canWrite$) {
        const index = this.$jobs$.indexOf(running);
        if (index !== -1) {
          for (let i = 0; i < index; i++) {
            this.$jobs$[i].$canWrite$ = false;
          }
        }

        DEBUG && log('Promise resolved', value);
        // we leave error as-is until result

        // Note that these assignments run setters
        this.untrackedError = undefined;
        // Use super.value instead of this.value to avoid the AsyncSignalImpl setter
        // which clears INVALID and disables all jobs. INVALID must persist so that
        // line 442 can detect dependency changes during computation and re-run.
        super.value = value;
      }
    } catch (err) {
      running.$promise$ = null;
      DEBUG && log('Error caught in promise.catch', err);
      if (isCurrent()) {
        this.untrackedError = err as Error;
        // Reset value so next read throws the promise instead of returning stale data
        this.$untrackedValue$ = NEEDS_COMPUTATION;
      }
    }

    if (isCurrent()) {
      clearTimeout(this.$computationTimeoutId$);
      if (running.$infoVersion$ === this.$infoVersion$) {
        this.$info$ = undefined;
      }

      if (this.$flags$ & SignalFlags.INVALID) {
        DEBUG && log('Computation finished but signal is invalid, re-running');
        // we became invalid again while running, so we need to re-run the computation to get the new promise
        this.$computeIfNeeded$();
      } else {
        this.untrackedLoading = false;
        this.$scheduleNextPoll$();
      }
    }
  }

  /** Called after SSR/unmount */
  async $destroy$() {
    this.$clearNextPoll$();
    clearTimeout(this.$computationTimeoutId$);
    if (this.$current$) {
      await this.$requestCleanups$(this.$current$);
    }
    await Promise.all(this.$jobs$.map((job) => job.$promise$));
  }

  private $clearNextPoll$() {
    if (this.$pollTimeoutId$ !== undefined) {
      clearTimeout(this.$pollTimeoutId$);
      this.$pollTimeoutId$ = undefined;
    }
  }

  private $scheduleNextPoll$() {
    if (!(import.meta.env.TEST ? !isServerPlatform() : isBrowser) || this.$interval$ === 0) {
      return;
    }

    this.$clearNextPoll$();

    if (this.$interval$ < 0) {
      this.$pollTimeoutId$ = setTimeout(() => {
        this.$pollTimeoutId$ = undefined;
        this.$flags$ |= SignalFlags.INVALID;
      }, -this.$interval$);
    } else {
      this.$pollTimeoutId$ = setTimeout(this.invalidate.bind(this), this.$interval$);
    }

    this.$pollTimeoutId$?.unref?.();
  }

  private $hasSubscribers$(): boolean {
    return !!(this.$effects$?.size || this.$loadingEffects$?.size || this.$errorEffects$?.size);
  }

  async $requestCleanups$(job: AsyncJob<T>, reason?: any) {
    if (job.$cleanupRequested$) {
      return job.$promise$;
    }
    DEBUG && log('Requesting cleanups for job', job);
    job.$cleanupRequested$ = true;
    job.$abortController$?.abort(reason);
    job.$promise$ = Promise.resolve(job.$promise$).then(
      () => (job.$promise$ = this.$runCleanups$(job))
    );
  }
  /** Clean up and trigger signal compute once complete */
  async $runCleanups$(job: AsyncJob<T>) {
    const cleanups = job.$cleanups$;
    if (cleanups?.length) {
      DEBUG && log('cleanup start', job);
      const onError = (err: any) => {
        const handleError = this.$container$?.handleError;
        if (handleError) {
          handleError(err, null!);
        } else {
          console.error('Error in async signal cleanup', err);
        }
      };
      DEBUG && log('cleanup start for real', job);
      // Keep this sync-ish so sync functions run immediately.
      await Promise.all(
        cleanups.map((fn) => {
          try {
            const result = fn();
            if (isPromise(result)) {
              return result.catch(onError);
            }
          } catch (err) {
            onError(err);
          }
        })
      );
      cleanups.length = 0;
      DEBUG && log('cleanup finished', job);
    }
    // Now trigger compute
    const jobs = this.$jobs$;
    const idx = jobs.indexOf(job);
    if (idx !== -1) {
      jobs.splice(idx, 1);
    }
    this.$computeIfNeeded$();
  }
}
