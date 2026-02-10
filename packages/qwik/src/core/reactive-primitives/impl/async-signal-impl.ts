import { isBrowser, isServer } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../../debug';
import { isServerPlatform } from '../../shared/platform/platform';
import type { Container } from '../../shared/types';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import { trackFn } from '../../use/utils/tracker';
import { _EFFECT_BACK_REF, type BackRef } from '../backref';
import {
  AsyncQRL,
  type AsyncCtx,
  AsyncSignalFlags,
  EffectProperty,
  EffectSubscription,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
  type AsyncSignalOptions,
} from '../types';
import { scheduleEffects } from '../utils';
import { ComputedSignalImpl } from './computed-signal-impl';
import { setupSignalValueAccess } from './signal-impl';
import type { AsyncSignal } from '../signal.public';

/**
 * Planned features:
 *
 * - `eagerCleanup`: boolean - whether to run cleanups eagerly when there are no more subscribers, or
 *   to wait until the next computation/destroy.
 */

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

  constructor(readonly $signal$: AsyncSignalImpl<T>) {}

  get track(): AsyncCtx<T>['track'] {
    return (this.$track$ ||= trackFn(this.$signal$, this.$signal$.$container$));
  }

  get abortSignal(): AbortSignal {
    return (this.$abortController$ ||= new AbortController()).signal;
  }

  /** Backward compatible cache method for resource */
  cache(): void {
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
  $pollTimeoutId$: ReturnType<typeof setTimeout> | undefined = undefined;
  $timeoutMs$: number | undefined;
  $computationTimeoutId$: ReturnType<typeof setTimeout> | undefined;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: AsyncQRL<T>,
    flags: SignalFlags | SerializationSignalFlags = SignalFlags.INVALID |
      SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS,
    options?: AsyncSignalOptions<T>
  ) {
    super(container, fn, flags);
    const interval = options?.interval || 0;
    const concurrency = options?.concurrency ?? 1;
    const initial = options?.initial;
    const timeout = options?.timeout;
    const eagerCleanup = options?.eagerCleanup;

    // Handle initial value - eagerly evaluate if function, set $untrackedValue$ and $promiseValue$
    // Do NOT call setValue() which would clear the INVALID flag and prevent async computation
    if (initial !== undefined) {
      const initialValue = typeof initial === 'function' ? (initial as () => T)() : initial;
      this.$untrackedValue$ = initialValue;
    }

    this.$concurrency$ = concurrency;
    this.$timeoutMs$ = timeout;
    if (eagerCleanup) {
      this.$flags$ |= AsyncSignalFlags.EAGER_CLEANUP;
    }
    this.interval = interval;
  }

  /**
   * Loading is true if the signal is still waiting for the promise to resolve, false if the promise
   * has resolved or rejected.
   *
   * Accessing .loading will trigger computation if needed, since it's often used like
   * `signal.loading ? <Loading /> : signal.value`.
   */
  get loading(): boolean {
    return setupSignalValueAccess(this, '$loadingEffects$', 'untrackedLoading');
  }

  set untrackedLoading(value: boolean) {
    if (value !== this.$untrackedLoading$) {
      this.$untrackedLoading$ = value;
      DEBUG && log('Set untrackedLoading', value);
      scheduleEffects(this.$container$, this, this.$loadingEffects$);
    }
  }

  get untrackedLoading() {
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
    return setupSignalValueAccess(this, '$errorEffects$', 'untrackedError');
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
    if (this.$interval$ > 0 && this.$effects$?.size) {
      this.$scheduleNextPoll$();
    }
  }

  /** Invalidates the signal, causing it to re-compute its value. */
  override async invalidate() {
    this.$flags$ |= SignalFlags.INVALID;
    this.$clearNextPoll$();
    if (this.$effects$?.size || this.$loadingEffects$?.size || this.$errorEffects$?.size) {
      // compute in next microtask
      await true;
      this.$computeIfNeeded$();
    }
  }

  /** Abort the current computation and run cleanups if needed. */
  abort(): void {
    if (this.$current$) {
      this.$requestCleanups$(this.$current$);
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
    }, 0);
  }

  /** Returns a promise resolves when the signal finished computing. */
  async promise(): Promise<void> {
    this.$computeIfNeeded$();
    while (this.$current$?.$promise$) {
      await this.$current$?.$promise$;
    }
  }

  /** Run the computation if needed */
  $computeIfNeeded$(): void {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
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
    const running = new AsyncJob(this);
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

      const value = await retryOnPromise(fn.bind(null, running));

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
        this.value = value;
      }
    } catch (err) {
      running.$promise$ = null;
      DEBUG && log('Error caught in promise.catch', err);
      if (isCurrent()) {
        this.untrackedError = err as Error;
      }
    }

    if (isCurrent()) {
      clearTimeout(this.$computationTimeoutId$);

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
    return this.$untrackedValue$;
  }

  private $clearNextPoll$() {
    if (this.$pollTimeoutId$ !== undefined) {
      clearTimeout(this.$pollTimeoutId$);
      this.$pollTimeoutId$ = undefined;
    }
  }

  private $scheduleNextPoll$() {
    if ((import.meta.env.TEST ? !isServerPlatform() : isBrowser) && this.$interval$ > 0) {
      this.$clearNextPoll$();
      this.$pollTimeoutId$ = setTimeout(this.invalidate.bind(this), this.$interval$);
      this.$pollTimeoutId$?.unref?.();
    }
  }

  private $hasSubscribers$(): boolean {
    return !!(this.$effects$?.size || this.$loadingEffects$?.size || this.$errorEffects$?.size);
  }

  async $requestCleanups$(job: AsyncJob<T>) {
    if (job.$cleanupRequested$) {
      return job.$promise$;
    }
    DEBUG && log('Requesting cleanups for job', job);
    job.$cleanupRequested$ = true;
    job.$abortController$?.abort();
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
