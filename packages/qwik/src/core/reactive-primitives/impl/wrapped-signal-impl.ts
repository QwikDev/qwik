import { assertFalse } from '../../shared/error/assert';
import { QError, qError } from '../../shared/error/error';
import type { Container, HostElement } from '../../shared/types';
import { ChoreBits } from '../../shared/vnode/enums/chore-bits.enum';
import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import { invokeApply, newInvokeContext, trackSignal } from '../../use/use-core';
import { getValueProp } from '../internal-api';
import type { AllSignalFlags, EffectSubscription } from '../types';
import { EffectProperty, NEEDS_COMPUTATION, ComputedSignalFlags } from '../types';
import { invalidateDerived, isSignal, pullSourcesIfCheck, scheduleEffects } from '../utils';
import { SignalImpl } from './signal-impl';
import { markVNodeDirty } from '../../shared/vnode/vnode-dirty';
import { _EFFECT_BACK_REF } from '../backref';
import { HOST_SIGNAL } from '../../shared/cursor/cursor-props';
import { isDev } from '@qwik.dev/core/build';
import { Brand, brandClass } from '../../shared/utils/brand';

export class WrappedSignalImpl<T> extends SignalImpl<T> {
  $args$: any[];
  $func$: (...args: any[]) => T;
  $funcStr$: string | null;

  $flags$: AllSignalFlags;
  $hostElement$: HostElement | undefined = undefined;
  // important: don't use implemnets BackRef here
  // it causes v8 optimizations eager bailouts, because of not consistent class shape
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: (...args: any[]) => T,
    args: any[],
    fnStr: string | null,
    // We need a separate flag to know when the computation needs running because
    // we need the old value to know if effects need running after computation
    flags: AllSignalFlags = ComputedSignalFlags.INVALID
  ) {
    super(container, NEEDS_COMPUTATION);
    this.$args$ = args;
    this.$func$ = fn;
    this.$funcStr$ = fnStr;
    this.$flags$ = flags;
  }

  invalidate() {
    invalidateDerived(this);
  }

  /**
   * Recompute now; when that throws (e.g. a lazy QRL), defer to a COMPUTE chore on the host. A
   * signal without a host (e.g. a component prop) retries once the promise settles instead, so it
   * is not left in CHECK with its sources unsubscribed.
   */
  $pull$(): void {
    try {
      this.$computeIfNeeded$();
    } catch (err) {
      if (this.$container$ && this.$hostElement$) {
        this.$container$.setHostProp(this.$hostElement$ as HostElement, HOST_SIGNAL, this);
        markVNodeDirty(this.$container$, this.$hostElement$, ChoreBits.COMPUTE);
      } else if (isPromise(err)) {
        const ctx = newInvokeContext();
        ctx.$container$ = this.$container$ || undefined;
        const running = retryOnPromise(() => {
          // A consumer cleaned up while the QRL loaded must not be resubscribed
          if (this.$effects$?.size) {
            invokeApply.call(this, ctx, this.$computeIfNeeded$);
          }
        });
        if (isPromise(running)) {
          running.catch((error: unknown) => {
            if (this.$container$) {
              this.$container$.handleError(error, null);
            } else {
              console.error('Error during computation', error);
            }
          });
        }
      }
    }
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    isDev && assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
    return this.$untrackedValue$;
  }

  $computeIfNeeded$() {
    if (this.$flags$ & ComputedSignalFlags.CHECK) {
      pullSourcesIfCheck(this);
    }
    if (!(this.$flags$ & ComputedSignalFlags.INVALID)) {
      return;
    }
    const untrackedValue = trackSignal(
      () => this.$func$(...this.$args$),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    // A read-driven first compute (e.g. after resume) is not a change the subscribers can act on
    const shouldNotify =
      (this.$untrackedValue$ !== NEEDS_COMPUTATION ||
        this.$flags$ & ComputedSignalFlags.SOURCE_CHANGED) &&
      untrackedValue !== this.$untrackedValue$;
    // Only a tracked compute may be cached; INVALID is restored whenever subscriptions are cleared
    this.$flags$ &= ~ComputedSignalFlags.DIRTY_FLAGS;
    this.$untrackedValue$ = untrackedValue;
    if (shouldNotify) {
      scheduleEffects(this.$container$, this, this.$effects$);
    }
  }

  $unwrapIfSignal$(): SignalImpl<T> | WrappedSignalImpl<T> {
    return this.$func$ === getValueProp && isSignal(this.$args$[0])
      ? (this.$args$[0] as SignalImpl<T>)
      : this;
  }

  // Make this signal read-only
  set value(_: any) {
    throw qError(QError.wrappedReadOnly);
  }
  // Getters don't get inherited when overriding a setter
  get value() {
    return super.value;
  }
}
brandClass(WrappedSignalImpl, Brand.WrappedSignal);
