import { qwikDebugToString } from '../../debug';
import type { NoSerialize } from '../../shared/serdes/verify';
import type { Container } from '../../shared/types';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import { cleanupDestroyable } from '../../use/utils/destroyable';
import { cleanupFn, trackFn } from '../../use/utils/tracker';
import { _EFFECT_BACK_REF, type BackRef } from '../backref';
import {
  AsyncComputeQRL,
  EffectProperty,
  EffectSubscription,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
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
 * AsyncComputedSignalImpl
 *
 * # ================================
 */
export class AsyncComputedSignalImpl<T>
  extends ComputedSignalImpl<T | undefined, AsyncComputeQRL<T>>
  implements BackRef
{
  $untrackedLoading$: boolean = false;
  $untrackedError$: Error | undefined = undefined;

  $loadingEffects$: undefined | Set<EffectSubscription> = undefined;
  $errorEffects$: undefined | Set<EffectSubscription> = undefined;
  $destroy$: NoSerialize<() => void> | null;
  $promiseValue$: T | typeof NEEDS_COMPUTATION = NEEDS_COMPUTATION;
  private $promise$: Promise<T> | null = null;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: AsyncComputeQRL<T>,
    flags: SignalFlags | SerializationSignalFlags = SignalFlags.INVALID
  ) {
    super(container, fn, flags);
  }

  /**
   * Loading is true if the signal is still waiting for the promise to resolve, false if the promise
   * has resolved or rejected.
   */
  get loading(): boolean {
    return setupSignalValueAccess(
      this,
      () => (this.$loadingEffects$ ||= new Set()),
      () => this.untrackedLoading
    );
  }

  set untrackedLoading(value: boolean) {
    if (value !== this.$untrackedLoading$) {
      this.$untrackedLoading$ = value;
      DEBUG && log('Set untrackedLoading', value);
      scheduleEffects(this.$container$, this, this.$loadingEffects$);
    }
  }

  get untrackedLoading() {
    return this.$untrackedLoading$;
  }

  /** The error that occurred when the signal was resolved. */
  get error(): Error | undefined {
    return setupSignalValueAccess(
      this,
      () => (this.$errorEffects$ ||= new Set()),
      () => this.untrackedError
    );
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

  override invalidate() {
    // clear the promise, we need to get function again
    this.$promise$ = null;
    super.invalidate();
  }

  async promise(): Promise<T> {
    // make sure we get a new promise during the next computation
    this.$promise$ = null;
    await retryOnPromise(() => this.$computeIfNeeded$());
    return this.$untrackedValue$!;
  }

  $computeIfNeeded$() {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return;
    }

    const untrackedValue =
      // first time
      this.$promiseValue$ === NEEDS_COMPUTATION ||
      // or after invalidation
      this.$promise$ === null
        ? this.$promiseComputation$()
        : this.$promiseValue$;

    if (isPromise<T>(untrackedValue)) {
      const isFirstComputation = this.$promiseValue$ === NEEDS_COMPUTATION;
      this.untrackedLoading = true;
      this.untrackedError = undefined;

      if (this.$promiseValue$ !== NEEDS_COMPUTATION) {
        // skip cleanup after resuming
        cleanupDestroyable(this);
      }

      const promise = untrackedValue
        .then((promiseValue) => {
          DEBUG && log('Promise resolved', promiseValue);
          this.$promiseValue$ = promiseValue;
          this.untrackedLoading = false;
          this.untrackedError = undefined;
          if (this.setValue(promiseValue)) {
            DEBUG && log('Scheduling effects for subscribers', this.$effects$?.size);

            this.$flags$ &= ~SignalFlags.RUN_EFFECTS;
            scheduleEffects(this.$container$, this, this.$effects$);
          }
        })
        .catch((err) => {
          if (isPromise(err)) {
            // ignore promise errors, they will be handled
            return;
          }
          DEBUG && log('Error caught in promise.catch', err);
          this.$promiseValue$ = err;
          this.untrackedLoading = false;
          this.untrackedError = err;
        });

      if (isFirstComputation) {
        // we want to throw only the first time
        // the next time we will return stale value
        throw promise;
      } else {
        DEBUG &&
          log('Returning stale value', this.$untrackedValue$, 'while computing', untrackedValue);
        // Return the promise so the scheduler can track it as a running chore
        return promise;
      }
    } else {
      this.setValue(untrackedValue);
    }
  }

  private async $promiseComputation$(): Promise<T> {
    if (!this.$promise$) {
      const [cleanup] = cleanupFn(this, (err) => this.$container$?.handleError(err, null!));
      this.$promise$ = this.$computeQrl$.getFn()({
        track: trackFn(this, this.$container$),
        cleanup,
      }) as Promise<T>;
    }
    return this.$promise$;
  }

  private setValue(value: T) {
    this.$flags$ &= ~SignalFlags.INVALID;
    const didChange = value !== this.$untrackedValue$;
    if (didChange) {
      this.$untrackedValue$ = value;
      this.$flags$ |= SignalFlags.RUN_EFFECTS;
    }
    return didChange;
  }
}
