import type { EffectSubscription } from '../../reactive-primitives/types';
import { Brand, brandClass } from '../utils/brand';

export const enum SubscriptionPatchChannel {
  Pending = 'pending',
  Error = 'error',
}

/** @internal */
export class SubscriptionPatch {
  declare channel?: SubscriptionPatchChannel;
  /** Client-only: a root computed's settled value, or NEEDS_COMPUTATION. */
  declare value: unknown;

  constructor(
    public rootId: number = 0,
    public subscriptions:
      | Set<EffectSubscription>
      | Map<string | symbol, Set<EffectSubscription>> = new Set(),
    channel?: SubscriptionPatchChannel,
    /** Server-only: the root computed whose settled value the patch should carry. */
    public unsettledComputed?: unknown
  ) {
    if (__EXPERIMENTAL__.pendingBoundary && channel !== undefined) {
      this.channel = channel;
    }
  }
}
brandClass(SubscriptionPatch, Brand.SubscriptionPatch);
