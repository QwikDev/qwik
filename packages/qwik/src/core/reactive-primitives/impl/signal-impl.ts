import { isDev, isServer } from '@qwik.dev/core/build';
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
  scheduleEffects,
} from '../utils';
import type { Signal } from '../signal.public';
import { SignalFlags, type EffectSubscription } from '../types';
import type { WrappedSignalImpl } from './wrapped-signal-impl';
import { isDomContainer } from '../../client/dom-container';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export class SignalImpl<T = any> implements Signal<T> {
  $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  $effects$: undefined | Set<EffectSubscription> = undefined;
  $container$: Container | null = null;
  $wrappedSignal$: WrappedSignalImpl<T> | null = null;

  constructor(container: Container | null, value: T) {
    this.$container$ = container || tryGetInvokeContext()?.$container$ || null;
    this.$untrackedValue$ = value;
    DEBUG && log('new', this);
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    scheduleEffects(this.$container$, this, this.$effects$);
  }

  get untrackedValue() {
    return this.$untrackedValue$;
  }

  // TODO: should we disallow setting the value directly?
  set untrackedValue(value: T) {
    this.$untrackedValue$ = value;
  }

  get value() {
    // Important: first read, then subscribe. Otherwise, initial compute invalidation will cause the reading subscriber to be marked invalid.
    const val = this.untrackedValue;
    const ctx = tryGetInvokeContext();
    if (!ctx) {
      DEBUG && log('read->no-ctx', pad('\n' + this.toString(), '  '));
      return val;
    }
    if (this.$container$ === null) {
      // Grab the container now we have access to it
      this.$container$ = ctx.$container$!;
    } else {
      isDev &&
        assertTrue(
          !ctx.$container$ || ctx.$container$ === this.$container$,
          'Do not use signals across containers'
        );
    }
    const effectSubscriber = ctx.$effectSubscriber$;
    if (effectSubscriber) {
      // Let's make sure that we have a reference to this effect.
      // Adding reference is essentially adding a subscription, so if the signal
      // changes we know who to notify.
      ensureContainsSubscription((this.$effects$ ||= new Set()), effectSubscriber);
      // But when effect is scheduled in needs to be able to know which signals
      // to unsubscribe from. So we need to store the reference from the effect back
      // to this signal.
      ensureContainsBackRef(effectSubscriber, this);
      (import.meta.env.TEST ? !isDomContainer(this.$container$) : isServer) &&
        addQrlToSerializationCtx(effectSubscriber, this.$container$);
      DEBUG && log('read->sub', pad('\n' + this.toString(), '  '));
    } else {
      DEBUG && log('read no sub', pad('\n' + this.toString(), '  '));
    }
    return val;
  }

  set value(value) {
    if (value !== this.$untrackedValue$) {
      DEBUG &&
        log(
          'Signal.set',
          this.$untrackedValue$,
          '->',
          value,
          pad('\n' + this.toString(), '  '),
          this.$effects$ ? 'subs: ' + this.$effects$.size : 'no subs'
        );
      this.$untrackedValue$ = value;
      scheduleEffects(this.$container$, this, this.$effects$);
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
      try {
        return (
          `[${this.constructor.name}${(this as any).$flags$ & SignalFlags.INVALID ? ' INVALID' : ''} ${this.$untrackedValue$}]` +
          (Array.from(this.$effects$ || [])
            .map((e) => '\n -> ' + pad(qwikDebugToString(e.consumer), '    '))
            .join('\n') || '')
        );
      } catch (e) {
        return `[${this.constructor.name} <cannot stringify>]`;
      }
    } else {
      return this.constructor.name;
    }
  }
  toJSON() {
    return { value: this.$untrackedValue$ };
  }
}

export const setupSignalValueAccess = <Sig extends SignalImpl<any>, Prop extends keyof Sig>(
  target: Sig,
  effectsProp: keyof Sig,
  valueProp: Prop
): Sig[Prop] => {
  const ctx = tryGetInvokeContext();
  // We need a container for this
  // Grab the container if we have access to it
  if (ctx && (target.$container$ ||= ctx.$container$ || null)) {
    isDev &&
      assertTrue(
        !ctx.$container$ || ctx.$container$ === target.$container$,
        'Do not use signals across containers'
      );
    const effectSubscriber = ctx.$effectSubscriber$;
    if (effectSubscriber) {
      // Let's make sure that we have a reference to this effect.
      // Adding reference is essentially adding a subscription, so if the signal
      // changes we know who to notify.
      ensureContainsSubscription(
        ((target[effectsProp] as Set<EffectSubscription>) ||= new Set()),
        effectSubscriber
      );
      // But when effect is scheduled in needs to be able to know which signals
      // to unsubscribe from. So we need to store the reference from the effect back
      // to this signal.
      ensureContainsBackRef(effectSubscriber, target);
      addQrlToSerializationCtx(effectSubscriber, target.$container$);
      DEBUG && log('read->sub', pad('\n' + target.toString(), '  '));
    }
  }
  return target[valueProp];
};
