import { assertFalse } from '../../shared/error/assert';
import { QError, qError } from '../../shared/error/error';
import type { Container, HostElement } from '../../shared/types';
import { ChoreBits } from '../../shared/vnode/enums/chore-bits.enum';
import { trackSignal } from '../../use/use-core';
import { getValueProp } from '../internal-api';
import type { AllSignalFlags, EffectSubscription } from '../types';
import { EffectProperty, NEEDS_COMPUTATION, SignalFlags, WrappedSignalFlags } from '../types';
import { isSignal, scheduleEffects } from '../utils';
import { SignalImpl } from './signal-impl';
import { markVNodeDirty } from '../../shared/vnode/vnode-dirty';
import { _EFFECT_BACK_REF, type BackRef } from '../backref';
import { HOST_SIGNAL } from '../../shared/cursor/cursor-props';
import { isDev } from '@qwik.dev/core/build';

export class WrappedSignalImpl<T> extends SignalImpl<T> implements BackRef {
  $args$: any[];
  $func$: (...args: any[]) => T;
  $funcStr$: string | null;

  $flags$: AllSignalFlags;
  $hostElement$: HostElement | undefined = undefined;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | undefined = undefined;

  constructor(
    container: Container | null,
    fn: (...args: any[]) => T,
    args: any[],
    fnStr: string | null,
    // We need a separate flag to know when the computation needs running because
    // we need the old value to know if effects need running after computation
    flags: SignalFlags = SignalFlags.INVALID | WrappedSignalFlags.UNWRAP
  ) {
    super(container, NEEDS_COMPUTATION);
    this.$args$ = args;
    this.$func$ = fn;
    this.$funcStr$ = fnStr;
    this.$flags$ = flags;
  }

  invalidate() {
    this.$flags$ |= SignalFlags.INVALID;
    // we are trying to run computation without creating a chore, which can be expensive
    // for many signals. If it fails, we schedule a chore to run the computation.
    try {
      this.$computeIfNeeded$();
    } catch (_) {
      if (this.$container$ && this.$hostElement$) {
        this.$container$.setHostProp(this.$hostElement$ as HostElement, HOST_SIGNAL, this);
        markVNodeDirty(this.$container$, this.$hostElement$, ChoreBits.COMPUTE);
      }
    }
    // if the computation not failed, we can run the effects directly
    if (this.$flags$ & SignalFlags.RUN_EFFECTS) {
      this.$flags$ &= ~SignalFlags.RUN_EFFECTS;
      scheduleEffects(this.$container$, this, this.$effects$);
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
    const untrackedValue = trackSignal(
      () => this.$func$(...this.$args$),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    // TODO: we should remove invalid flag here, but some tests are failing
    // Sometimes we may call .value on wrapped signals without ctx. This means subscription will be
    // not created and effects will not be triggered. After wrapping this with if (this.$container$)
    // less tests are failing, but still some are failing.
    // this.$flags$ &= ~SignalFlags.INVALID;

    // reset flag in case we call computedIfNeeded twice and the value was changed only the first time
    // TODO: change to version number?
    this.$flags$ &= ~SignalFlags.RUN_EFFECTS;
    const didChange = untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$flags$ |= SignalFlags.RUN_EFFECTS;
      this.$untrackedValue$ = untrackedValue;
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
