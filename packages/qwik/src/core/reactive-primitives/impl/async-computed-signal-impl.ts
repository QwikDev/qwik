import { qwikDebugToString } from '../../debug';
import type { Container } from '../../shared/types';
import { isPromise } from '../../shared/utils/promises';
import { cleanupFn, trackFn } from '../../use/utils/tracker';
import type { BackRef } from '../cleanup';
import { AsyncComputeQRL, SerializationSignalFlags, EffectSubscription } from '../types';
import { _EFFECT_BACK_REF, EffectProperty, NEEDS_COMPUTATION, SignalFlags } from '../types';
import { throwIfQRLNotResolved } from '../utils';
import { ComputedSignalImpl } from './computed-signal-impl';
import { setupSignalValueAccess } from './signal-impl';
import type { NoSerialize } from '../../shared/serdes/verify';
import { ChoreType } from '../../shared/util-chore-type';

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
  $untrackedLoading$: boolean = false;
  $untrackedError$: Error | null = null;

  $loadingEffects$: null | Set<EffectSubscription> = null;
  $errorEffects$: null | Set<EffectSubscription> = null;
  $destroy$: NoSerialize<() => void> | null;
  private $promiseValue$: T | typeof NEEDS_COMPUTATION = NEEDS_COMPUTATION;

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
    this.$promiseValue$ = NEEDS_COMPUTATION;
  }

  $computeIfNeeded$() {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return;
    }
    const computeQrl = this.$computeQrl$;
    throwIfQRLNotResolved(computeQrl);

    const [cleanup] = cleanupFn(this, (err) => this.$container$?.handleError(err, null!));
    const untrackedValue =
      this.$promiseValue$ === NEEDS_COMPUTATION
        ? (computeQrl.getFn()({
            track: trackFn(this, this.$container$),
            cleanup,
          }) as T)
        : this.$promiseValue$;
    if (isPromise(untrackedValue)) {
      this.untrackedLoading = true;
      this.untrackedError = null;
      throw untrackedValue
        .then((promiseValue) => {
          this.$promiseValue$ = promiseValue;
          this.untrackedLoading = false;
          this.untrackedError = null;
        })
        .catch((err) => {
          this.$promiseValue$ = err;
          this.untrackedLoading = false;
          this.untrackedError = err;
        });
    }
    this.$promiseValue$ = NEEDS_COMPUTATION;
    DEBUG && log('Signal.$asyncCompute$', untrackedValue);

    this.$flags$ &= ~SignalFlags.INVALID;

    const didChange = untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$flags$ |= SignalFlags.RUN_EFFECTS;
      this.$untrackedValue$ = untrackedValue;
    }
    return didChange;
  }
}
