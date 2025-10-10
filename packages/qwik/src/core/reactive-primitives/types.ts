import type { ISsrNode } from '../ssr/ssr-types';
import type { Task, Tracker } from '../use/use-task';
import type { SubscriptionData } from './subscription-data';
import type { ReadonlySignal } from './signal.public';
import type { SignalImpl } from './impl/signal-impl';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { SerializerSymbol } from '../shared/utils/serialize-utils';
import type { ComputedFn } from '../use/use-computed';
import type { AsyncComputedFn } from '../use/use-async-computed';
import type { Container, SerializationStrategy } from '../shared/types';
import type { VNode } from '../client/vnode-impl';

/**
 * # ================================
 *
 * Signal Types
 *
 * # ================================
 */

/**
 * Special value used to mark that a given signal needs to be computed. This is essentially a
 * "marked as dirty" flag.
 */
export const NEEDS_COMPUTATION: any = Symbol('invalid');

/** @internal */
export const _EFFECT_BACK_REF = Symbol('backRef');

export interface InternalReadonlySignal<T = unknown> extends ReadonlySignal<T> {
  readonly untrackedValue: T;
}

export interface InternalSignal<T = any> extends InternalReadonlySignal<T> {
  value: T;
  untrackedValue: T;
}

export type ComputeQRL<T> = QRLInternal<ComputedFn<T>>;
export type AsyncComputedCtx = {
  track: Tracker;
  cleanup: (callback: () => void) => void;
};
export type AsyncComputeQRL<T> = QRLInternal<AsyncComputedFn<T>>;

/** @public */
export interface ComputedOptions {
  serializationStrategy?: SerializationStrategy;
  container?: Container;
}

export const enum SignalFlags {
  INVALID = 1,
  RUN_EFFECTS = 2,
}

export const enum WrappedSignalFlags {
  // should subscribe to value and be unwrapped for PropsProxy
  UNWRAP = 4,
}

export const enum SerializationSignalFlags {
  // TODO: implement this in the future
  // SERIALIZATION_STRATEGY_AUTO = 8,
  SERIALIZATION_STRATEGY_NEVER = 16,
  SERIALIZATION_STRATEGY_ALWAYS = 32,
}

export type AllSignalFlags = SignalFlags | WrappedSignalFlags | SerializationSignalFlags;

/**
 * Effect is something which needs to happen (side-effect) due to signal value change.
 *
 * There are three types of effects:
 *
 * - `Task`: `useTask`, `useVisibleTask`, `useResource`
 * - `VNode` and `ISsrNode`: Either a component or `<Signal>`
 * - `Signal2`: A derived signal which contains a computation function.
 */
export type Consumer = Task | VNode | ISsrNode | SignalImpl;

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
  Set<SignalImpl | StoreTarget> | null, // EffectSubscriptionProp.BACK_REF
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

/** @public */
export type SerializerArgObject<T, S> = {
  /**
   * This will be called with initial or serialized data to reconstruct an object. If no
   * `initialData` is provided, it will be called with `undefined`.
   *
   * This must not return a Promise.
   */
  deserialize: (data: Awaited<S>) => T;
  /** The initial value to use when deserializing. */
  initial?: S | undefined;
  /**
   * This will be called with the object to get the serialized data. You can return a Promise if you
   * need to do async work.
   *
   * The result may be anything that Qwik can serialize.
   *
   * If you do not provide it, the object will be serialized as `undefined`. However, if the object
   * has a `[SerializerSymbol]` property, that will be used as the serializer instead.
   */
  serialize?: (obj: T) => S;
};

/**
 * Serialize and deserialize custom objects.
 *
 * If you need to use scoped state, you can pass a function instead of an object. The function will
 * be called with the current value, and you can return a new value.
 *
 * @public
 */
export type SerializerArg<T, S> =
  | SerializerArgObject<T, S>
  | (() => SerializerArgObject<T, S> & {
      /**
       * This gets called when reactive state used during `deserialize` changes. You may mutate the
       * current object, or return a new object.
       *
       * If it returns a value, that will be used as the new value, and listeners will be triggered.
       * If no change happened, don't return anything.
       *
       * If you mutate the current object, you must return it so that it will trigger listeners.
       */
      update?: (current: T) => T | void;
    });

export type CustomSerializable<T extends { [SerializerSymbol]: (obj: any) => any }, S> = {
  [SerializerSymbol]: (obj: T) => S;
};

/**
 * # ================================
 *
 * Store Types
 *
 * # ================================
 */

export const STORE_TARGET = Symbol('store.target');
export const STORE_HANDLER = Symbol('store.handler');
export const STORE_ALL_PROPS = Symbol('store.all');

export type StoreTarget = Record<string | symbol, any>;

export const enum StoreFlags {
  NONE = 0,
  RECURSIVE = 1,
  IMMUTABLE = 2,
}
