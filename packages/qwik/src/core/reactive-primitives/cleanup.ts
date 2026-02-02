import { ensureMaterialized, vnode_isElementVNode, vnode_isVNode } from '../client/vnode-utils';
import type { Container } from '../shared/types';
import { SignalImpl } from './impl/signal-impl';
import { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import { StoreHandler, getStoreHandler } from './impl/store';
import { AsyncComputedSignalImpl } from './impl/async-computed-signal-impl';
import { _PROPS_HANDLER } from '../shared/utils/constants';
import { BackRef, _EFFECT_BACK_REF } from './backref';
import { type Consumer, type EffectSubscription } from './types';
import { isPropsProxy, type PropsProxyHandler } from '../shared/jsx/props-proxy';

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
  effects.clear();
}

export function clearEffectSubscription(container: Container, effect: EffectSubscription) {
  const backRefs = effect.backRef;
  if (!backRefs) {
    return;
  }
  for (const producer of backRefs) {
    // Check AsyncComputedSignalImpl before SignalImpl since it extends SignalImpl
    if (producer instanceof AsyncComputedSignalImpl) {
      clearAsyncComputedSignal(producer, effect);
    } else if (producer instanceof SignalImpl) {
      clearSignal(container, producer, effect);
    } else if (isPropsProxy(producer)) {
      const propsHandler = producer[_PROPS_HANDLER];
      clearStoreOrProps(propsHandler, effect);
    } else if (container.$storeProxyMap$.has(producer)) {
      const target = container.$storeProxyMap$.get(producer)!;
      const storeHandler = getStoreHandler(target)!;
      clearStoreOrProps(storeHandler, effect);
    }
  }
  backRefs.clear();
}

function clearSignal(container: Container, producer: SignalImpl, effect: EffectSubscription) {
  const effects = producer.$effects$;
  if (effects && effects.has(effect)) {
    effects.delete(effect);
  }

  if (producer instanceof WrappedSignalImpl && !effects?.size) {
    // Only clear if there are no more subscribers
    producer.$hostElement$ = undefined;
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
    for (const [prop, propEffects] of effects.entries()) {
      if (propEffects.has(effect)) {
        propEffects.delete(effect);
        if (propEffects.size === 0) {
          effects.delete(prop);
        }
      }
    }
  }
}
