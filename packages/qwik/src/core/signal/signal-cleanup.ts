import {
  EffectSubscriptionProp,
  WrappedSignal,
  type EffectSubscription,
  Signal,
  type EffectProperty,
  type Consumer,
} from './signal';
import { StoreHandler, getStoreHandler } from './store';
import type { Container } from '../shared/types';
import { ensureMaterialized, vnode_isElementVNode, vnode_isVNode } from '../client/vnode';
import { _EFFECT_BACK_REF } from './flags';

/** Class for back reference to the EffectSubscription */
export abstract class BackRef {
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;
}

export function clearAllEffects(container: Container, consumer: Consumer): void {
  if (vnode_isVNode(consumer) && vnode_isElementVNode(consumer)) {
    ensureMaterialized(consumer);
  }
  const effects = (consumer as BackRef)[_EFFECT_BACK_REF];
  if (!effects) {
    return;
  }
  for (const [, effect] of effects) {
    const backRefs = effect[EffectSubscriptionProp.BACK_REF];
    if (!backRefs) {
      return;
    }
    for (const producer of backRefs) {
      if (producer instanceof Signal) {
        clearSignal(container, producer, effect);
      } else if (container.$storeProxyMap$.has(producer)) {
        const target = container.$storeProxyMap$.get(producer)!;
        const storeHandler = getStoreHandler(target)!;
        clearStore(storeHandler, effect);
      }
    }
  }
}

function clearSignal(container: Container, producer: Signal, effect: EffectSubscription) {
  const effects = producer.$effects$;
  if (effects) {
    effects.delete(effect);
  }

  if (producer instanceof WrappedSignal) {
    producer.$hostElement$ = null;
    clearAllEffects(container, producer);
  }
}

function clearStore(producer: StoreHandler, effect: EffectSubscription) {
  const effects = producer?.$effects$;
  if (effects) {
    for (const propEffects of effects.values()) {
      propEffects.delete(effect);
    }
  }
}
