import { swapRemove } from '../utils/array';
import { ComputedFlags, SubscriberFlags } from './flags';
import type { Source } from './source';
import type { Owner } from '../runtime/owner';
import { SubscriberKind, type Collector, type Subscriber } from '../runtime/subscriber';

export function cleanupDeps(collector: Collector): void {
  const deps = collector.deps;
  if (deps === null) {
    return;
  }

  for (let i = 0; i < deps.length; i++) {
    removeSubscriber(deps[i], collector as Subscriber);
  }

  collector.deps = null;
  collector.depVersions = null;
}

function removeSubscriber(source: Source, subscriber: Subscriber): void {
  const subs = source.subs;
  if (subs === null) {
    return;
  }

  if (swapRemove(subs, subscriber) && subs.length === 0) {
    source.subs = null;
  }
}

export function disposeSubscriber(subscriber: Subscriber): void {
  const owner = subscriber.owner;
  if (owner === null) {
    return;
  }

  detachSubscriberFromOwner(subscriber, owner);

  switch (subscriber.kind) {
    case SubscriberKind.Computed:
      subscriber.flags &= ComputedFlags.HasValue;
      cleanupDeps(subscriber);
      // Only computed is both a subscriber and a source, so it can retain
      // downstream subscribers after its upstream deps are cleaned.
      subscriber.subs = null;
      return;
    case SubscriberKind.Task:
    case SubscriberKind.VisibleTask:
    case SubscriberKind.Dom:
    case SubscriberKind.Branch:
      subscriber.flags = SubscriberFlags.None;
      cleanupDeps(subscriber);
      if (subscriber.kind === SubscriberKind.Branch) {
        subscriber.branch.dispose();
      }
      return;
    case SubscriberKind.Idle:
      subscriber.flags = SubscriberFlags.None;
      subscriber.job.dispose?.();
      return;
  }
}

export function disposeSubscribers(subscribers: readonly Subscriber[] | null | undefined): void {
  if (subscribers === null || subscribers === undefined) {
    return;
  }

  for (let i = 0; i < subscribers.length; i++) {
    disposeSubscriber(subscribers[i]);
  }
}

function detachSubscriberFromOwner(subscriber: Subscriber, owner: Owner): void {
  subscriber.owner = null;

  const items = owner.items;
  if (items === null) {
    return;
  }

  if (swapRemove(items, subscriber) && items.length === 0) {
    owner.items = null;
  }
}
