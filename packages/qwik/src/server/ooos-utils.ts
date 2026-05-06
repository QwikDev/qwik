import { EffectSubscription } from './qwik-types';

export type ExternalRootEffectProp = string | symbol | null;

export interface ExternalRootEffectEntry {
  producer: unknown;
  effect: EffectSubscription;
  prop: ExternalRootEffectProp;
  sourceEffects?: Map<string | symbol, Set<EffectSubscription>>;
}

export type ExternalRootEffects = ExternalRootEffectEntry[];

export type ExternalRootEffectsPatch = Array<
  [number, EffectSubscription[] | Array<[string | symbol, EffectSubscription[]]>]
>;

export const addExternalRootEffectEntry = <K>(
  records: Map<K, ExternalRootEffects> | null,
  key: K,
  entry: ExternalRootEffectEntry
): void => {
  if (!records || (entry.prop !== null && !entry.sourceEffects)) {
    return;
  }
  const entries = records.get(key) || [];
  entries.push(entry);
  records.set(key, entries);
};

export const createExternalRootEffectEntry = (
  producer: unknown,
  effect: EffectSubscription,
  prop: ExternalRootEffectProp,
  sourceEffects?: Map<string | symbol, Set<EffectSubscription>>
): ExternalRootEffectEntry => {
  return {
    producer,
    effect,
    prop,
    sourceEffects,
  };
};

export const collectExternalRootEffectsPatch = (entries: ExternalRootEffects) => {
  let signalEffects: Set<EffectSubscription> | undefined;
  let storeEffects: Map<string | symbol, Set<EffectSubscription>> | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.prop === null) {
      (signalEffects ||= new Set()).add(entry.effect);
    } else {
      let effects = (storeEffects ||= new Map()).get(entry.prop);
      if (!effects) {
        storeEffects.set(entry.prop, (effects = new Set<EffectSubscription>()));
      }
      effects.add(entry.effect);
    }
  }

  return storeEffects || signalEffects;
};
