import { QSubscribers } from '../shared/utils/markers';
import type { VNode } from '../client/types';
import { ensureMaterialized, vnode_getProp, vnode_isElementVNode } from '../client/vnode';
import type { Container } from '../shared/types';
import { WrappedSignal } from './wrapped-signal';
import { isSignal } from './signal.public';
import { EffectSubscriptionsProp } from './signal-types';

export abstract class Subscriber {
  $effectDependencies$: Subscriber[] | null = null;
}

export function isSubscriber(value: unknown): value is Subscriber {
  return value instanceof Subscriber || value instanceof WrappedSignal;
}

export function clearVNodeEffectDependencies(container: Container, value: VNode): void {
  if (vnode_isElementVNode(value)) {
    ensureMaterialized(value);
  }
  const effects = vnode_getProp<Subscriber[]>(value, QSubscribers, container.$getObjectById$);
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
  const hostElement = (subscriber as WrappedSignal<unknown>).$hostElement$;

  if (hostElement && hostElement === value) {
    (subscriber as WrappedSignal<unknown>).$hostElement$ = null;
  }
  let subscriptionRemoved = false;
  if (effectSubscriptions) {
    for (let i = effectSubscriptions.length - 1; i >= 0; i--) {
      const effect = effectSubscriptions[i];
      if (effect[EffectSubscriptionsProp.EFFECT] === value) {
        effectSubscriptions.splice(i, 1);
        subscriptionRemoved = true;
      }
    }
  }

  // clear the effects of the arguments
  const args = (subscriber as WrappedSignal<unknown>).$args$;
  if (args) {
    for (let i = args.length - 1; i >= 0; i--) {
      clearEffects(args[i], subscriber);
    }
  }

  return subscriptionRemoved;
}
