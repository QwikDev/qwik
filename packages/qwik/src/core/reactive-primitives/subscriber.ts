import { isServer } from '@qwik.dev/core/build';
import { QBackRefs } from '../shared/utils/markers';
import type { ISsrNode } from '../ssr/ssr-types';
import { Consumer, EffectProperty, EffectSubscription } from './types';
import { _EFFECT_BACK_REF, type BackRef } from './backref';
import type { SubscriptionData } from './subscription-data';

export function getSubscriber(
  effect: Consumer,
  prop: EffectProperty | string,
  data?: SubscriptionData
): EffectSubscription {
  if (!(effect as BackRef)[_EFFECT_BACK_REF]) {
    if (isServer && isSsrNode(effect)) {
      effect.setProp(QBackRefs, new Map());
    } else {
      (effect as BackRef)[_EFFECT_BACK_REF] = new Map();
    }
  }
  const subMap = (effect as any)[_EFFECT_BACK_REF];
  let sub: EffectSubscription = subMap.get(prop);
  if (!sub) {
    sub = new EffectSubscription(effect, prop);
    subMap.set(prop, sub);
  }
  if (data) {
    sub.data = data;
  }
  return sub;
}

export function isSsrNode(value: any): value is ISsrNode {
  return '__brand__' in value && value.__brand__ === 'SsrNode';
}
