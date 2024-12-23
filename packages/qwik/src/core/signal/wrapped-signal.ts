import { AbstractComputedSignal } from './computed-signal.abstract';
import { QError, qError } from '../shared/error/error';
import type { Container, HostElement } from '../shared/types';
import type { Subscriber } from './signal-subscriber';
import { trackSignal } from '../use/use-core';
import { EffectProperty } from './signal-types';

export class WrappedSignal<T> extends AbstractComputedSignal<T> implements Subscriber {
  $args$: any[];
  $func$: (...args: any[]) => T;
  $funcStr$: string | null;

  // We need a separate flag to know when the computation needs running because
  // we need the old value to know if effects need running after computation
  $invalid$: boolean = true;
  $effectDependencies$: Subscriber[] | null = null;
  $hostElement$: HostElement | null = null;
  $forceRunEffects$: boolean = false;

  constructor(
    container: Container | null,
    fn: (...args: any[]) => T,
    args: any[],
    fnStr: string | null
  ) {
    super(container);
    this.$args$ = args;
    this.$func$ = fn;
    this.$funcStr$ = fnStr;
  }

  $computeIfNeeded$() {
    if (!this.$invalid$) {
      return false;
    }
    const untrackedValue = trackSignal(
      () => this.$func$(...this.$args$),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    const didChange = untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$untrackedValue$ = untrackedValue;
    }
    return didChange;
  }

  // Getters don't get inherited
  get value() {
    return super.value;
  }

  set value(_: any) {
    throw qError(QError.wrappedReadOnly);
  }
}
