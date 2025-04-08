import type { VNode } from '../client/types';
import type { ISsrNode } from '../ssr/ssr-types';
import type { Task } from '../use/use-task';
import type { SubscriptionData } from './subscription-data';
import type { ReadonlySignal } from './signal.public';
import type { TargetType } from './store';
import type { SignalImpl } from './impl/signal-impl';
import type { QRLInternal } from '../shared/qrl/qrl-class';

export interface InternalReadonlySignal<T = unknown> extends ReadonlySignal<T> {
  readonly untrackedValue: T;
}

export interface InternalSignal<T = any> extends InternalReadonlySignal<T> {
  value: T;
  untrackedValue: T;
}

export type ComputeQRL<T> = QRLInternal<() => T>;

export const enum SignalFlags {
  INVALID = 1,
}

export const enum WrappedSignalFlags {
  // should subscribe to value and be unwrapped for PropsProxy
  UNWRAP = 2,
}

export type AllSignalFlags = SignalFlags | WrappedSignalFlags;

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
  Set<SignalImpl | TargetType> | null, // EffectSubscriptionProp.BACK_REF
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
