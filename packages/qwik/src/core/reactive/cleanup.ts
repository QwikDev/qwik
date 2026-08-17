import { swapRemove } from '../utils/array';
import { ComputedFlags, SubscriberFlags } from './flags';
import type { Source } from './source';
import { detachSubscriberFromOwner } from '../runtime/owner';
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
}

function removeSubscriber(source: Source, subscriber: Subscriber): void {
  const subs = source.subs;
  if (subs === null) {
    return;
  }

  if (!Array.isArray(subs)) {
    if (subs === subscriber) {
      source.subs = null;
    }
    return;
  }

  if (!swapRemove(subs, subscriber)) {
    return;
  }
  if (subs.length === 0) {
    source.subs = null;
  } else if (subs.length === 1) {
    source.subs = subs[0];
  }
}

export function disposeSubscriber(subscriber: Subscriber): void {
  if (subscriber.flags & SubscriberFlags.Disposed) {
    return;
  }
  subscriber.flags |= SubscriberFlags.Disposed;

  const owner = subscriber.owner;
  if (owner !== null) {
    detachSubscriberFromOwner(subscriber, owner);
  }

  switch (subscriber.kind) {
    case SubscriberKind.Computed:
      (subscriber as { dispose?: () => void }).dispose?.();
      subscriber.flags &= ComputedFlags.HasValue | ComputedFlags.Disposed;
      cleanupDeps(subscriber);
      // Only computed is both a subscriber and a source, so it can retain
      // downstream subscribers after its upstream deps are cleaned.
      subscriber.subs = null;
      return;
    case SubscriberKind.Task:
    case SubscriberKind.VisibleTask:
    case SubscriberKind.Dom:
    case SubscriberKind.Branch:
    case SubscriberKind.ForBlock:
    case SubscriberKind.Content: {
      cleanupDeps(subscriber);
      if (subscriber.kind === SubscriberKind.Content) {
        subscriber.dispose();
        return;
      }
      if (subscriber.scheduler === null) {
        return;
      }
      const scheduled = subscriber;
      if (scheduled.kind === SubscriberKind.Dom) {
        scheduled.invalidate();
      }
      scheduled.flags = SubscriberFlags.Disposed;
      if (scheduled.kind === SubscriberKind.Task || scheduled.kind === SubscriberKind.VisibleTask) {
        scheduled.task.dispose();
      } else if (scheduled.kind === SubscriberKind.Branch) {
        scheduled.branch.dispose();
      } else if (scheduled.kind === SubscriberKind.ForBlock) {
        scheduled.block.dispose();
      }
      return;
    }
    case SubscriberKind.Idle:
      subscriber.flags = SubscriberFlags.Disposed;
      subscriber.job.dispose?.();
      return;
  }
}

export function disposeSubscribers(
  subscribers: Subscriber | readonly Subscriber[] | null | undefined
): void {
  if (subscribers === null || subscribers === undefined) {
    return;
  }

  if (!Array.isArray(subscribers)) {
    disposeSubscriber(subscribers as Subscriber);
    return;
  }

  for (let i = 0; i < subscribers.length; i++) {
    disposeSubscriber(subscribers[i]);
  }
}
