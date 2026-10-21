import { _SubscriptionPatch as SubscriptionPatch } from '@qwik.dev/core/internal';
import type {
  EffectSubscription,
  ObjToProxyMap,
  SerializationContext,
  SubscriptionPatchChannel,
} from './qwik-types';

export type SubscriptionPatchProp = string | symbol | null;

export interface SubscriptionPatchRecord {
  rootObj: unknown;
  effect: EffectSubscription;
  prop: SubscriptionPatchProp;
  channel?: SubscriptionPatchChannel;
}

export type SubscriptionPatchRecords = SubscriptionPatchRecord[];

export const recordExternalRootEffect = (
  segmentCtx: SerializationContext,
  storeProxyMap: ObjToProxyMap,
  records: SubscriptionPatchRecords,
  producer: unknown,
  effect: EffectSubscription,
  prop: SubscriptionPatchProp,
  channel?: SubscriptionPatchChannel
): void => {
  let rootObj = producer;
  if (prop !== null) {
    rootObj = storeProxyMap.get(producer) || producer;
  }
  segmentCtx.$addRoot$(rootObj);
  segmentCtx.$addRoot$(effect);
  if (prop !== null && typeof prop !== 'string') {
    segmentCtx.$addRoot$(prop);
  }
  records.push({
    rootObj,
    effect,
    prop,
    channel,
  });
};

export const collectSubscriptionPatches = (
  rootCtx: SerializationContext,
  records: SubscriptionPatchRecords,
  rootLimit: number,
  reusedRootIds?: Set<number>
): SubscriptionPatch[] | undefined => {
  if (!records.length) {
    return;
  }
  const patches: SubscriptionPatch[] = [];
  const patchesByChannel = new Map<
    SubscriptionPatchChannel | undefined,
    Map<number, SubscriptionPatch>
  >();
  for (let i = 0; i < records.length; i++) {
    const entry = records[i];
    const rootId = rootCtx.$hasRootId$(entry.rootObj);
    if (rootId === undefined || (rootId >= rootLimit && !reusedRootIds?.has(rootId))) {
      continue;
    }
    let roots = patchesByChannel.get(entry.channel);
    if (!roots) {
      roots = new Map();
      patchesByChannel.set(entry.channel, roots);
    }
    let patch = roots.get(rootId);
    if (!patch) {
      patch = new SubscriptionPatch(
        rootId,
        entry.prop === null ? new Set() : new Map<string | symbol, Set<EffectSubscription>>(),
        entry.channel
      );
      const clientRootId =
        rootId >= rootCtx.$rootStateRootCount$ && rootCtx.$hasRootStateForwardRefs$
          ? rootId + 1
          : rootId;
      patch.rootId = clientRootId;
      roots.set(rootId, patch);
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
