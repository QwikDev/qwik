import { qError, QError } from '../../shared/error/error';
import { assertTrue } from '../../shared/error/assert';
import type { Container } from '../../shared/types';
import { addQrlToSerializationCtx, triggerEffects } from '../signal';
import { ensureContainsBackRef } from '../signal';
import { tryGetInvokeContext } from '../../use/use-core';
import { ensureContainsSubscription } from '../signal';
import type { Signal } from '../signal.public';
import { SignalFlags, type EffectSubscription } from '../types';
import { pad, qwikDebugToString } from '../../debug';
import { qDev } from '../../shared/utils/qdev';
import { isDev } from '@qwik.dev/core/build';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export class SignalImpl<T = any> implements Signal<T> {
  $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  $effects$: null | Set<EffectSubscription> = null;

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
        const effects = (this.$effects$ ||= new Set());
        // Let's make sure that we have a reference to this effect.
        // Adding reference is essentially adding a subscription, so if the signal
        // changes we know who to notify.
        ensureContainsSubscription(effects, effectSubscriber);
        // But when effect is scheduled in needs to be able to know which signals
        // to unsubscribe from. So we need to store the reference from the effect back
        // to this signal.
        ensureContainsBackRef(effectSubscriber, this);
        addQrlToSerializationCtx(effectSubscriber, this.$container$);
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
