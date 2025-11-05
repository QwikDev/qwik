import { qwikDebugToString } from '../../debug';
import type { NoSerialize } from '../../shared/serdes/verify';
import type { Container } from '../../shared/types';
import { ChoreType } from '../../shared/util-chore-type';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import { cleanupFn, trackFn } from '../../use/utils/tracker';
import type { BackRef } from '../cleanup';
import {
  _EFFECT_BACK_REF,
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
  $untrackedError$: Error | null = null;

  $loadingEffects$: null | Set<EffectSubscription> = null;
  $errorEffects$: null | Set<EffectSubscription> = null;
  $destroy$: NoSerialize<() => void> | null;
  $promiseValue$: T | typeof NEEDS_COMPUTATION = NEEDS_COMPUTATION;
  private $promise$: Promise<T> | null = null;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

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
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$loadingEffects$
      );
    }
  }

  get untrackedLoading() {
    return this.$untrackedLoading$;
  }

  /** The error that occurred when the signal was resolved. */
  get error(): Error | null {
    return setupSignalValueAccess(
      this,
      () => (this.$errorEffects$ ||= new Set()),
      () => this.untrackedError
    );
  }

  set untrackedError(value: Error | null) {
    if (value !== this.$untrackedError$) {
      this.$untrackedError$ = value;
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$errorEffects$
      );
    }
  }

  get untrackedError() {
    return this.$untrackedError$;
  }

  override invalidate() {
    super.invalidate();
    // clear the promise, we need to get function again
    this.$promise$ = null;
  }

  async promise(): Promise<T> {
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

    if (isPromise(untrackedValue)) {
      const isFirstComputation = this.$promiseValue$ === NEEDS_COMPUTATION;
      this.untrackedLoading = true;
      this.untrackedError = null;

      const promise = untrackedValue
        .then((promiseValue) => {
          DEBUG && log('Promise resolved', promiseValue);
          this.$promiseValue$ = promiseValue;
          this.untrackedLoading = false;
          this.untrackedError = null;
          if (this.setValue(promiseValue)) {
            DEBUG && log('Scheduling effects for subscribers', this.$effects$?.size);
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
