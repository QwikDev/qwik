import { ReactiveFlags } from './flags';
import type { Source } from './source';
import { SubscriberKind, type Collector, type Subscriber } from './subscriber';

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

  const index = subs.indexOf(subscriber);
  if (index === -1) {
    return;
  }

  const lastIndex = subs.length - 1;
  subs[index] = subs[lastIndex];
  subs.pop();

  if (subs.length === 0) {
    source.subs = null;
  }
}

export function disposeSubscriber(subscriber: Subscriber): void {
  if (subscriber.flags & ReactiveFlags.Disposed) {
    return;
  }

  subscriber.flags |= ReactiveFlags.Disposed;

  switch (subscriber.kind) {
    case SubscriberKind.Computed:
    case SubscriberKind.Task:
    case SubscriberKind.VisibleTask:
    case SubscriberKind.Dom:
      cleanupDeps(subscriber);
      return;
    case SubscriberKind.Idle:
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
