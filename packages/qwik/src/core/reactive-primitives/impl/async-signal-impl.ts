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

/**
 * Planned features:
 *
 * - `eagerCleanup`: boolean - whether to run cleanups eagerly when there are no more subscribers, or
 *   to wait until the next computation/destroy.
 * - Concurrent: number (default 1) - how many concurrent computations to allow, 0 for unlimited. If
 *   the limit is reached, marking the signal as invalid will not trigger a new computation until
 *   one of the running computations finishes. This can be used to prevent overload when the signal
 *   is invalidated frequently.
 * - AbortOnInvalidate: boolean (default false) - whether to abort the current computation when the
 *   signal is invalidated. This requires the compute function to accept an AbortSignal and handle
 *   it properly, so it's opt-in. When true, if the signal is invalidated while a computation is
 *   running, the current computation will be aborted (if possible) and a new computation will be
 *   started according to the concurrency limit.
 * - Abort: the callback receives an AbortSignal which is aborted when the signal is invalidated. The
 */

const DEBUG = false;
const log = (...args: any[]) =>
  // eslint-disable-next-line no-console
  console.log('ASYNC COMPUTED SIGNAL', ...args.map(qwikDebugToString));

class RunningAsyncCompute<T> implements AsyncCtx {
  $promise$: Promise<void> | null = null;
  $track$: AsyncCtx['track'] | undefined;
  $cleanups$: Parameters<AsyncCtx['cleanup']>[0][] | undefined;

  constructor(readonly $signal$: AsyncSignalImpl<T>) {}

  get track(): AsyncCtx['track'] {
    return (this.$track$ ||= trackFn(this.$signal$, this.$signal$.$container$));
  }

  cleanup(callback: () => void) {
    if (typeof callback === 'function') {
      (this.$cleanups$ ||= []).push(callback);
    }
  }

  async $runCleanups$(): Promise<void> {
    if (this.$promise$) {
      await this.$promise$;
    }
    const cleanups = this.$cleanups$;
    if (cleanups?.length) {
      let complete: Promise<void> | undefined;
      const onError = (err: any) => {
        const handleError = this.$signal$.$container$?.handleError;
        if (handleError) {
          handleError(err, null!);
        } else {
          console.error('Error in async signal cleanup', err);
        }
      };
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
      return complete;
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
export class AsyncSignalImpl<T> extends ComputedSignalImpl<T, AsyncQRL<T>> implements BackRef {
  $untrackedLoading$: boolean = false;
  $untrackedError$: Error | undefined = undefined;

  $loadingEffects$: undefined | Set<EffectSubscription> = undefined;
  $errorEffects$: undefined | Set<EffectSubscription> = undefined;
  $current$: RunningAsyncCompute<T> | null = null;
  $pollMs$: number = 0;
  $pollTimeoutId$: ReturnType<typeof setTimeout> | undefined = undefined;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: AsyncQRL<T>,
    flags: SignalFlags | SerializationSignalFlags = SignalFlags.INVALID |
      SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS,
    options?: AsyncSignalOptions<T>
  ) {
    super(container, fn, flags);
    const pollMs = options?.pollMs || 0;
    const initial = options?.initial;

    // Handle initial value - eagerly evaluate if function, set $untrackedValue$ and $promiseValue$
    // Do NOT call setValue() which would clear the INVALID flag and prevent async computation
    if (initial !== undefined) {
      const initialValue = typeof initial === 'function' ? (initial as () => T)() : initial;
      this.$untrackedValue$ = initialValue;
    }

    this.pollMs = pollMs;
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

  get pollMs() {
    return this.$pollMs$;
  }

  set pollMs(value: number) {
    this.$clearNextPoll$();
    this.$pollMs$ = value;
    if (this.$pollMs$ > 0 && this.$effects$?.size) {
      this.$scheduleNextPoll$();
    }
  }

  /** Invalidates the signal, causing it to re-compute its value. */
  override async invalidate() {
    this.$flags$ |= SignalFlags.INVALID;
    this.$clearNextPoll$();
    if (this.$effects$?.size) {
      // compute in next microtask
      await true;
      this.$computeIfNeeded$();
    }
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
    if (!(this.$flags$ & SignalFlags.INVALID) || this.$current$?.$promise$) {
      return;
    }
    DEBUG && log('Starting new async computation');

    this.$flags$ &= ~SignalFlags.INVALID;

    this.$clearNextPoll$();

    // We put the actual computation in a separate method so we can easily retain the promise
    const prev = this.$current$;
    this.$current$ = new RunningAsyncCompute(this);
    this.$current$.$promise$ = this.$runComputation$(prev);
  }

  async $runComputation$(prev: RunningAsyncCompute<T> | null): Promise<void> {
    const running = this.$current$!;

    this.untrackedLoading = true;

    const fn = this.$computeQrl$.resolved || (await this.$computeQrl$.resolve());

    await prev?.$runCleanups$();

    try {
      const value = await retryOnPromise(fn.bind(null, running));

      running.$promise$ = null;

      if (this.$current$ === running) {
        DEBUG && log('Promise resolved', value);
        // we leave error as-is until result

        // Note that these assignments run setters
        this.untrackedError = undefined;
        this.value = value;
      } else {
        DEBUG && log('old Promise resolved, not assigning', value);
        // The new computation will have already called the cleanups, so we can just exit here without doing anything
        return;
      }
    } catch (err) {
      running.$promise$ = null;
      if (this.$current$ === running) {
        DEBUG && log('Error caught in promise.catch', err);
        this.untrackedLoading = false;
        this.untrackedError = err as Error;
      } else {
        DEBUG && log('Error caught in old promise, not assigning', err);
        // The new computation will have already called the cleanups, so we can just exit here without doing anything
        return;
      }
    }

    this.untrackedLoading = false;

    if (this.$flags$ & SignalFlags.INVALID) {
      DEBUG && log('Computation finished but signal is invalid, re-running');
      // we became invalid again while running, so we need to re-run the computation to get the new promise
      this.$computeIfNeeded$();
    } else {
      this.$scheduleNextPoll$();
    }
  }

  /** Called after SSR */
  $destroy$() {
    this.$clearNextPoll$();
    return this.$current$?.$runCleanups$();
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    if (this.$current$?.$promise$) {
      if (this.$untrackedValue$ === NEEDS_COMPUTATION) {
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
    if ((import.meta.env.TEST ? !isServerPlatform() : isBrowser) && this.$pollMs$ > 0) {
      this.$clearNextPoll$();
      this.$pollTimeoutId$ = setTimeout(this.invalidate.bind(this), this.$pollMs$);
      this.$pollTimeoutId$?.unref?.();
    }
  }
}
