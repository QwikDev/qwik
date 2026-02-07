import { isBrowser, isServer } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../../debug';
import { isServerPlatform } from '../../shared/platform/platform';
import type { NoSerialize } from '../../shared/serdes/verify';
import type { Container } from '../../shared/types';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import { cleanupDestroyable } from '../../use/utils/destroyable';
import { cleanupFn, trackFn } from '../../use/utils/tracker';
import { _EFFECT_BACK_REF, type BackRef } from '../backref';
import {
  AsyncQRL,
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

const DEBUG = false;
const log = (...args: any[]) =>
  // eslint-disable-next-line no-console
  console.log('ASYNC COMPUTED SIGNAL', ...args.map(qwikDebugToString));

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
  $destroy$: NoSerialize<() => void> | null;
  /** A promise for the currently running computation */
  private $promise$: Promise<void> | null = null;
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
    if ((import.meta.env.TEST ? isServerPlatform() : isServer) && this.$promise$) {
      DEBUG && log('Throwing loading promise for SSR');
      throw this.$promise$;
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
  override invalidate() {
    // clear the promise, we need to get function again
    this.$promise$ = null;
    this.$flags$ |= SignalFlags.INVALID;
    if (this.$effects$?.size) {
      this.promise();
    }
  }

  /** Returns a promise resolves when the signal finished computing. */
  async promise(): Promise<void> {
    this.$computeIfNeeded$();
    await this.$promise$;
  }

  /** Run the computation if needed */
  $computeIfNeeded$(): void {
    if (!(this.$flags$ & SignalFlags.INVALID) || this.$promise$) {
      return;
    }
    DEBUG && log('Starting new async computation');

    this.$flags$ &= ~SignalFlags.INVALID;

    this.$clearNextPoll$();

    // TODO keep set of cleanups per invocation and clean up when invalidated
    // probably use a proxy for the props, lazy create tracker/cleanup/abort
    cleanupDestroyable(this);
    const [cleanup] = cleanupFn(this, (err) => this.$container$?.handleError(err, null!));
    const args = {
      track: trackFn(this, this.$container$),
      cleanup,
    };
    const fn = this.$computeQrl$.resolved;
    // TODO wait for all computations in the container, for SSR and tests
    // need to always wait for all computations to resolve before continuing SSR stream
    const result = fn
      ? retryOnPromise(() => fn(args))
      : this.$computeQrl$.resolve().then((resolvedFn) => retryOnPromise(() => resolvedFn(args)));

    if (isPromise<T>(result)) {
      this.untrackedLoading = true;
      // we leave error as-is until result

      this.$promise$ = result
        .then((promiseValue) => {
          this.$promise$ = null;
          DEBUG && log('Promise resolved', promiseValue);
          // Note that these assignments run setters
          this.untrackedLoading = false;
          this.untrackedError = undefined;
          this.value = promiseValue;

          this.$scheduleNextPoll$();
        })
        .catch((err) => {
          this.$promise$ = null;
          DEBUG && log('Error caught in promise.catch', err);
          this.untrackedLoading = false;
          this.untrackedError = err;
          this.$scheduleNextPoll$();
        });
    } else {
      this.untrackedError = undefined;
      this.value = result;
    }
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    if (this.$promise$) {
      if (this.$untrackedValue$ === NEEDS_COMPUTATION) {
        DEBUG && log('Throwing promise while computing initial value', this);
        throw this.$promise$;
      }
      DEBUG &&
        log('Returning stale value', this.$untrackedValue$, 'while computing', this.$promise$);
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
    if (
      (import.meta.env.TEST ? !isServerPlatform() : isBrowser) &&
      this.$pollMs$ > 0 &&
      this.$effects$?.size
    ) {
      if (this.$pollTimeoutId$ !== undefined) {
        clearTimeout(this.$pollTimeoutId$);
      }
      this.$pollTimeoutId$ = setTimeout(this.invalidate.bind(this), this.$pollMs$);
      this.$pollTimeoutId$?.unref?.();
    }
  }
}
