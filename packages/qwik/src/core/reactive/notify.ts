import { resolveLazySubscribers } from './lazy-serialized';
import type { Source } from './source';
import { SubscriberKind, type PhaseSubscriber, type Subscriber } from '../runtime/subscriber';
import { notifyPhaseSubscriber } from '../runtime/scheduler';
import { markComputedDirty } from './computed';

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
    } else {
      notifyPhaseSubscriber(subscriber as PhaseSubscriber);
    }
  }
}
