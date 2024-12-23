/**
 * @file
 *
 *   Signals come in two types:
 *
 *   1. `Signal` - A storage of data
 *   2. `ComputedSignal` - A signal which is computed from other signals.
 *
 *   ## Why is `ComputedSignal` different?
 *
 *   - It needs to store a function which needs to re-run.
 *   - It is `Readonly` because it is computed.
 */
import { pad, qwikDebugToString } from '../debug';
import { assertTrue } from '../shared/error/assert';
import { tryGetInvokeContext } from '../use/use-core';
import { qDev } from '../shared/utils/qdev';
import type { Container } from '../shared/types';
import type { Signal as ISignal } from './signal.public';
import { isSubscriber } from './signal-subscriber';
import { QError, qError } from '../shared/error/error';
import { EffectSubscriptionsProp, type EffectSubscriptions } from './signal-types';
import {
  ensureContains,
  ensureContainsEffect,
  ensureEffectContainsSubscriber,
  triggerEffects,
} from './signal-effects';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export class Signal<T = any> implements ISignal<T> {
  $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  $effects$: null | EffectSubscriptions[] = null;

  $container$: Container | null = null;

  constructor(container: Container | null, value: T) {
    this.$container$ = container;
    this.$untrackedValue$ = value;
    DEBUG && log('new', this);
  }

  get untrackedValue() {
    return this.$untrackedValue$;
  }

  // TODO: should we disallow setting the value directly?
  set untrackedValue(value: T) {
    this.$untrackedValue$ = value;
  }

  get value() {
    const ctx = tryGetInvokeContext();
    if (ctx) {
      if (this.$container$ === null) {
        if (!ctx.$container$) {
          return this.untrackedValue;
        }
        // Grab the container now we have access to it
        this.$container$ = ctx.$container$;
      } else {
        assertTrue(
          !ctx.$container$ || ctx.$container$ === this.$container$,
          'Do not use signals across containers'
        );
      }
      const effectSubscriber = ctx.$effectSubscriber$;
      if (effectSubscriber) {
        const effects = (this.$effects$ ||= []);
        // Let's make sure that we have a reference to this effect.
        // Adding reference is essentially adding a subscription, so if the signal
        // changes we know who to notify.
        ensureContainsEffect(effects, effectSubscriber);
        // But when effect is scheduled in needs to be able to know which signals
        // to unsubscribe from. So we need to store the reference from the effect back
        // to this signal.
        ensureContains(effectSubscriber, this);
        if (isSubscriber(this)) {
          // We need to add the subscriber to the effect so that we can clean it up later
          ensureEffectContainsSubscriber(
            effectSubscriber[EffectSubscriptionsProp.EFFECT],
            this,
            this.$container$
          );
        }
        DEBUG && log('read->sub', pad('\n' + this.toString(), '  '));
      }
    }
    return this.untrackedValue;
  }

  set value(value) {
    if (value !== this.$untrackedValue$) {
      DEBUG &&
        log('Signal.set', this.$untrackedValue$, '->', value, pad('\n' + this.toString(), '  '));
      this.$untrackedValue$ = value;
      triggerEffects(this.$container$, this, this.$effects$);
    }
  }

  // prevent accidental use as value
  valueOf() {
    if (qDev) {
      throw qError(QError.cannotCoerceSignal);
    }
  }

  toString() {
    return (
      `[${this.constructor.name}${(this as any).$invalid$ ? ' INVALID' : ''} ${String(this.$untrackedValue$)}]` +
      (this.$effects$?.map((e) => '\n -> ' + pad(qwikDebugToString(e[0]), '    ')).join('\n') || '')
    );
  }
  toJSON() {
    return { value: this.$untrackedValue$ };
  }
}
