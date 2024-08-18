import { QSubscribers } from '../../util/markers';
import type { VNode } from '../client/types';
import { vnode_getProp } from '../client/vnode';
import { EffectSubscriptionsProp, isSignal2, type Signal2 } from './v2-signal';

export abstract class Subscriber {
  $dependencies$: Subscriber[] | null = null;
}

export function isSubscriber(value: unknown): value is Subscriber {
  return value instanceof Subscriber;
}

export function clearVNodeDependencies(value: VNode): void {
  const effects = vnode_getProp<Subscriber[]>(value, QSubscribers, null);
  if (!effects) {
    return;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const subscriber = effects[i];
    const subscriptionRemoved = clearSubscriptions(subscriber, value);
    if (subscriptionRemoved) {
      effects.splice(i, 1);
    }
  }
}

export function clearSubscriberDependencies(value: Subscriber): void {
  if (value.$dependencies$) {
    for (let i = value.$dependencies$.length - 1; i >= 0; i--) {
      const subscriber = value.$dependencies$[i];
      const subscriptionRemoved = clearSubscriptions(subscriber, value);
      if (subscriptionRemoved) {
        value.$dependencies$.splice(i, 1);
      }
    }
  }
}

function clearSubscriptions(subscriber: Subscriber, value: Subscriber | VNode): boolean {
  if (!isSignal2(subscriber)) {
    return false;
  }
  const effectSubscriptions = (subscriber as Signal2<unknown>).$effects$;
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
