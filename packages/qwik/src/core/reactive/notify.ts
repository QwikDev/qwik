import { resolveLazySubscribers } from './lazy-serialized';
import type { Source } from './source';
import { ComputedFlags } from './flags';
import { SubscriberKind, type ComputedSubscriber, type Subscriber } from '../runtime/subscriber';

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
    switch (subscriber.kind) {
      case SubscriberKind.Computed:
        markComputedDirty(subscriber);
        break;
      case SubscriberKind.Task:
      case SubscriberKind.VisibleTask:
      case SubscriberKind.Dom:
      case SubscriberKind.Idle:
      case SubscriberKind.Branch:
      case SubscriberKind.ForBlock:
      case SubscriberKind.Content:
        if (subscriber.scheduler !== null) {
          subscriber.scheduler.notify(subscriber);
        }
        break;
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
