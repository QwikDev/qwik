import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { getStoreHandler } from '../reactive-primitives/impl/store';
import {
  EffectProperty,
  type EffectSubscription,
  type StoreTarget,
} from '../reactive-primitives/types';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { OnRenderProp } from '../shared/utils/markers';
import { isTask } from '../use/use-task';
import { requestPreload } from './bridge';

/** @internal */
export const preloadStoreEffects = (value: StoreTarget, prop: keyof StoreTarget): void => {
  const handler = getStoreHandler(value);
  const effects = handler?.$effects$?.get(prop);
  if (!effects?.size) {
    return;
  }
  const pending = [...effects];
  const seen = new Set<EffectSubscription>();
  for (let i = 0; i < pending.length; i++) {
    const effect = pending[i];
    if (seen.has(effect)) {
      continue;
    }
    seen.add(effect);
    const consumer = effect.consumer;
    let qrl: QRLInternal | null | undefined;
    if (consumer instanceof SignalImpl) {
      pending.push(...(consumer.$effects$ || []));
      if (consumer instanceof ComputedSignalImpl) {
        qrl = consumer.$computeQrl$;
        pending.push(...(consumer.$loadingEffects$ || []), ...(consumer.$errorEffects$ || []));
      }
    } else if (isTask(consumer)) {
      qrl = consumer.$qrl$;
    } else if (effect.property === EffectProperty.COMPONENT) {
      qrl = handler?.$container$?.getHostProp<QRLInternal>(consumer, OnRenderProp);
    }
    if (qrl?.$chunk$) {
      requestPreload(qrl.$chunk$, 1);
    }
  }
};
