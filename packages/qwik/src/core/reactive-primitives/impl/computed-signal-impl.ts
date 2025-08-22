import { qwikDebugToString } from '../../debug';
import { assertFalse } from '../../shared/error/assert';
import { QError, qError } from '../../shared/error/error';
import type { Container } from '../../shared/types';
import { ChoreType } from '../../shared/util-chore-type';
import { isPromise } from '../../shared/utils/promises';
import { tryGetInvokeContext } from '../../use/use-core';
import { throwIfQRLNotResolved } from '../utils';
import type { BackRef } from '../cleanup';
import { getSubscriber } from '../subscriber';
import { SerializationSignalFlags, ComputeQRL, EffectSubscription } from '../types';
import { _EFFECT_BACK_REF, EffectProperty, NEEDS_COMPUTATION, SignalFlags } from '../types';
import { SignalImpl } from './signal-impl';
import type { QRLInternal } from '../../shared/qrl/qrl-class';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('COMPUTED SIGNAL', ...args.map(qwikDebugToString));

/**
 * A signal which is computed from other signals.
 *
 * The value is available synchronously, but the computation is done lazily.
 */
export class ComputedSignalImpl<T, S extends QRLInternal = ComputeQRL<T>>
  extends SignalImpl<T>
  implements BackRef
{
  /**
   * The compute function is stored here.
   *
   * The computed functions must be executed synchronously (because of this we need to eagerly
   * resolve the QRL during the mark dirty phase so that any call to it will be synchronous). )
   */
  $computeQrl$: S;
  $flags$: SignalFlags | SerializationSignalFlags;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

  constructor(
    container: Container | null,
    fn: S,
    // We need a separate flag to know when the computation needs running because
    // we need the old value to know if effects need running after computation
    flags: SignalFlags | SerializationSignalFlags = SignalFlags.INVALID |
      SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS
  ) {
    // The value is used for comparison when signals trigger, which can only happen
    // when it was calculated before. Therefore we can pass whatever we like.
    super(container, NEEDS_COMPUTATION);
    this.$computeQrl$ = fn;
    this.$flags$ = flags;
  }

  invalidate() {
    this.$flags$ |= SignalFlags.INVALID;
    this.$container$?.$scheduler$(
      ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
      null,
      this,
      this.$effects$
    );
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$flags$ |= SignalFlags.RUN_EFFECTS;
    super.force();
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
    return this.$untrackedValue$;
  }

  $computeIfNeeded$() {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return;
    }
    const computeQrl = this.$computeQrl$;
    throwIfQRLNotResolved(computeQrl);

    const ctx = tryGetInvokeContext();
    const previousEffectSubscription = ctx?.$effectSubscriber$;
    ctx && (ctx.$effectSubscriber$ = getSubscriber(this, EffectProperty.VNODE));
    try {
      const untrackedValue = (computeQrl.getFn(ctx) as S)() as T;
      if (isPromise(untrackedValue)) {
        throw qError(QError.computedNotSync, [
          computeQrl.dev ? computeQrl.dev.file : '',
          computeQrl.$hash$,
        ]);
      }
      DEBUG && log('Signal.$compute$', untrackedValue);

      this.$flags$ &= ~SignalFlags.INVALID;
      const didChange = untrackedValue !== this.$untrackedValue$;
      if (didChange) {
        // skip first computation when value is not changed
        if (this.$untrackedValue$ !== NEEDS_COMPUTATION) {
          this.$flags$ |= SignalFlags.RUN_EFFECTS;
        }
        this.$untrackedValue$ = untrackedValue;
      }
    } finally {
      if (ctx) {
        ctx.$effectSubscriber$ = previousEffectSubscription;
      }
    }
  }

  // Make this signal read-only
  set value(_: any) {
    throw qError(QError.computedReadOnly);
  }
  // Getters don't get inherited when overriding a setter
  get value() {
    return super.value;
  }
}
