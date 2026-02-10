import { isDev } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../../debug';
import { assertFalse } from '../../shared/error/assert';
import { QError, qError } from '../../shared/error/error';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import { invokeApply, newInvokeContext, tryGetInvokeContext } from '../../use/use-core';
import { _EFFECT_BACK_REF, type BackRef } from '../backref';
import { clearEffectSubscription } from '../cleanup';
import { getSubscriber } from '../subscriber';
import {
  ComputeQRL,
  EffectProperty,
  EffectSubscription,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
} from '../types';
import { throwIfQRLNotResolved } from '../utils';
import { SignalImpl } from './signal-impl';

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
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

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
    super(container || fn.$container$, NEEDS_COMPUTATION);
    this.$computeQrl$ = fn;
    this.$flags$ = flags;
  }

  invalidate() {
    this.$flags$ |= SignalFlags.INVALID;
    const ctx = newInvokeContext();
    ctx.$container$ = this.$container$ || undefined;
    // @ts-expect-error it's confused about args any[] vs []
    const running = retryOnPromise(invokeApply.bind(this, ctx, this.$computeIfNeeded$));
    if (running) {
      running.catch((err: unknown) => {
        if (this.$container$) {
          this.$container$.handleError(err, null);
        } else {
          console.error('Error during computation', err);
        }
      });
    }
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    isDev && assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
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
    if (ctx) {
      const effectSubscriber = getSubscriber(this, EffectProperty.VNODE);
      clearEffectSubscription(this.$container$!, effectSubscriber);
      ctx.$effectSubscriber$ = effectSubscriber;
    }
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
      super.value = untrackedValue;
    } finally {
      if (ctx) {
        ctx.$effectSubscriber$ = previousEffectSubscription;
      }
    }
  }
}
