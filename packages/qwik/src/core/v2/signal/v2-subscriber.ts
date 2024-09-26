import { QSubscribers } from '../../util/markers';
import type { VNode } from '../client/types';
import { vnode_getProp } from '../client/vnode';
import { EffectSubscriptionsProp, WrappedSignal, isSignal } from './v2-signal';

export abstract class Subscriber {
  $effectDependencies$: Subscriber[] | null = null;
}

export function isSubscriber(value: unknown): value is Subscriber {
  return value instanceof Subscriber || value instanceof WrappedSignal;
}

export function clearVNodeEffectDependencies(value: VNode): void {
  const effects = vnode_getProp<Subscriber[]>(value, QSubscribers, null);
  if (!effects) {
    return;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const subscriber = effects[i];
    const subscriptionRemoved = clearEffects(subscriber, value);
    if (subscriptionRemoved) {
      effects.splice(i, 1);
    }
  }
}

export function clearSubscriberEffectDependencies(value: Subscriber): void {
  if (value.$effectDependencies$) {
    for (let i = value.$effectDependencies$.length - 1; i >= 0; i--) {
      const subscriber = value.$effectDependencies$[i];
      const subscriptionRemoved = clearEffects(subscriber, value);
      if (subscriptionRemoved) {
        value.$effectDependencies$.splice(i, 1);
      }
    }
  }
}

function clearEffects(subscriber: Subscriber, value: Subscriber | VNode): boolean {
  if (!isSignal(subscriber)) {
    return false;
  }
  const effectSubscriptions = (subscriber as WrappedSignal<unknown>).$effects$;
  if (!effectSubscriptions) {
    return false;
  }
  let subscriptionRemoved = false;
  for (let i = effectSubscriptions.length - 1; i >= 0; i--) {
    const effect = effectSubscriptions[i];
    if (effect[EffectSubscriptionsProp.EFFECT] === value) {
      effectSubscriptions.splice(i, 1);
      subscriptionRemoved = true;
    }
  }
  return subscriptionRemoved;
}
