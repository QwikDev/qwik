import { NEEDS_COMPUTATION, type EffectSubscription } from '../../reactive-primitives/types';
import { Brand, brandClass } from '../utils/brand';

/** @internal */
export class SubscriptionPatch {
  /** Value of a root computed that settled after the root state was serialized. */
  value: unknown = NEEDS_COMPUTATION;

  constructor(
    public rootId: number = 0,
    public subscriptions:
      | Set<EffectSubscription>
      | Map<string | symbol, Set<EffectSubscription>> = new Set(),
    /** Server-only: the root computed whose settled value the patch should carry. */
    public unsettledComputed?: unknown
  ) {}
}
brandClass(SubscriptionPatch, Brand.SubscriptionPatch);
