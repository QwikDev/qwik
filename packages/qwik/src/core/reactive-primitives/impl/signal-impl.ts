import { isDev } from '@qwik.dev/core/build';
import { pad, qwikDebugToString } from '../../debug';
import { assertTrue } from '../../shared/error/assert';
import { qError, QError } from '../../shared/error/error';
import type { Container } from '../../shared/types';
import { qDev } from '../../shared/utils/qdev';
import { tryGetInvokeContext } from '../../use/use-core';
import {
  addQrlToSerializationCtx,
  ensureContainsBackRef,
  ensureContainsSubscription,
} from '../utils';
import type { Signal } from '../signal.public';
import { SignalFlags, type EffectSubscription } from '../types';
import { ChoreType } from '../../shared/util-chore-type';
import type { WrappedSignalImpl } from './wrapped-signal-impl';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export class SignalImpl<T = any> implements Signal<T> {
  $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  $effects$: null | Set<EffectSubscription> = null;
  $container$: Container | null = null;
  $wrappedSignal$: WrappedSignalImpl<T> | null = null;

  constructor(container: Container | null, value: T) {
    this.$container$ = container;
    this.$untrackedValue$ = value;
    DEBUG && log('new', this);
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$container$?.$scheduler$(
      ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
      null,
      this,
      this.$effects$
    );
  }

  get untrackedValue() {
    return this.$untrackedValue$;
  }

  // TODO: should we disallow setting the value directly?
  set untrackedValue(value: T) {
    this.$untrackedValue$ = value;
  }

  get value() {
    return setupSignalValueAccess(
      this,
      () => (this.$effects$ ||= new Set()),
      () => this.untrackedValue
    );
  }

  set value(value) {
    if (value !== this.$untrackedValue$) {
      DEBUG &&
        log('Signal.set', this.$untrackedValue$, '->', value, pad('\n' + this.toString(), '  '));
      this.$untrackedValue$ = value;
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$effects$
      );
    }
  }

  // prevent accidental use as value
  valueOf() {
    if (qDev) {
      throw qError(QError.cannotCoerceSignal);
    }
  }

  toString() {
    if (isDev) {
      return (
        `[${this.constructor.name}${(this as any).$flags$ & SignalFlags.INVALID ? ' INVALID' : ''} ${String(this.$untrackedValue$)}]` +
        (Array.from(this.$effects$ || [])
          .map((e) => '\n -> ' + pad(qwikDebugToString(e[0]), '    '))
          .join('\n') || '')
      );
    } else {
      return this.constructor.name;
    }
  }
  toJSON() {
    return { value: this.$untrackedValue$ };
  }
}

const addEffect = (
  signal: SignalImpl,
  effectSubscriber: EffectSubscription,
  effects: Set<EffectSubscription>
) => {
  // Let's make sure that we have a reference to this effect.
  // Adding reference is essentially adding a subscription, so if the signal
  // changes we know who to notify.
  ensureContainsSubscription(effects, effectSubscriber);
  // But when effect is scheduled in needs to be able to know which signals
  // to unsubscribe from. So we need to store the reference from the effect back
  // to this signal.
  ensureContainsBackRef(effectSubscriber, signal);
  addQrlToSerializationCtx(effectSubscriber, signal.$container$);
};

export const setupSignalValueAccess = <T, S>(
  target: SignalImpl<T>,
  effectsFn: () => Set<EffectSubscription>,
  returnValueFn: () => S
) => {
  const ctx = tryGetInvokeContext();
  if (ctx) {
    if (target.$container$ === null) {
      if (!ctx.$container$) {
        return returnValueFn();
      }
      // Grab the container now we have access to it
      target.$container$ = ctx.$container$;
    } else {
      assertTrue(
        !ctx.$container$ || ctx.$container$ === target.$container$,
        'Do not use signals across containers'
      );
    }
    const effectSubscriber = ctx.$effectSubscriber$;
    if (effectSubscriber) {
      addEffect(target, effectSubscriber, effectsFn());
      DEBUG && log('read->sub', pad('\n' + target.toString(), '  '));
    }
  }
  return returnValueFn();
};
