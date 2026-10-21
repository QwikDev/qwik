import type { EffectSubscription } from '../../reactive-primitives/types';
import { Brand, brandClass } from '../utils/brand';

export const enum SubscriptionPatchChannel {
  Pending = 'pending',
  Error = 'error',
}

/** @internal */
export class SubscriptionPatch {
  declare channel?: SubscriptionPatchChannel;

  constructor(
    public rootId: number = 0,
    public subscriptions:
      | Set<EffectSubscription>
      | Map<string | symbol, Set<EffectSubscription>> = new Set(),
    channel?: SubscriptionPatchChannel
  ) {
    if (channel !== undefined) {
      this.channel = channel;
    }
  }
}
brandClass(SubscriptionPatch, Brand.SubscriptionPatch);
