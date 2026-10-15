import type { ContainerContext } from '../runtime/container-context';
import { isPromise } from '../shared/utils/promises';
import { runTaskCleanups } from '../runtime/run-task';
import { removeInOrder } from '../utils/array';
import { getActiveCollector } from './tracking';
import { ComputedFlags, SubscriberFlags } from './flags';
import type { Source } from './source';
import type { ValueOrPromise } from '../shared/utils/types';
import { detachSubscriberFromOwner, getLiveOwner } from '../runtime/owner';
import { SubscriberKind, type Collector, type Subscriber } from '../runtime/subscriber';
import { handleError } from '../dom/content/catch-boundary';
import { isServerPlatform } from '../shared/platform/platform';

export function runLateCleanup(callback: () => unknown): void {
  const result = callback();
  if (isPromise(result)) {
    result.catch(() => {});
  }
}

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

/** A collector never depends on a source it writes: a read-modify-write is not a read. */
export function dropWriterDependency(source: Source): void {
  const writer = getActiveCollector();
  if (writer !== null && writer.deps !== null && removeInOrder(writer.deps, source)) {
    removeSubscriber(source, writer as Subscriber);
  }
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

  // Keeps notification order equal to subscription order
  if (!removeInOrder(subs, subscriber)) {
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
  try {
    switch (subscriber.kind) {
      case SubscriberKind.Computed:
        subscriber.flags &= ComputedFlags.HasValue | ComputedFlags.Disposed;
        subscriber.dispose();
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
        if (
          scheduled.kind === SubscriberKind.Task ||
          scheduled.kind === SubscriberKind.VisibleTask
        ) {
          scheduled.runPromise = null;
          scheduled.task.disposed = true;
          runSubscriberCleanups(scheduled);
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
  } finally {
    if (owner !== null) {
      detachSubscriberFromOwner(subscriber, owner);
    }
  }
}

/** Runs the user cleanups a subscriber registered, without disposing it. */
export function runSubscriberCleanups(subscriber: Subscriber): ValueOrPromise<void> {
  switch (subscriber.kind) {
    case SubscriberKind.Computed:
      return (
        subscriber as unknown as { runUserCleanups(): ValueOrPromise<void> }
      ).runUserCleanups();
    case SubscriberKind.Task:
    case SubscriberKind.VisibleTask: {
      const owner = getLiveOwner(subscriber.owner);
      let result: ValueOrPromise<void>;
      try {
        result = runTaskCleanups(subscriber.task);
      } catch (error) {
        return handleError(owner, error);
      }
      if (isPromise(result)) {
        const pending = result.catch((error) => handleError(owner, error));
        if (subscriber.flags & SubscriberFlags.Disposed && !isServerPlatform()) {
          (subscriber.task.container as ContainerContext | undefined)?.scheduler.waitFor(
            pending,
            owner
          );
        }
        return pending;
      }
    }
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
