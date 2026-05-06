import { isBrowser, isDev, isServer } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../../debug';
import { assertTrue } from '../../shared/error/assert';
import { QError, qError } from '../../shared/error/error';
import { isServerPlatform } from '../../shared/platform/platform';
import type { Container } from '../../shared/types';
import { isPromise, maybeThen, retryOnPromise } from '../../shared/utils/promises';
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
  $promise$: Promise<void> | null | void = null;
  $cleanupRequested$: boolean = false;
  $canWrite$: boolean = true;
  declare $track$: AsyncCtx<T>['track'] | undefined;
  declare $cleanups$: Parameters<AsyncCtx<T>['cleanup']>[0][] | undefined;
  declare $abortController$: AbortController | undefined;
  declare info: unknown;
  declare $infoVersion$: number | undefined;

  constructor(
    readonly $signal$: AsyncSignalImpl<T>,
    info: unknown,
    $infoVersion$: number | undefined
  ) {
    if (info !== undefined) {
      this.info = info;
      this.$infoVersion$ = $infoVersion$;
    }
  }

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
        'useResource cache() method does not do anything. Use `useAsync$` instead of `useResource$`, use the `expires` option for polling behavior.'
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
  $current$: AsyncJob<T> | null = null;

  // Only declare these less common properties, to save some memory
  declare $jobs$: AsyncJob<T>[] | undefined;
  declare $concurrency$: number | undefined;
  declare $expires$: number | undefined;
  declare $timeoutMs$: number | undefined;
  declare $loadingEffects$: undefined | Set<EffectSubscription>;
  declare $errorEffects$: undefined | Set<EffectSubscription>;
  declare $pollTimeoutId$: ReturnType<typeof setTimeout> | undefined;
  declare $computationTimeoutId$: ReturnType<typeof setTimeout> | undefined;
  declare $info$: unknown | undefined;
  declare $infoVersion$: number | undefined;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: AsyncQRL<T>,
    flags: SignalFlags | SerializationSignalFlags = SignalFlags.INVALID |
      SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS,
    options?: AsyncSignalOptions<T>
  ) {
    super(container, fn, flags);
    if (!options) {
      return;
    }

    // Handle initial value - eagerly evaluate if function, set $untrackedValue$ and $promiseValue$
    // Do NOT call setValue() which would clear the INVALID flag and prevent async computation
    const initial = options.initial;
    if (initial !== undefined) {
      const initialValue = typeof initial === 'function' ? (initial as () => T)() : initial;
      this.$untrackedValue$ = initialValue;
    }

    const concurrency = options.concurrency;
    if (concurrency !== undefined && concurrency >= 0 && concurrency !== 1) {
      this.$concurrency$ = concurrency;
      this.$jobs$ = [];
    }
    const timeout = options.timeout;
    if (timeout) {
      this.$timeoutMs$ = timeout;
    }
    if (options.eagerCleanup) {
      this.$flags$ |= AsyncSignalFlags.EAGER_CLEANUP;
    }
    if (options.clientOnly) {
      this.$flags$ |= AsyncSignalFlags.CLIENT_ONLY;
    }
    if (options.allowStale === false) {
      if (isDev && initial !== undefined) {
        throw new Error(
          'allowStale: false and initial cannot be used together. ' +
            'allowStale: false clears the value on invalidation, which conflicts with providing an initial value.'
        );
      }
      this.$flags$ |= AsyncSignalFlags.CLEAR_ON_INVALIDATE;
    }
    const expires = options.expires ?? (options.interval ? Math.abs(options.interval) : undefined);
    if (expires) {
      this.expires = expires;
    }
    if (options.poll === false || (options.interval !== undefined && options.interval < 0)) {
      this.$flags$ |= AsyncSignalFlags.NO_POLL;
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
      throw qError(QError.asyncClientOnlyValueDuringSSR);
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
    if (this.$jobs$) {
      for (let i = 0; i < this.$jobs$.length; i++) {
        this.$jobs$[i].$canWrite$ = false;
      }
    } else if (this.$current$) {
      this.$current$.$canWrite$ = false;
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

  get expires() {
    return this.$expires$ || 0;
  }

  set expires(value: number) {
    this.$clearNextPoll$();
    this.$expires$ = value;
    if (this.$expires$ && this.$hasSubscribers$()) {
      this.$scheduleNextPoll$();
    }
  }

  get poll() {
    return !(this.$flags$ & AsyncSignalFlags.NO_POLL);
  }

  set poll(value: boolean) {
    if (value) {
      this.$flags$ &= ~AsyncSignalFlags.NO_POLL;
    } else {
      this.$flags$ |= AsyncSignalFlags.NO_POLL;
    }
    // Reschedule since poll behavior changed
    if (this.$expires$ && this.$hasSubscribers$()) {
      this.$clearNextPoll$();
      this.$scheduleNextPoll$();
    }
  }

  /** @deprecated Use `expires` and `poll` instead. */
  get interval() {
    const expires = this.$expires$ || 0;
    return this.$flags$ & AsyncSignalFlags.NO_POLL ? -expires : expires;
  }

  set interval(value: number) {
    if (value < 0) {
      this.$flags$ |= AsyncSignalFlags.NO_POLL;
    } else {
      this.$flags$ &= ~AsyncSignalFlags.NO_POLL;
    }
    this.expires = Math.abs(value);
  }

  /** Invalidates the signal, causing it to re-compute its value. */
  override async invalidate(info?: unknown) {
    if (arguments.length > 0) {
      this.$info$ = info;
      this.$infoVersion$ = this.$infoVersion$ === undefined ? 1 : this.$infoVersion$ + 1;
    }
    this.$setInvalid$(true, this.$flags$ & AsyncSignalFlags.CLEAR_ON_INVALIDATE);
  }

  $setInvalid$(allowRecalc: boolean, mustClear: boolean | number): void {
    this.$flags$ |= SignalFlags.INVALID;
    this.$clearNextPoll$();
    if (mustClear) {
      this.$untrackedValue$ = NEEDS_COMPUTATION;
    }
    if (
      allowRecalc &&
      (this.$effects$?.size || this.$loadingEffects$?.size || this.$errorEffects$?.size)
    ) {
      // compute in next microtask
      Promise.resolve().then(() => this.$computeIfNeeded$());
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

    // Clear flag here to make sure the cleanups don't start another compute
    this.$flags$ &= ~SignalFlags.INVALID;

    const current = this.$current$;
    if (current) {
      this.$requestCleanups$(current);
    }

    const limit = this.$concurrency$ === 0 ? Number.POSITIVE_INFINITY : (this.$concurrency$ ?? 1);
    // We only have $jobs$[] when concurrency != 1
    if (this.$jobs$ ? this.$jobs$.length >= limit : current?.$promise$) {
      DEBUG && log(`Concurrency limit ${limit} reached, not starting new computation`);
      // We requested cleanups for all the previous jobs, once one finishes it will be removed from the jobs array and trigger computeIfNeeded
      // Restore invalid state
      this.$flags$ |= SignalFlags.INVALID;
      return;
    }

    DEBUG && log('Starting new async computation');

    // We put the actual computation in a separate method so we can easily retain the promise
    const infoVersion = this.$infoVersion$;
    const running = new AsyncJob(this, this.$info$, infoVersion);
    this.$current$ = running;
    if (this.$jobs$) {
      this.$jobs$.push(running);
    }
    running.$promise$ = this.$runComputation$(running);
  }

  async $runComputation$(running: AsyncJob<T>): Promise<void> {
    const isCurrent = () => running === this.$current$;

    let fn = this.$computeQrl$.resolved;
    if (!fn) {
      // QRL resolution is async — we have to publish loading=true before awaiting so
      // subscribers know the value isn't ready yet.
      this.untrackedLoading = true;
      fn = await this.$computeQrl$.resolve();
      if (running.$abortController$?.signal.aborted) {
        DEBUG && log('Computation aborted before it started');
        running.$promise$ = null;
        return;
      }
    }

    try {
      if (this.$timeoutMs$) {
        this.$computationTimeoutId$ = setTimeout(() => {
          const error = new Error(`timeout ${this.$timeoutMs$}ms`);
          this.$setError$(running, error);
          running.$abortController$?.abort(error);
        }, this.$timeoutMs$);
      }

      // Try to stay sync if possible. Only publish loading=true to subscribers when
      // the compute is actually asynchronous — a synchronous resolve (e.g. pre-loaded
      // values injected via _injectAsyncSignalValue) should never transition through a
      // visible loading state, which on SSR would fire the loading-effect subscribers
      // (tasks) while the value is still "loading" from their perspective.
      const valuePromise = retryOnPromise(fn.bind(null, running));
      let value: T;
      if (isPromise(valuePromise)) {
        this.untrackedLoading = true;
        value = await valuePromise;
      } else {
        value = valuePromise;
      }

      running.$promise$ = null;

      if (running.$canWrite$) {
        const jobs = this.$jobs$;
        if (jobs) {
          let doDisable = false;
          for (let i = jobs.length - 1; i >= 0; i--) {
            if (jobs[i] === running) {
              doDisable = true;
            } else if (doDisable) {
              jobs[i].$canWrite$ = false;
            }
          }
        }

        DEBUG && log('Promise resolved', value);
        // we leave error as-is until result

        // Note that these assignments run setters
        this.untrackedError = undefined;
        /**
         * Use super.value instead of this.value to persist invalid state, so that invalidation
         * during computation recomputes
         */
        super.value = value;
      }
    } catch (err) {
      running.$promise$ = null;
      DEBUG && log('Error caught in promise.catch', err);
      this.$setError$(running, err as Error);
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

  /**
   * Sets the error from the given job. We only accept errors from the current job and we ignore
   * AbortErrors.
   */
  $setError$(job: AsyncJob<T>, error: Error): void {
    if (job !== this.$current$ || !job.$canWrite$) {
      return;
    }
    job.$canWrite$ = false;
    if (error instanceof Error && error.name === 'AbortError') {
      // AbortError from AbortSignal is a cancellation, not an actual error
      return;
    }
    this.untrackedError = error;
    // Job failures should be rare and require retrying
    this.untrackedValue = NEEDS_COMPUTATION;
  }

  /** Called after SSR/unmount */
  async $destroy$() {
    this.$clearNextPoll$();
    clearTimeout(this.$computationTimeoutId$);
    const current = this.$current$;
    if (current) {
      this.$requestCleanups$(current);
    }
    if (this.$jobs$) {
      await Promise.all(this.$jobs$.map((job) => job.$promise$));
    } else {
      await current?.$promise$;
    }
  }

  private $clearNextPoll$() {
    if (this.$pollTimeoutId$ !== undefined) {
      clearTimeout(this.$pollTimeoutId$);
      this.$pollTimeoutId$ = undefined;
    }
  }

  private $scheduleNextPoll$() {
    if ((import.meta.env.TEST ? isServerPlatform() : isServer) || !this.$expires$) {
      return;
    }

    this.$clearNextPoll$();

    const allowRecalc = !(this.$flags$ & AsyncSignalFlags.NO_POLL);
    // Even when clear on invalidate, we don't clear if we're merely re-running due to polling
    // We expect to get the new value soon, so we can avoid showing a loading state
    const mustClear = this.$flags$ & AsyncSignalFlags.CLEAR_ON_INVALIDATE && !allowRecalc;
    this.$pollTimeoutId$ = setTimeout(
      () => this.$setInvalid$(allowRecalc, mustClear),
      this.$expires$!
    );

    this.$pollTimeoutId$?.unref?.();
  }

  private $hasSubscribers$(): boolean {
    return !!(this.$effects$?.size || this.$loadingEffects$?.size || this.$errorEffects$?.size);
  }

  $requestCleanups$(job: AsyncJob<T>, reason?: any) {
    if (job.$cleanupRequested$) {
      return;
    }
    DEBUG && log('Requesting cleanups for job', job);
    job.$cleanupRequested$ = true;
    job.$abortController$?.abort(reason);
    job.$promise$ = maybeThen(job.$promise$, () => this.$runCleanups$(job));
  }
  /** Clean up and trigger signal compute once complete */
  $runCleanups$(job: AsyncJob<T>) {
    const cleanups = job.$cleanups$;
    DEBUG && log('cleanup start', job);
    const onError = (err: any) => {
      const handleError = this.$container$?.handleError;
      if (handleError) {
        handleError(err, null!);
      } else {
        console.error('Error in async signal cleanup', err);
      }
    };
    const onDone = () => {
      job.$promise$ = null;
      if (cleanups) {
        cleanups.length = 0;
      }
      DEBUG && log('cleanup finished', job);
      // Now trigger compute
      const jobs = this.$jobs$;
      if (jobs) {
        const idx = jobs.indexOf(job);
        if (idx !== -1) {
          jobs.splice(idx, 1);
        }
      }
      this.$computeIfNeeded$();
    };
    let promiseChain: Promise<void> | undefined = undefined;
    if (cleanups) {
      DEBUG && log('cleanup start for real', job);
      // Keep this sync-ish so sync functions run immediately.
      for (let i = 0; i < cleanups.length; i++) {
        try {
          const result = cleanups[i]();
          if (isPromise(result)) {
            promiseChain = (promiseChain ? promiseChain.then(() => result) : result).catch(onError);
          }
        } catch (err) {
          onError(err);
        }
      }
    }
    if (promiseChain) {
      return promiseChain.then(onDone);
    } else {
      onDone();
    }
  }
}
