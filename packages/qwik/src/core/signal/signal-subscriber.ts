import { QSubscribers } from '../shared/utils/markers';
import type { ElementVNode, VNode, VirtualVNode } from '../client/types';
import {
  ensureMaterialized,
  vnode_getProp,
  vnode_isElementVNode,
  vnode_setProp,
} from '../client/vnode';
import { EffectSubscriptionsProp, WrappedSignal, isSignal, type Signal } from './signal';
import type { Container } from '../shared/types';
import { StoreHandler, getStoreHandler, isStore, type TargetType } from './store';

export abstract class Subscriber {
  $effectDependencies$: (Subscriber | TargetType)[] | null = null;
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
    clearEffects(subscriber, value, effects, i, container);
  }

  if (effects.length === 0) {
    vnode_setProp(value as ElementVNode | VirtualVNode, QSubscribers, null);
  }
}

export function clearSubscriberEffectDependencies(container: Container, value: Subscriber): void {
  if (value.$effectDependencies$) {
    for (let i = value.$effectDependencies$.length - 1; i >= 0; i--) {
      const subscriber = value.$effectDependencies$[i];
      clearEffects(subscriber, value, value.$effectDependencies$, i, container);
    }

    if (value.$effectDependencies$.length === 0) {
      value.$effectDependencies$ = null;
    }
  }
}

function clearEffects(
  subscriber: Subscriber | TargetType,
  value: Subscriber | VNode,
  effectArray: (Subscriber | TargetType)[],
  indexToRemove: number,
  container: Container
) {
  let subscriptionRemoved = false;
  const seenSet = new Set();
  if (subscriber instanceof WrappedSignal) {
    subscriptionRemoved = clearSignalEffects(subscriber, value, seenSet);
  } else if (container.$storeProxyMap$.has(subscriber)) {
    const store = container.$storeProxyMap$.get(subscriber)!;
    const handler = getStoreHandler(store)!;
    subscriptionRemoved = clearStoreEffects(handler, value);
  }
  if (subscriptionRemoved) {
    effectArray.splice(indexToRemove, 1);
  }
}

function clearSignalEffects(
  subscriber: Signal,
  value: Subscriber | VNode,
  seenSet: Set<unknown>
): boolean {
  const effectSubscriptions = subscriber.$effects$;

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

  if (subscriber instanceof WrappedSignal) {
    const hostElement = subscriber.$hostElement$;
    if (hostElement && hostElement === value) {
      subscriber.$hostElement$ = null;
    }

    // clear the effects of the arguments
    const args = subscriber.$args$;
    if (args) {
      clearArgsEffects(args, subscriber, seenSet);
    }
  }

  return subscriptionRemoved;
}

function clearStoreEffects(storeHandler: StoreHandler, value: Subscriber | VNode): boolean {
  const effectSubscriptions = storeHandler.$effects$;
  if (!effectSubscriptions) {
    return false;
  }
  let subscriptionRemoved = false;
  for (const key in effectSubscriptions) {
    const effects = effectSubscriptions[key];
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      if (effect[EffectSubscriptionsProp.EFFECT] === value) {
        effects.splice(i, 1);
        subscriptionRemoved = true;
      }
    }
  }

  return subscriptionRemoved;
}

function clearArgsEffects(args: any[], subscriber: Subscriber, seenSet: Set<unknown>): void {
  for (let i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    clearArgEffect(arg, subscriber, seenSet);
  }
}

function clearArgEffect(arg: any, subscriber: Subscriber, seenSet: Set<unknown>): void {
  if (seenSet.has(arg)) {
    return;
  }
  seenSet.add(arg);
  if (isSignal(arg)) {
    clearSignalEffects(arg as Signal, subscriber, seenSet);
  } else if (typeof arg === 'object' && arg !== null) {
    if (isStore(arg)) {
      clearStoreEffects(getStoreHandler(arg)!, subscriber);
    } else {
      for (const key in arg) {
        clearArgEffect(arg[key], subscriber, seenSet);
      }
    }
  } else if (Array.isArray(arg)) {
    clearArgsEffects(arg, subscriber, seenSet);
  } else {
    // primitives
  }
}
