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

import { pad, qwikDebugToString } from '../../debug';
import { assertDefined, assertFalse, assertTrue } from '../../error/assert';
import { type QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import { trackSignal2, tryGetInvokeContext } from '../../use/use-core';
import { Task, TaskFlags, isTask } from '../../use/use-task';
import { ELEMENT_PROPS, OnRenderProp } from '../../util/markers';
import { isPromise } from '../../util/promises';
import { qDev } from '../../util/qdev';
import type { VNode } from '../client/types';
import { ChoreType } from '../shared/scheduler';
import type { Container2, HostElement, fixMeAny } from '../shared/types';
import type { ISsrNode } from '../ssr/ssr-types';
import type { Signal2 as ISignal2 } from './v2-signal.public';
import type { Store2 } from './v2-store';

const DEBUG = false;

/**
 * Special value used to mark that a given signal needs to be computed. This is essentially a
 * "marked as dirty" flag.
 */
const NEEDS_COMPUTATION: any = {
  __dirty__: true,
};

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export const createSignal2 = (value?: any) => {
  return new Signal2(null, value);
};

export const createComputedSignal2 = <T>(qrl: QRL<() => T>) => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignal2(null, qrl as QRLInternal<() => T>);
};

export const throwIfQRLNotResolved = <T>(qrl: QRL<() => T>) => {
  const resolved = qrl.resolved;
  if (!resolved) {
    // When we are creating a signal using a use method, we need to ensure
    // that the computation can be lazy and therefore we need to unsure
    // that the QRL is resolved.
    // When we re-create the signal from serialization (we don't create the signal
    // using useMethod) it is OK to not resolve it until the graph is marked as dirty.
    throw qrl.resolve();
  }
};

/** @public */
export const isSignal2 = (value: any): value is ISignal2<unknown> => {
  return value instanceof Signal2;
};

/**
 * Effect is something which needs to happen (side-effect) due to signal value change.
 *
 * There are three types of effects:
 *
 * - `Task`: `useTask`, `useVisibleTask`, `useResource`
 * - `VNode` and `ISsrNode`: Either a component or `<Signal>`
 * - `Signal2`: A derived signal which contains a computation function.
 */
export type Effect = Task | VNode | ISsrNode | Signal2;

/**
 * An effect plus a list of subscriptions effect depends on.
 *
 * An effect can be trigger by one or more of signal inputs. The first step of re-running an effect
 * is to clear its subscriptions so that the effect can re add new set of subscriptions. In order to
 * clear the subscriptions we need to store them here.
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
 *
 * The second position `string|boolean` store the property name of the effect.
 *
 * - Property name of the VNode
 * - `EffectProperty.COMPONENT` if component
 * - `EffectProperty.VNODE` if VNode
 */
export type EffectSubscriptions = [
  Effect, // EffectSubscriptionsProp.EFFECT
  string, // EffectSubscriptionsProp.PROPERTY
  ...// NOTE even thought this is shown as `...(string|Signal2)`
  // it is a list of strings  followed by a list of signals (not intermingled)
  (
    | string // List of properties (Only used with Store2 (not with Signal2))
    | Signal2
    | Store2<any> // List of signals to release
  )[],
];
export const enum EffectSubscriptionsProp {
  EFFECT = 0,
  PROPERTY = 1,
  FIRST_BACK_REF = 2,
}
export const enum EffectProperty {
  COMPONENT = ':',
  VNODE = '.',
}

export class Signal2<T = any> implements ISignal2<T> {
  $untrackedValue$: T;

  /** Store a list of effects which are dependent on this signal. */
  $effects$: null | EffectSubscriptions[] = null;

  $container$: Container2 | null = null;

  constructor(container: Container2 | null, value: T) {
    this.$container$ = container;
    this.$untrackedValue$ = value;
    DEBUG && log('new', this);
  }

  get untrackedValue() {
    return this.$untrackedValue$;
  }

  get value() {
    const ctx = tryGetInvokeContext();
    if (ctx) {
      if (this.$container$ === null) {
        assertDefined(ctx.$container2$, 'container should be in context ');
        // Grab the container now we have access to it
        this.$container$ = ctx.$container2$;
      } else {
        assertTrue(
          !ctx.$container2$ || ctx.$container2$ === this.$container$,
          'Do not use signals across containers'
        );
      }
      let effectSubscriber = ctx.$effectSubscriber$;
      if (!effectSubscriber && ctx.$hostElement$) {
        const host: VNode | null = ctx.$hostElement$ as any;
        if (host) {
          effectSubscriber = [host, EffectProperty.COMPONENT];
        }
      }
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
      throw new TypeError('Cannot coerce a Signal, use `.value` instead');
    }
  }

  toString() {
    return (
      `[${this.constructor.name}${(this as any).$invalid$ ? ' INVALID' : ''} ${String(this.$untrackedValue$)}]` +
        this.$effects$?.map((e) => '\n -> ' + pad(qwikDebugToString(e[0]), '    ')).join('\n') || ''
    );
  }
  toJSON() {
    return { value: this.$untrackedValue$ };
  }
}

/** Ensure the item is in array (do nothing if already there) */
export const ensureContains = (array: any[], value: any) => {
  const isMissing = array.indexOf(value) === -1;
  if (isMissing) {
    array.push(value);
  }
};

export const ensureContainsEffect = (array: EffectSubscriptions[], effect: EffectSubscriptions) => {
  for (let i = 0; i < array.length; i++) {
    const existingEffect = array[i];
    if (existingEffect[0] === effect[0] && existingEffect[1] === effect[1]) {
      return;
    }
  }
  array.push(effect);
};

export const triggerEffects = (
  container: Container2 | null,
  signal: Signal2 | Store2<any>,
  effects: EffectSubscriptions[] | null
) => {
  if (effects) {
    const scheduleEffect = (effectSubscriptions: EffectSubscriptions) => {
      const effect = effectSubscriptions[EffectSubscriptionsProp.EFFECT];
      const property = effectSubscriptions[EffectSubscriptionsProp.PROPERTY];
      assertDefined(container, 'Scheduler must be defined.');
      if (isTask(effect)) {
        effect.$flags$ |= TaskFlags.DIRTY;
        DEBUG && log('schedule.effect.task', pad('\n' + String(effect), '  '));
        let choreType = ChoreType.TASK;
        if (effect.$flags$ & TaskFlags.VISIBLE_TASK) {
          choreType = ChoreType.VISIBLE;
        } else if (effect.$flags$ & TaskFlags.RESOURCE) {
          choreType = ChoreType.RESOURCE;
        }
        container.$scheduler$(choreType, effect);
      } else if (effect instanceof Signal2) {
        // we don't schedule ComputedSignal/DerivedSignal directly, instead we invalidate it and
        // and schedule the signals effects (recursively)
        if (effect instanceof ComputedSignal2) {
          // Ensure that the computed signal's QRL is resolved.
          // If not resolved schedule it to be resolved.
          if (!effect.$computeQrl$.resolved) {
            container.$scheduler$(ChoreType.QRL_RESOLVE, null, effect.$computeQrl$);
          }
        }
        (effect as ComputedSignal2<unknown> | DerivedSignal2<unknown>).$invalid$ = true;
        const previousSignal = signal;
        try {
          signal = effect;
          effect.$effects$?.forEach(scheduleEffect);
        } finally {
          signal = previousSignal;
        }
      } else if (property === EffectProperty.COMPONENT) {
        const host: HostElement = effect as any;
        const qrl = container.getHostProp<QRL<(...args: any[]) => any>>(host, OnRenderProp);
        assertDefined(qrl, 'Component must have QRL');
        const props = container.getHostProp<any>(host, ELEMENT_PROPS);
        container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
      } else if (property === EffectProperty.VNODE) {
        const host: HostElement = effect as any;
        const target = host;
        container.$scheduler$(ChoreType.NODE_DIFF, host, target, signal as fixMeAny);
      } else {
        const host: HostElement = effect as any;
        container.$scheduler$(ChoreType.NODE_PROP, host, property, signal as fixMeAny);
      }
    };
    effects.forEach(scheduleEffect);
  }

  DEBUG && log('done scheduling');
};

/**
 * A signal which is computed from other signals.
 *
 * The value is available synchronously, but the computation is done lazily.
 */
export class ComputedSignal2<T> extends Signal2<T> {
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

  constructor(container: Container2 | null, computeTask: QRLInternal<() => T>) {
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
      triggerEffects(this.$container$, this, this.$effects$);
    }
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$invalid$ = true;
    triggerEffects(this.$container$, this, this.$effects$);
  }

  get untrackedValue() {
    this.$computeIfNeeded$();
    assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
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

    const ctx = tryGetInvokeContext();
    assertDefined(computeQrl, 'Signal is marked as dirty, but no compute function is provided.');
    const previousEffectSubscription = ctx?.$effectSubscriber$;
    ctx && (ctx.$effectSubscriber$ = [this, EffectProperty.VNODE]);
    assertTrue(
      !!computeQrl.resolved,
      'Computed signals must run sync. Expected the QRL to be resolved at this point.'
    );
    try {
      const untrackedValue = computeQrl.getFn(ctx)() as T;
      assertFalse(isPromise(untrackedValue), 'Computed function must be synchronous.');
      DEBUG && log('Signal.$compute$', untrackedValue);
      this.$invalid$ = false;

      const didChange = untrackedValue !== this.$untrackedValue$;
      this.$untrackedValue$ = untrackedValue;
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
    throw new TypeError('ComputedSignal is read-only');
  }
}

export class DerivedSignal2<T> extends Signal2<T> {
  $args$: any[];
  $func$: (...args: any[]) => T;
  $funcStr$: string | null;

  // We need a separate flag to know when the computation needs running because
  // we need the old value to know if effects need running after computation
  $invalid$: boolean = true;

  constructor(
    container: Container2 | null,
    fn: (...args: any[]) => T,
    args: any[],
    fnStr: string | null
  ) {
    super(container, NEEDS_COMPUTATION);
    this.$args$ = args;
    this.$func$ = fn;
    this.$funcStr$ = fnStr;
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
      triggerEffects(this.$container$, this, this.$effects$);
    }
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$invalid$ = true;
    triggerEffects(this.$container$, this, this.$effects$);
  }

  get untrackedValue() {
    if (this.$invalid$ && !this.$container$) {
      // This is a hack to handle isValidJSXChild. Unsure why this is needed.
      return this.$func$(...this.$args$);
    }
    this.$computeIfNeeded$();
    assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
    return this.$untrackedValue$;
  }

  private $computeIfNeeded$() {
    if (!this.$invalid$) {
      return false;
    }
    this.$untrackedValue$ = trackSignal2(
      () => this.$func$(...this.$args$),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
  }

  // Getters don't get inherited
  get value() {
    return super.value;
  }

  set value(_: any) {
    throw new TypeError('DerivedSignal is read-only');
  }
}
