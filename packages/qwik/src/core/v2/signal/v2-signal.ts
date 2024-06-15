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
import {
  invoke,
  newInvokeContext,
  tryGetInvokeContext,
  type InvokeContext,
} from '../../use/use-core';
import { Task, isTask } from '../../use/use-task';
import { isPromise } from '../../util/promises';
import { qDev } from '../../util/qdev';
import type { VNode } from '../client/types';
import { ChoreType, type Scheduler } from '../shared/scheduler';
import type { Container2, fixMeAny } from '../shared/types';
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
  return new Signal2(undefined, value);
};

export const createComputedSignal2 = <T>(qrl: QRL<() => T>) => {
  if (!qrl.resolved) {
    // When we are creating a signal using a use method, we need to ensure
    // that the computation can be lazy and therefore we need to unsure
    // that the QRL is resolved.
    // When we re-create the signal from serialization (we don't create the signal
    // using useMethod) it is OK to not resolve it until the graph is marked as dirty.
    throw qrl.resolve();
  }
  return new ComputedSignal2(null, qrl as QRLInternal<() => T>);
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
export type EffectSubscriptions = [Effect, InvokeContext | null, ...Signal2[]];

class Signal2<T = any> implements ISignal2<T> {
  protected $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  // TODO perf: use a set?
  protected $effects$: null | EffectSubscriptions[] = null;

  /** Container to get the scheduler and call the computation. */
  protected $container$: Container2 | null = null;

  constructor(container: Container2 | null, value: T) {
    this.$container$ = container;
    this.$untrackedValue$ = value;
  }

  get untrackedValue() {
    return this.$untrackedValue$;
  }

  get value() {
    const ctx = tryGetInvokeContext();
    // If no context or no subscriptions, skip this.
    if (ctx && ctx.$effectSubscriber$) {
      if (this.$container$ === null) {
        assertTrue(!!ctx.$container2$, 'container should be in context ');
        // Grab the container now we have access to it
        this.$container$ = ctx.$container2$!;
      } else {
        console.log(
          'Signal2',
          ctx,
          this.$container$,
          ctx.$container2$,
          this.$container$ === ctx.$container2$
        );
        assertTrue(ctx.$container2$ === this.$container$, 'Do not use signals across containers');
      }
      const effectSubscriber = ctx.$effectSubscriber$;
      const effects = (this.$effects$ ||= []);
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
    if (value !== this.$untrackedValue$) {
      DEBUG && log('Signal.set', this.$untrackedValue$, '->', value);
      this.$untrackedValue$ = value;
      this.$triggerEffects$();
    }
  }

  protected $triggerEffects$() {
    log('meep', this.$effects$, !!this.$container$);
    if (!this.$effects$?.length || !this.$container$) {
      return;
    }
    const scheduleEffect = (effectSubscriptions: EffectSubscriptions) => {
      const effect = effectSubscriptions[0];
      DEBUG && log('       schedule.effect', String(effect));
      if (isTask(effect)) {
        const scheduler = this.$container$!.$scheduler$;
        assertDefined(scheduler, 'Scheduler must be defined.');
        scheduler(ChoreType.TASK, effectSubscriptions as fixMeAny);
      } else if (effect instanceof ComputedSignal2) {
        effect.$invalidate$();
      } else {
        throw new Error('Not implemented');
      }
    };
    this.$effects$.forEach(scheduleEffect);
    this.$effects$.length = 0;
    DEBUG && log('done scheduling');
  }

  // prevent accidental use as value
  valueOf() {
    if (qDev) {
      throw new TypeError('Cannot coerce a Signal, use `.value` instead');
    }
  }
  toString() {
    return `[Signal ${String(this.value)}]`;
  }
  toJSON() {
    return { value: this.value };
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

/**
 * A signal which is computed from other signals.
 *
 * The value is available synchronously, but the computation is done lazily.
 */
class ComputedSignal2<T> extends Signal2<T> {
  /**
   * The compute function is stored here.
   *
   * The computed functions must be executed synchronously (because of this we need to eagerly
   * resolve the QRL during the mark dirty phase so that any call to it will be synchronous). )
   */
  $computeQrl$: QRLInternal<() => T>;
  // We need a separate flag to know when the computation needs running because
  // we need the old value to know if effects need running after computation
  $invalid$: boolean = true;

  constructor(container: Container2 | null, computeTask: QRLInternal<() => T> | null) {
    assertDefined(computeTask, 'compute QRL must be provided');
    // The value is used for comparison when signals trigger, which can only happen
    // when it was calculated before. Therefore we can pass whatever we like.
    super(container, NEEDS_COMPUTATION);
    this.$computeQrl$ = computeTask;
  }

  $invalidate$() {
    this.$invalid$ = true;
    if (!this.$effects$?.length) {
      return;
    }
    // We should only call subscribers if the calculation actually changed.
    // Therefore, we need to calculate the value now.
    // TODO move this calculation to the beginning of the next tick, add chores to that tick if necessary. New chore type?
    if (this.$computeIfNeeded$()) {
      this.$triggerEffects$();
    }
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$invalid$ = true;
    this.$triggerEffects$();
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    return this.$untrackedValue$;
  }

  private $computeIfNeeded$() {
    if (!this.$invalid$) {
      return false;
    }
    const computeQrl = this.$computeQrl$;
    assertDefined(
      computeQrl.resolved,
      'Computed signals must run sync. Expected the QRL to be resolved at this point.'
    );

    // TODO locale (ideally move to global state)
    const ctx = newInvokeContext();
    ctx.$effectSubscriber$ = [this, null];
    ctx.$container2$ = this.$container$!;
    const untrackedValue = computeQrl.getFn(ctx)() as T;
    assertFalse(isPromise(untrackedValue), 'Computed function must be synchronous.');
    DEBUG && log('Signal.$compute$', untrackedValue);
    this.$invalid$ = false;

    const didChange = untrackedValue !== this.$untrackedValue$;
    this.$untrackedValue$ = untrackedValue;

    return didChange;
  }

  // Getters don't get inherited
  get value() {
    return super.value;
  }

  set value(_: any) {
    throw new TypeError('ComputedSignal is read-only');
  }
}

qDev &&
  (ComputedSignal2.prototype.toString = () => {
    return 'ComputedSignal2';
  });
