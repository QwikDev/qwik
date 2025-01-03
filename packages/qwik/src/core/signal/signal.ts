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
import { assertDefined, assertFalse, assertTrue } from '../shared/error/assert';
import { type QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { trackSignal, tryGetInvokeContext } from '../use/use-core';
import { Task, TaskFlags, isTask } from '../use/use-task';
import { ELEMENT_PROPS, OnRenderProp, QSubscribers } from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import { qDev } from '../shared/utils/qdev';
import type { VNode } from '../client/types';
import { vnode_getProp, vnode_isTextVNode, vnode_isVNode, vnode_setProp } from '../client/vnode';
import { ChoreType, type NodePropData, type NodePropPayload } from '../shared/scheduler';
import type { Container, HostElement } from '../shared/types';
import type { ISsrNode } from '../ssr/ssr-types';
import type { Signal as ISignal, ReadonlySignal } from './signal.public';
import type { TargetType } from './store';
import { isSubscriber, Subscriber } from './signal-subscriber';
import type { Props } from '../shared/jsx/jsx-runtime';
import type { OnRenderFn } from '../shared/component.public';
import { NEEDS_COMPUTATION } from './flags';
import { QError, qError } from '../shared/error/error';
import { SerializerSymbol } from '../shared/utils/serialize-utils';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export interface InternalReadonlySignal<T = unknown> extends ReadonlySignal<T> {
  readonly untrackedValue: T;
}

export interface InternalSignal<T = any> extends InternalReadonlySignal<T> {
  value: T;
  untrackedValue: T;
}

export const throwIfQRLNotResolved = (qrl: QRL) => {
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
export const isSignal = (value: any): value is ISignal<unknown> => {
  return value instanceof Signal;
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
export type Effect = Task | VNode | ISsrNode | Signal;

/** @internal */
export class EffectPropData {
  data: NodePropData;

  constructor(data: NodePropData) {
    this.data = data;
  }
}

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
  ...[
    Effect, // EffectSubscriptionsProp.EFFECT
    string, // EffectSubscriptionsProp.PROPERTY
  ],
  // List of signals to release
  ...(
    | EffectPropData // Metadata for the effect
    | string // List of properties (Only used with Store (not with Signal))
    | Signal
    | TargetType
  )[],
];
export const enum EffectSubscriptionsProp {
  EFFECT = 0,
  PROPERTY = 1,
  FIRST_BACK_REF_OR_DATA = 2,
}
export const enum EffectProperty {
  COMPONENT = ':',
  VNODE = '.',
}

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

/** Ensure the item is in array (do nothing if already there) */
export const ensureContains = (array: any[], value: any) => {
  const isMissing = array.indexOf(value) === -1;
  if (isMissing) {
    array.push(value);
  }
};

export const ensureContainsEffect = (
  array: EffectSubscriptions[],
  effectSubscriptions: EffectSubscriptions
) => {
  for (let i = 0; i < array.length; i++) {
    const existingEffect = array[i];
    if (
      existingEffect[0] === effectSubscriptions[0] &&
      existingEffect[1] === effectSubscriptions[1]
    ) {
      return;
    }
  }
  array.push(effectSubscriptions);
};

export const ensureEffectContainsSubscriber = (
  effect: Effect,
  subscriber: Subscriber,
  container: Container | null
) => {
  if (isSubscriber(effect)) {
    effect.$effectDependencies$ ||= [];

    if (subscriberExistInSubscribers(effect.$effectDependencies$, subscriber)) {
      return;
    }

    effect.$effectDependencies$.push(subscriber);
  } else if (vnode_isVNode(effect) && !vnode_isTextVNode(effect)) {
    let subscribers = vnode_getProp<Subscriber[]>(
      effect,
      QSubscribers,
      container ? container.$getObjectById$ : null
    );
    subscribers ||= [];

    if (subscriberExistInSubscribers(subscribers, subscriber)) {
      return;
    }

    subscribers.push(subscriber);
    vnode_setProp(effect, QSubscribers, subscribers);
  } else if (isSSRNode(effect)) {
    let subscribers = effect.getProp(QSubscribers) as Subscriber[];
    subscribers ||= [];

    if (subscriberExistInSubscribers(subscribers, subscriber)) {
      return;
    }

    subscribers.push(subscriber);
    effect.setProp(QSubscribers, subscribers);
  }
};

const isSSRNode = (effect: Effect): effect is ISsrNode => {
  return 'setProp' in effect && 'getProp' in effect && 'removeProp' in effect && 'id' in effect;
};

const subscriberExistInSubscribers = (subscribers: Subscriber[], subscriber: Subscriber) => {
  for (let i = 0; i < subscribers.length; i++) {
    if (subscribers[i] === subscriber) {
      return true;
    }
  }
  return false;
};

export const triggerEffects = (
  container: Container | null,
  signal: Signal | TargetType,
  effects: EffectSubscriptions[] | null
) => {
  if (effects) {
    const scheduleEffect = (effectSubscriptions: EffectSubscriptions) => {
      const effect = effectSubscriptions[EffectSubscriptionsProp.EFFECT];
      const property = effectSubscriptions[EffectSubscriptionsProp.PROPERTY];
      assertDefined(container, 'Container must be defined.');
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
      } else if (effect instanceof Signal) {
        // we don't schedule ComputedSignal/DerivedSignal directly, instead we invalidate it and
        // and schedule the signals effects (recursively)
        if (effect instanceof ComputedSignal) {
          // Ensure that the computed signal's QRL is resolved.
          // If not resolved schedule it to be resolved.
          if (!effect.$computeQrl$.resolved) {
            container.$scheduler$(ChoreType.QRL_RESOLVE, null, effect.$computeQrl$);
          }
        }

        (effect as ComputedSignal<unknown> | WrappedSignal<unknown>).$invalidate$();
      } else if (property === EffectProperty.COMPONENT) {
        const host: HostElement = effect as any;
        const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(host, OnRenderProp);
        assertDefined(qrl, 'Component must have QRL');
        const props = container.getHostProp<Props>(host, ELEMENT_PROPS);
        container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
      } else if (property === EffectProperty.VNODE) {
        const host: HostElement = effect as any;
        const target = host;
        container.$scheduler$(ChoreType.NODE_DIFF, host, target, signal as Signal);
      } else {
        const host: HostElement = effect as any;
        const effectData = effectSubscriptions[EffectSubscriptionsProp.FIRST_BACK_REF_OR_DATA];
        if (effectData instanceof EffectPropData) {
          const data = effectData.data;
          const payload: NodePropPayload = {
            ...data,
            $value$: signal as Signal,
          };
          container.$scheduler$(ChoreType.NODE_PROP, host, property, payload);
        }
      }
    };
    effects.forEach(scheduleEffect);
  }

  DEBUG && log('done scheduling');
};

type ComputeQRL<T> = QRLInternal<(prev: T | undefined) => T>;

/**
 * A signal which is computed from other signals.
 *
 * The value is available synchronously, but the computation is done lazily.
 */
export class ComputedSignal<T> extends Signal<T> {
  /**
   * The compute function is stored here.
   *
   * The computed functions must be executed synchronously (because of this we need to eagerly
   * resolve the QRL during the mark dirty phase so that any call to it will be synchronous). )
   */
  $computeQrl$: ComputeQRL<T>;
  // We need a separate flag to know when the computation needs running because
  // we need the old value to know if effects need running after computation
  $invalid$: boolean = true;
  $forceRunEffects$: boolean = false;

  constructor(container: Container | null, fn: ComputeQRL<T>) {
    // The value is used for comparison when signals trigger, which can only happen
    // when it was calculated before. Therefore we can pass whatever we like.
    super(container, NEEDS_COMPUTATION);
    this.$computeQrl$ = fn;
  }

  $invalidate$() {
    this.$invalid$ = true;
    this.$forceRunEffects$ = false;
    // We should only call subscribers if the calculation actually changed.
    // Therefore, we need to calculate the value now.
    this.$container$?.$scheduler$(ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS, null, this);
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$invalid$ = true;
    this.$forceRunEffects$ = false;
    triggerEffects(this.$container$, this, this.$effects$);
  }

  get untrackedValue() {
    const didChange = this.$computeIfNeeded$();
    if (didChange) {
      this.$forceRunEffects$ = didChange;
    }
    assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
    return this.$untrackedValue$;
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
      const untrackedValue = computeQrl.getFn(ctx)(
        this.$untrackedValue$ === NEEDS_COMPUTATION ? undefined : this.$untrackedValue$
      ) as T;
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

  // Make this signal read-only
  set value(_: any) {
    throw qError(QError.computedReadOnly);
  }
  // Getters don't get inherited when overriding a setter
  get value() {
    return super.value;
  }
}

export class WrappedSignal<T> extends Signal<T> implements Subscriber {
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
    super(container, NEEDS_COMPUTATION);
    this.$args$ = args;
    this.$func$ = fn;
    this.$funcStr$ = fnStr;
  }

  $invalidate$() {
    this.$invalid$ = true;
    this.$forceRunEffects$ = false;
    // We should only call subscribers if the calculation actually changed.
    // Therefore, we need to calculate the value now.
    this.$container$?.$scheduler$(
      ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
      this.$hostElement$,
      this
    );
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$invalid$ = true;
    this.$forceRunEffects$ = false;
    triggerEffects(this.$container$, this, this.$effects$);
  }

  get untrackedValue() {
    const didChange = this.$computeIfNeeded$();
    if (didChange) {
      this.$forceRunEffects$ = didChange;
    }
    assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
    return this.$untrackedValue$;
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
  // Make this signal read-only
  set value(_: any) {
    throw qError(QError.wrappedReadOnly);
  }
  // Getters don't get inherited when overriding a setter
  get value() {
    return super.value;
  }
}

export type CustomSerializable<T, S> = { [SerializerSymbol]: (obj: T) => S };
/**
 * Called with serialized data to reconstruct an object. If it uses signals or stores, it will be
 * called when these change, and then the argument will be the previously constructed object.
 *
 * The constructed object should provide a `[SerializerSymbol]` method which provides the serialized
 * data.
 *
 * This function may not return a promise.
 *
 * @public
 */
export type ConstructorFn<T extends CustomSerializable<T, S>, S> = (
  data: S | T | undefined
) => T extends Promise<any> ? never : T;

/**
 * A signal which provides a non-serializable value. It works like a computed signal, but it is
 * handled slightly differently during serdes.
 *
 * @public
 */
export class SerializedSignal<
  T extends CustomSerializable<T, S>,
  S,
  F extends ConstructorFn<T, S>,
> extends ComputedSignal<T> {
  constructor(container: Container | null, fn: QRL<F>) {
    super(container, fn as unknown as ComputeQRL<T>);
  }
}

/** @internal */
export const isSerializerObj = <T, S>(obj: unknown): obj is CustomSerializable<T, S> => {
  return (
    typeof obj === 'object' && obj !== null && typeof (obj as any)[SerializerSymbol] === 'function'
  );
};
