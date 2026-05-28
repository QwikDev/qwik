import type { EffectSubscription } from '../../reactive-primitives/types';

/** @internal */
export class SubscriptionPatch {
  constructor(
    public rootId: number = 0,
    public subscriptions:
      | Set<EffectSubscription>
      | Map<string | symbol, Set<EffectSubscription>> = new Set()
  ) {}
}
