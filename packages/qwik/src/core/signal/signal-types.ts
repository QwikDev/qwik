import type { VNode } from '../client/types';
import type { NodePropData } from '../shared/scheduler';
import type { ISsrNode } from '../ssr/ssr-types';
import type { Task } from '../use/use-task';
import type { Signal } from './signal';
import type { ReadonlySignal } from './signal.public';
import type { TargetType } from './store';

export interface InternalReadonlySignal<T = unknown> extends ReadonlySignal<T> {
  readonly untrackedValue: T;
}

export interface InternalSignal<T = any> extends InternalReadonlySignal<T> {
  value: T;
  untrackedValue: T;
}

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

/** @internal */
export class EffectPropData {
  data: NodePropData;

  constructor(data: NodePropData) {
    this.data = data;
  }
}
