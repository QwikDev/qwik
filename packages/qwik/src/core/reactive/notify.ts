import { resolveLazySubscribers } from './lazy-serialized';
import type { Source } from './source';
import { ComputedFlags } from './flags';
import {
  SubscriberKind,
  type ComputedSubscriber,
  type PhaseSubscriber,
  type Subscriber,
} from '../runtime/subscriber';

export function notifySourceSubscribers(source: Source): void {
  if (resolveLazySubscribers(source, () => notifySourceSubscribers(source))) {
    return;
  }

  const subs = source.subs;
  if (subs === null) {
    return;
  }

  const snapshot = subs.slice() as Subscriber[];
  for (let i = 0; i < snapshot.length; i++) {
    const subscriber = snapshot[i];
    if (subscriber.kind === SubscriberKind.Computed) {
      markComputedDirty(subscriber);
    } else if ('scheduler' in subscriber) {
      subscriber.scheduler.notify(subscriber as PhaseSubscriber);
    }
  }
}

export function markComputedDirty(computed: ComputedSubscriber): void {
  if (computed.owner === null || computed.flags & ComputedFlags.Dirty) {
    return;
  }

  computed.flags |= ComputedFlags.Dirty;
  notifySourceSubscribers(computed);
}
