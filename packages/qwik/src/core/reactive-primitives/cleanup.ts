import { ensureMaterialized, vnode_isElementVNode, vnode_isVNode } from '../client/vnode';
import type { Container } from '../shared/types';
import { SignalImpl } from './impl/signal-impl';
import { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import { StoreHandler, getStoreHandler } from './impl/store';
import {
  EffectSubscriptionProp,
  _EFFECT_BACK_REF,
  type Consumer,
  type EffectProperty,
  type EffectSubscription,
} from './types';
import { AsyncComputedSignalImpl } from './impl/async-computed-signal-impl';
import { isPropsProxy, type PropsProxyHandler } from '../shared/jsx/props-proxy';
import { _PROPS_HANDLER } from '../shared/utils/constants';

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
    clearEffectSubscription(container, effect);
  }
}

export function clearEffectSubscription(container: Container, effect: EffectSubscription) {
  const backRefs = effect[EffectSubscriptionProp.BACK_REF];
  if (!backRefs) {
    return;
  }
  for (const producer of backRefs) {
    if (producer instanceof SignalImpl) {
      clearSignal(container, producer, effect);
    } else if (producer instanceof AsyncComputedSignalImpl) {
      clearAsyncComputedSignal(producer, effect);
    } else if (isPropsProxy(producer)) {
      const propsHandler = producer[_PROPS_HANDLER];
      clearStoreOrProps(propsHandler, effect);
    } else if (container.$storeProxyMap$.has(producer)) {
      const target = container.$storeProxyMap$.get(producer)!;
      const storeHandler = getStoreHandler(target)!;
      clearStoreOrProps(storeHandler, effect);
    }
  }
}

function clearSignal(container: Container, producer: SignalImpl, effect: EffectSubscription) {
  const effects = producer.$effects$;
  if (effects && effects.has(effect)) {
    effects.delete(effect);
  }

  if (producer instanceof WrappedSignalImpl) {
    producer.$hostElement$ = null;
    clearAllEffects(container, producer);
  }
}

function clearAsyncComputedSignal(
  producer: AsyncComputedSignalImpl<unknown>,
  effect: EffectSubscription
) {
  const effects = producer.$effects$;
  if (effects && effects.has(effect)) {
    effects.delete(effect);
  }
  const pendingEffects = producer.$loadingEffects$;
  if (pendingEffects && pendingEffects.has(effect)) {
    pendingEffects.delete(effect);
  }
}

function clearStoreOrProps(producer: StoreHandler | PropsProxyHandler, effect: EffectSubscription) {
  const effects = producer?.$effects$;
  if (effects) {
    for (const [propKey, propEffects] of effects.entries()) {
      if (propEffects.has(effect)) {
        propEffects.delete(effect);
        if (propEffects.size === 0) {
          effects.delete(propKey);
        }
      }
    }
  }
}
