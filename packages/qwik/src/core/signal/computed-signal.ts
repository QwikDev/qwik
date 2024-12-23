import { AbstractComputedSignal } from './computed-signal.abstract';
import { qwikDebugToString } from '../debug';
import { QError, qError } from '../shared/error/error';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { Container } from '../shared/types';
import { isPromise } from '../shared/utils/promises';
import { tryGetInvokeContext } from '../use/use-core';
import { EffectProperty } from './signal-types';
import { throwIfQRLNotResolved } from './signal-utils';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

/**
 * A signal which is computed from other signals.
 *
 * The value is available synchronously, but the computation is done lazily.
 */
export class ComputedSignal<T> extends AbstractComputedSignal<T> {
  /**
   * The compute function is stored here.
   *
   * The computed functions must be executed synchronously (because of this we need to eagerly
   * resolve the QRL during the mark dirty phase so that any call to it will be synchronous). )
   */
  $computeQrl$: QRLInternal<() => T>;

  constructor(container: Container | null, fn: QRLInternal<() => T>) {
    super(container);
    this.$computeQrl$ = fn;
  }

  $computeIfNeeded$() {
    if (!this.$invalid$) {
      return false;
    }
    const computeQrl = this.$computeQrl$;
    throwIfQRLNotResolved(computeQrl);

    const ctx = tryGetInvokeContext();
    const previousEffectSubscription = ctx?.$effectSubscriber$;
    ctx && (ctx.$effectSubscriber$ = [this, EffectProperty.VNODE]);
    try {
      const untrackedValue = computeQrl.getFn(ctx)() as T;
      if (isPromise(untrackedValue)) {
        throw qError(QError.computedNotSync, [
          computeQrl.dev ? computeQrl.dev.file : '',
          computeQrl.$hash$,
        ]);
      }
      DEBUG && log('Signal.$compute$', untrackedValue);
      this.$invalid$ = false;

      const didChange = untrackedValue !== this.$untrackedValue$;
      if (didChange) {
        this.$untrackedValue$ = untrackedValue;
      }
      return didChange;
    } finally {
      if (ctx) {
        ctx.$effectSubscriber$ = previousEffectSubscription;
      }
    }
  }

  // Getters don't get inherited
  get value() {
    return super.value;
  }

  set value(_: any) {
    throw qError(QError.computedReadOnly);
  }
}
