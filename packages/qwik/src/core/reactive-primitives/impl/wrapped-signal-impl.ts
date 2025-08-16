import { assertFalse } from '../../shared/error/assert';
import { QError, qError } from '../../shared/error/error';
import type { Container, HostElement } from '../../shared/types';
import { ChoreType } from '../../shared/util-chore-type';
import { trackSignal } from '../../use/use-core';
import type { BackRef } from '../cleanup';
import type { AllSignalFlags, EffectSubscription } from '../types';
import {
  _EFFECT_BACK_REF,
  EffectProperty,
  NEEDS_COMPUTATION,
  SignalFlags,
  WrappedSignalFlags,
} from '../types';
import { SignalImpl } from './signal-impl';

export class WrappedSignalImpl<T> extends SignalImpl<T> implements BackRef {
  $args$: any[];
  $func$: (...args: any[]) => T;
  $funcStr$: string | null;

  $flags$: AllSignalFlags;
  $hostElement$: HostElement | null = null;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

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
    this.$container$?.$scheduler$(
      ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
      this.$hostElement$,
      this,
      this.$effects$
    );
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object.
   */
  force() {
    this.$flags$ |= SignalFlags.RUN_EFFECTS;
    this.$container$?.$scheduler$(
      ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
      this.$hostElement$,
      this,
      this.$effects$
    );
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
    const untrackedValue = trackSignal(
      () => this.$func$(...this.$args$),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    // TODO: we should remove invalid flag here, but some tests are failing
    // this.$flags$ &= ~SignalFlags.INVALID;
    const didChange = untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$flags$ |= SignalFlags.RUN_EFFECTS;
      this.$untrackedValue$ = untrackedValue;
    }
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
