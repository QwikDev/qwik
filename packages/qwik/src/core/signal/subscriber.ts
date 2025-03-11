import {
  type Consumer,
  EffectProperty,
  type EffectSubscription,
  EffectSubscriptionProp,
} from './signal';
import type { ISsrNode } from '../ssr/ssr-types';
import { _EFFECT_BACK_REF } from '../signal/flags';
import { isServer } from '@qwik.dev/core/build';
import { BackRef } from './signal-cleanup';
import { StaticPropId } from '../../server/qwik-copy';

export function getSubscriber(
  effect: Consumer,
  prop: EffectProperty | string,
  data?: unknown
): EffectSubscription {
  if (!(effect as BackRef)[_EFFECT_BACK_REF]) {
    if (isServer && isSsrNode(effect)) {
      effect.setProp(StaticPropId.BACK_REFS, new Map());
    } else {
      (effect as BackRef)[_EFFECT_BACK_REF] = new Map();
    }
  }
  const subMap = (effect as any)[_EFFECT_BACK_REF];
  let sub = subMap.get(prop);
  if (!sub) {
    sub = [effect, prop];
    subMap.set(prop, sub);
  }
  if (data) {
    sub[EffectSubscriptionProp.DATA] = data;
  }
  return sub;
}

function isSsrNode(value: any): value is ISsrNode {
  return '__brand__' in value && 'currentComponentNode' in value;
}
