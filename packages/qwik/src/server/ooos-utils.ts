import { _SubscriptionPatch as SubscriptionPatch } from '@qwik.dev/core/internal';
import type { EffectSubscription, ObjToProxyMap, SerializationContext } from './qwik-types';

export type SubscriptionPatchProp = string | symbol | null;

export interface SubscriptionPatchRecord {
  rootObj: unknown;
  rootId: number | undefined;
  effect: EffectSubscription;
  prop: SubscriptionPatchProp;
}

export type SubscriptionPatchRecords = SubscriptionPatchRecord[];

export const recordExternalRootEffect = (
  rootCtx: SerializationContext,
  segmentCtx: SerializationContext,
  storeProxyMap: ObjToProxyMap,
  records: SubscriptionPatchRecords | null,
  producer: unknown,
  effect: EffectSubscription,
  prop: SubscriptionPatchProp,
  sourceEffects?: Map<string | symbol, Set<EffectSubscription>>
): void => {
  if (!records || (prop !== null && !sourceEffects)) {
    return;
  }
  let rootObj = producer;
  if (
    prop !== null &&
    producer &&
    (typeof producer === 'object' || typeof producer === 'function')
  ) {
    rootObj = storeProxyMap.get(producer as object) || producer;
  }
  const rootId = rootCtx.$hasRootId$(rootObj);
  segmentCtx.$addRoot$(rootObj);
  segmentCtx.$addRoot$(effect);
  if (prop !== null && typeof prop !== 'string') {
    segmentCtx.$addRoot$(prop);
  }
  records.push({
    rootObj,
    rootId,
    effect,
    prop,
  });
};

export const collectSubscriptionPatches = (
  rootCtx: SerializationContext,
  records: SubscriptionPatchRecords | null,
  rootLimit: number
): SubscriptionPatch[] | undefined => {
  if (!records?.length) {
    return;
  }
  const patches: SubscriptionPatch[] = [];
  const patchesByRoot = new Map<number, SubscriptionPatch>();
  for (let i = 0; i < records.length; i++) {
    const entry = records[i];
    const rootId = entry.rootId === undefined ? rootCtx.$hasRootId$(entry.rootObj) : entry.rootId;
    if (rootId === undefined || rootId >= rootLimit) {
      continue;
    }
    let patch = patchesByRoot.get(rootId);
    if (!patch) {
      patch = new SubscriptionPatch(
        rootId,
        entry.prop === null ? new Set() : new Map<string | symbol, Set<EffectSubscription>>()
      );
      patchesByRoot.set(rootId, patch);
      patches.push(patch);
    }
    const subscriptions = patch.subscriptions;
    if (entry.prop === null) {
      if (subscriptions instanceof Set) {
        subscriptions.add(entry.effect);
      }
    } else {
      if (subscriptions instanceof Map) {
        let effects = subscriptions.get(entry.prop);
        if (!effects) {
          effects = new Set();
          subscriptions.set(entry.prop, effects);
        }
        effects.add(entry.effect);
      }
    }
  }
  return patches.length ? patches : undefined;
};
