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
import { isTask, Task, TaskFlags } from '../use/use-task';
import { isPromise } from '../shared/utils/promises';
import { qDev } from '../shared/utils/qdev';
import type { VNode } from '../client/types';
import { type NodePropData, type NodePropPayload } from '../shared/scheduler';
import { ChoreType } from '../shared/util-chore-type';
import type { Container, HostElement } from '../shared/types';
import type { ISsrNode, SSRContainer } from '../ssr/ssr-types';
import type { ReadonlySignal, Signal as ISignal } from './signal.public';
import type { TargetType } from './store';
import type { Props } from '../shared/jsx/jsx-runtime';
import type { OnRenderFn } from '../shared/component.public';
import { _EFFECT_BACK_REF, NEEDS_COMPUTATION } from './flags';
import { QError, qError } from '../shared/error/error';
import { isDomContainer } from '../client/dom-container';
import { type BackRef } from './signal-cleanup';
import { getSubscriber } from './subscriber';
import { StaticPropId } from '../../server/qwik-copy';

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

export const enum SignalFlags {
  INVALID = 1,
}

export const enum WrappedSignalFlags {
  // should subscribe to value and be unwrapped for PropsProxy
  UNWRAP = 2,
}

export type AllSignalFlags = SignalFlags | WrappedSignalFlags;

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
export type Consumer = Task | VNode | ISsrNode | Signal;

/** @internal */
export class SubscriptionData {
  data: NodePropData;

  constructor(data: NodePropData) {
    this.data = data;
  }
}

/**
 * An effect consumer plus type of effect, back references to producers and additional data
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
 * The `EffectSubscription` stores
 *
 * ```
 * subscription1 = [effectConsumer1, EffectProperty.COMPONENT, Set[(signalA, signalB)]];
 * ```
 *
 * The `signal1` and `signal2` back references are needed to "clear" existing subscriptions.
 *
 * Both `signalA` as well as `signalB` will have a reference to `subscription` to the so that the
 * effect can be scheduled if either `signalA` or `signalB` triggers. The `subscription1` is shared
 * between the signals.
 *
 * The second position `EffectProperty|string` store the property name of the effect.
 *
 * - Property name of the VNode
 * - `EffectProperty.COMPONENT` if component
 * - `EffectProperty.VNODE` if VNode
 */
export type EffectSubscription = [
  Consumer, // EffectSubscriptionProp.CONSUMER
  EffectProperty | string, // EffectSubscriptionProp.PROPERTY or string for attributes
  Set<Signal | TargetType> | null, // EffectSubscriptionProp.BACK_REF
  SubscriptionData | null, // EffectSubscriptionProp.DATA
];

export const enum EffectSubscriptionProp {
  CONSUMER = 0,
  PROPERTY = 1,
  BACK_REF = 2,
  DATA = 3,
}

export const enum EffectProperty {
  COMPONENT = ':',
  VNODE = '.',
}

export class Signal<T = any> implements ISignal<T> {
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
    return (
      `[${this.constructor.name}${(this as any).$flags$ & SignalFlags.INVALID ? ' INVALID' : ''} ${String(this.$untrackedValue$)}]` +
      (Array.from(this.$effects$ || [])
        .map((e) => '\n -> ' + pad(qwikDebugToString(e[0]), '    '))
        .join('\n') || '')
    );
  }
  toJSON() {
    return { value: this.$untrackedValue$ };
  }
}

export const ensureContainsSubscription = (
  array: Set<EffectSubscription>,
  effectSubscription: EffectSubscription
) => {
  array.add(effectSubscription);
};

/** Ensure the item is in back refs set */
export const ensureContainsBackRef = (array: EffectSubscription, value: any) => {
  array[EffectSubscriptionProp.BACK_REF] ||= new Set();
  array[EffectSubscriptionProp.BACK_REF].add(value);
};

export const addQrlToSerializationCtx = (
  effectSubscriber: EffectSubscription,
  container: Container | null
) => {
  if (!!container && !isDomContainer(container)) {
    const effect = effectSubscriber[EffectSubscriptionProp.CONSUMER];
    const property = effectSubscriber[EffectSubscriptionProp.PROPERTY];
    let qrl: QRL | null = null;
    if (isTask(effect)) {
      qrl = effect.$qrl$;
    } else if (effect instanceof ComputedSignal) {
      qrl = effect.$computeQrl$;
    } else if (property === EffectProperty.COMPONENT) {
      qrl = container.getHostProp<QRL>(effect as ISsrNode, StaticPropId.ON_RENDER);
    }
    if (qrl) {
      (container as SSRContainer).serializationCtx.$eventQrls$.add(qrl);
    }
  }
};

export const triggerEffects = (
  container: Container | null,
  signal: Signal | TargetType,
  effects: Set<EffectSubscription> | null
) => {
  const isBrowser = isDomContainer(container);
  if (effects) {
    const scheduleEffect = (effectSubscription: EffectSubscription) => {
      const consumer = effectSubscription[EffectSubscriptionProp.CONSUMER];
      const property = effectSubscription[EffectSubscriptionProp.PROPERTY];
      assertDefined(container, 'Container must be defined.');
      if (isTask(consumer)) {
        consumer.$flags$ |= TaskFlags.DIRTY;
        DEBUG && log('schedule.consumer.task', pad('\n' + String(consumer), '  '));
        let choreType = ChoreType.TASK;
        if (consumer.$flags$ & TaskFlags.VISIBLE_TASK) {
          choreType = ChoreType.VISIBLE;
        }
        container.$scheduler$(choreType, consumer);
      } else if (consumer instanceof Signal) {
        // we don't schedule ComputedSignal/DerivedSignal directly, instead we invalidate it and
        // and schedule the signals effects (recursively)
        if (consumer instanceof ComputedSignal) {
          // Ensure that the computed signal's QRL is resolved.
          // If not resolved schedule it to be resolved.
          if (!consumer.$computeQrl$.resolved) {
            container.$scheduler$(ChoreType.QRL_RESOLVE, null, consumer.$computeQrl$);
          }
        }

        (consumer as ComputedSignal<unknown> | WrappedSignal<unknown>).$invalidate$();
      } else if (property === EffectProperty.COMPONENT) {
        const host: HostElement = consumer as any;
        const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(
          host,
          StaticPropId.ON_RENDER
        );
        assertDefined(qrl, 'Component must have QRL');
        const props = container.getHostProp<Props>(host, StaticPropId.ELEMENT_PROPS);
        container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
      } else if (isBrowser) {
        if (property === EffectProperty.VNODE) {
          const host: HostElement = consumer;
          container.$scheduler$(ChoreType.NODE_DIFF, host, host, signal as Signal);
        } else {
          const host: HostElement = consumer;
          const effectData = effectSubscription[EffectSubscriptionProp.DATA];
          if (effectData instanceof SubscriptionData) {
            const data = effectData.data;
            const payload: NodePropPayload = {
              ...data,
              $value$: signal as Signal,
            };
            container.$scheduler$(ChoreType.NODE_PROP, host, property, payload);
          }
        }
      }
    };
    for (const effect of effects) {
      scheduleEffect(effect);
    }
  }

  DEBUG && log('done scheduling');
};

/**
 * A signal which is computed from other signals.
 *
 * The value is available synchronously, but the computation is done lazily.
 */
export class ComputedSignal<T> extends Signal<T> implements BackRef {
  /**
   * The compute function is stored here.
   *
   * The computed functions must be executed synchronously (because of this we need to eagerly
   * resolve the QRL during the mark dirty phase so that any call to it will be synchronous). )
   */
  $computeQrl$: QRLInternal<() => T>;
  $flags$: SignalFlags;
  $forceRunEffects$: boolean = false;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

  constructor(
    container: Container | null,
    fn: QRLInternal<() => T>,
    // We need a separate flag to know when the computation needs running because
    // we need the old value to know if effects need running after computation
    flags = SignalFlags.INVALID
  ) {
    // The value is used for comparison when signals trigger, which can only happen
    // when it was calculated before. Therefore we can pass whatever we like.
    super(container, NEEDS_COMPUTATION);
    this.$computeQrl$ = fn;
    this.$flags$ = flags;
  }

  $invalidate$() {
    this.$flags$ |= SignalFlags.INVALID;
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
    this.$flags$ |= SignalFlags.INVALID;
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
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return false;
    }
    const computeQrl = this.$computeQrl$;
    throwIfQRLNotResolved(computeQrl);

    const ctx = tryGetInvokeContext();
    const previousEffectSubscription = ctx?.$effectSubscriber$;
    ctx && (ctx.$effectSubscriber$ = getSubscriber(this, EffectProperty.VNODE));
    try {
      const untrackedValue = computeQrl.getFn(ctx)() as T;
      if (isPromise(untrackedValue)) {
        throw qError(QError.computedNotSync, [
          computeQrl.dev ? computeQrl.dev.file : '',
          computeQrl.$hash$,
        ]);
      }
      DEBUG && log('Signal.$compute$', untrackedValue);

      this.$flags$ &= ~SignalFlags.INVALID;

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

export class WrappedSignal<T> extends Signal<T> implements BackRef {
  $args$: any[];
  $func$: (...args: any[]) => T;
  $funcStr$: string | null;

  $flags$: AllSignalFlags;
  $hostElement$: HostElement | null = null;
  $forceRunEffects$: boolean = false;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

  constructor(
    container: Container | null,
    fn: (...args: any[]) => T,
    args: any[],
    fnStr: string | null,
    // We need a separate flag to know when the computation needs running because
    // we need the old value to know if effects need running after computation
    flags: SignalFlags = SignalFlags.INVALID | WrappedSignalFlags.UNWRAP
  ) {
    super(container, NEEDS_COMPUTATION);
    this.$args$ = args;
    this.$func$ = fn;
    this.$funcStr$ = fnStr;
    this.$flags$ = flags;
  }

  $invalidate$() {
    this.$flags$ |= SignalFlags.INVALID;
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
    this.$flags$ |= SignalFlags.INVALID;
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
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return false;
    }
    const untrackedValue = trackSignal(
      () => this.$func$(...this.$args$),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    // TODO: we should remove invalid flag here
    // this.$flags$ &= ~SignalFlags.INVALID;
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
