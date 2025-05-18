import { isDev } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../../debug';
import type { Container } from '../../shared/types';
import { ChoreType } from '../../shared/util-chore-type';
import { isPromise } from '../../shared/utils/promises';
import { cleanupFn, trackFn } from '../../use/utils/tracker';
import type { BackRef } from '../cleanup';
import type { AsyncComputeQRL, EffectSubscription } from '../types';
import { _EFFECT_BACK_REF, EffectProperty, SignalFlags } from '../types';
import { throwIfQRLNotResolved } from '../utils';
import { ComputedSignalImpl } from './computed-signal-impl';
import { setupSignalValueAccess } from './signal-impl';
import type { NoSerialize } from '../../shared/utils/serialize-utils';

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
  extends ComputedSignalImpl<T, AsyncComputeQRL<T>>
  implements BackRef
{
  $untrackedPending$: boolean = false;
  $untrackedFailed$: boolean = false;

  $pendingEffects$: null | Set<EffectSubscription> = null;
  $failedEffects$: null | Set<EffectSubscription> = null;
  $destroy$: NoSerialize<() => void> | null;
  private $promiseValue$: T | null = null;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

  constructor(container: Container | null, fn: AsyncComputeQRL<T>, flags = SignalFlags.INVALID) {
    super(container, fn, flags);
  }

  /**
   * Pending is true if the signal is still waiting for the promise to resolve, false if the promise
   * has resolved or rejected.
   */
  get pending(): boolean {
    return setupSignalValueAccess(
      this,
      () => (this.$pendingEffects$ ||= new Set()),
      () => this.untrackedPending
    );
  }

  set untrackedPending(value: boolean) {
    if (value !== this.$untrackedPending$) {
      this.$untrackedPending$ = value;
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$pendingEffects$
      );
    }
  }

  get untrackedPending() {
    return this.$untrackedPending$;
  }

  /**
   * Failed is true if the signal failed to resolve, false if the promise has resolved or is still
   * pending.
   */
  get failed(): boolean {
    return setupSignalValueAccess(
      this,
      () => (this.$failedEffects$ ||= new Set()),
      () => this.untrackedFailed
    );
  }

  set untrackedFailed(value: boolean) {
    if (value !== this.$untrackedFailed$) {
      this.$untrackedFailed$ = value;
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$failedEffects$
      );
    }
  }

  get untrackedFailed() {
    return this.$untrackedFailed$;
  }

  $computeIfNeeded$() {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return false;
    }
    const computeQrl = this.$computeQrl$;
    throwIfQRLNotResolved(computeQrl);

    const [cleanup] = cleanupFn(this, (err) => this.$container$?.handleError(err, null!));
    const untrackedValue =
      this.$promiseValue$ ??
      (computeQrl.getFn()({
        track: trackFn(this, this.$container$),
        cleanup,
      }) as T);
    if (isPromise(untrackedValue)) {
      this.untrackedPending = true;
      this.untrackedFailed = false;
      throw untrackedValue
        .then((promiseValue) => {
          this.$promiseValue$ = promiseValue;
          this.untrackedPending = false;
        })
        .catch((err) => {
          if (isDev) {
            console.error(err);
          }
          // TODO: should we store the error?
          // this.$promiseValue$ = err;
          this.untrackedFailed = true;
        });
    }
    this.$promiseValue$ = null;
    DEBUG && log('Signal.$asyncCompute$', untrackedValue);

    this.$flags$ &= ~SignalFlags.INVALID;

    const didChange = untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$untrackedValue$ = untrackedValue;
    }
    return didChange;
  }
}
