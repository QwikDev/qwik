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

import { assertDefined, assertFalse, assertTrue } from '../../error/assert';
import { isQrl, type QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import { SubscriptionProp, SubscriptionType, type Subscriber } from '../../state/common';
import { invoke, tryGetInvokeContext, type InvokeContext } from '../../use/use-core';
import { Task, isTask } from '../../use/use-task';
import { isPromise } from '../../util/promises';
import { qDev } from '../../util/qdev';
import type { VNode } from '../client/types';
import { ChoreType, type Scheduler } from '../shared/scheduler';
import type { Signal2 as ISignal2 } from './v2-signal.public';

const DEBUG = true;

/**
 * Special value used to mark that a given signal needs to be computed. This is essentially a
 * "marked as dirty" flag.
 */
const NEEDS_COMPUTATION: any = {
  __dirty__: true,
};

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log(...args);

export const createSignal2 = (value?: any) => {
  return new Signal2(null, value, null);
};

// TODO(mhevery): this should not be a public API.
export const createComputedSignal2 = <T>(qrl: QRL<() => T>) => {
  if (!qrl.resolved) {
    // When we are creating a signal using a use method, we need to ensure
    // that the computation can be lazy and therefore we need to unsure
    // that the QRL is resolved.
    // When we re-create the signal from serialization (we don't create the signal
    // using useMethod) it is OK to not resolve it until the graph is marked as dirty.
    throw qrl.resolve();
  }
  const signal = new Signal2(null, NEEDS_COMPUTATION, qrl as QRLInternal<() => T>);
  return signal;
};

export const isSignal2 = (value: any): value is ISignal2<unknown> => {
  return value instanceof Signal2;
};

/**
 * Effect is something which needs to happen (side-effect) due to signal value change.
 *
 * There are three types of effects:
 *
 * - `Task`: `useTask`, `useVisibleTask`, `useResource`
 * - `VNode`: Either a component or `<Signal>`
 * - `Signal2`: A derived signal which contains a computation function.
 */
type Effect = Task | VNode | Signal2;

/**
 * An effect plus a list of subscriptions effect depends on.
 *
 * An effect can be trigger by one or more of signal inputs. The first step of re-running an effect
 * is to clear its subscriptions so that the effect can re add new set of subscriptions. In order to
 * clear the subscriptions we need to store them here.
 *
 * (For performance reasons we also save `InvokeContext` so that we can avoid re-creating it.)
 *
 * Imagine you have effect such as:
 *
 * ```
 * function effect1() {
 *   console.log(signalA.value ? signalB.value : 'default');
 * }
 * ```
 *
 * In the above case the `signalB` needs to be unsubscribed when `signalA` is falsy. We do this by
 * always clearing all of the subscriptions
 *
 * The `EffectSubscriptions` stores
 *
 * ```
 * subscription1 = [effect1, signalA, signalB];
 * ```
 *
 * The `signal1` and `signal2` back references are needed to "clear" existing subscriptions.
 *
 * Both `signalA` as well as `signalB` will have a reference to `subscription` to the so that the
 * effect can be scheduled if either `signalA` or `signalB` triggers. The `subscription1` is shared
 * between the signals.
 */
type EffectSubscriptions = [Effect, InvokeContext | null, ...Signal2[]];

class Signal2<T = any> implements ISignal2<T> {
  private $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  private $effects$: null | EffectSubscriptions[] = null;

  /**
   * If this signal is computed, then compute function is stored here.
   *
   * The computed functions must be executed synchronously (because of this we need to eagerly
   * resolve the QRL during the mark dirty phase so that any call to it will be synchronous). )
   */
  private $derivedFn$: null | (() => T) | QRLInternal<() => T>;

  /** Scheduler for processing the effects. */
  private $scheduler$: Scheduler | null = null;

  constructor(scheduler: Scheduler | null, value: T, computeTask: QRLInternal<() => T> | null) {
    this.$scheduler$ = scheduler;
    this.$untrackedValue$ = value;
    this.$derivedFn$ = computeTask;
  }

  get untrackedValue() {
    let untrackedValue = this.$untrackedValue$;
    if (untrackedValue === NEEDS_COMPUTATION) {
      const computeFn = this.$derivedFn$!;
      assertDefined(computeFn, 'Signal is marked as dirty, but no compute function is provided.');
      assertFalse(
        isQrl(computeFn),
        'Computed signals must run sync. Expected the QRL to be resolved at this point.'
      );
      const ctx = tryGetInvokeContext();
      const previousSubscriber = ctx?.$subscriber$;
      try {
        ctx && (ctx.$subscriber$ = this as any);
        untrackedValue = invoke(ctx, computeFn) as T;
      } finally {
        ctx && (ctx.$subscriber$ = previousSubscriber);
      }
      assertFalse(isPromise(untrackedValue), 'Computed function must be synchronous.');
      DEBUG && log('Signal.computed', untrackedValue);
      this.$untrackedValue$ = untrackedValue;
    }
    return untrackedValue;
  }

  get value() {
    const ctx = tryGetInvokeContext();
    if (ctx && ctx.$effectSubscriber$) {
      // Create subscription only if you have invocation context. No context, no subscription skip this.
      if (this.$scheduler$ === null) {
        this.$scheduler$ = ctx.$container2$!.$scheduler$;
      } else {
        assertTrue(
          ctx.$container2$!.$scheduler$ === this.$scheduler$,
          'Schedulers do not match. Did you try to use the signal across containers?'
        );
      }
      const effectSubscriber = ctx.$effectSubscriber$;
      const effects = this.$effects$ || (this.$effects$ = []);
      // Let's make sure that we have a reference to this effect.
      // Adding reference is essentially adding a subscription, so if the signal
      // changes we know who to notify.
      ensureContains(effects, effectSubscriber);
      // But when effect is scheduled in needs to be able to know which signals
      // to unsubscribe from. So we need to store the reference from the effect back
      // to this signal.
      ensureContains(effectSubscriber, this);
    }
    return this.untrackedValue;
  }

  set value(value) {
    if (value !== this.untrackedValue) {
      DEBUG && log('Signal.set', this.untrackedValue, '->', value);
      this.$untrackedValue$ = value;
      if (this.$effects$) {
        const scheduleEffect = (effectSubscriptions: EffectSubscriptions) => {
          const effect = effectSubscriptions[0];
          DEBUG && log('       schedule.effect', String(effect));
          if (isTask(effect)) {
            assertDefined(this.$scheduler$, 'Scheduler must be defined.');
            this.$scheduler$(ChoreType.TASK, effect);
          } else if (effect instanceof Signal2) {
            effect.$untrackedValue$ = NEEDS_COMPUTATION;
            effect.$effects$?.forEach(scheduleEffect);
          } else {
            throw new Error('Not implemented');
          }
        };
        this.$effects$.forEach(scheduleEffect);
      }
    }
  }
}

qDev &&
  (Signal2.prototype.toString = () => {
    return 'Signal2';
  });

/** Ensure the item is in array (do nothing if already there) */
function ensureContains(array: any[], value: any) {
  const idx = array.indexOf(value);
  if (idx === -1) {
    array.push(value);
  }
}
