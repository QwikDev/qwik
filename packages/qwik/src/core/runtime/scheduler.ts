import { cleanupDeps } from '../reactive/cleanup';
import { OwnerFlags, SubscriberFlags } from '../reactive/flags';
import { logError } from '../shared/utils/log';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { Owner, type OwnerItem } from './owner';
import { SubscriberKind, takeDirty } from './subscriber';
import type {
  BranchSubscriber,
  ContentSubscriber,
  DomSubscriber,
  ForBlockSubscriber,
  PhaseSubscriber,
  TaskSubscriber,
  VisibleTaskSubscriber,
} from './subscriber';

export const enum Phase {
  BlockingTask = 0,
  // Serialization marker only; visible tasks flush by subscriber kind.
  VisibleTask = 1,
  DeferredTask = 4,
}

export type ScheduleFlush = (flush: () => void) => void;

export interface TaskScheduler {
  notify(subscriber: PhaseSubscriber): void;
}

interface OwnerFrame {
  owner: Owner;
  items: OwnerItem[] | null;
  index: number;
  end: number;
}

type StructuralSubscriber = BranchSubscriber | ForBlockSubscriber | ContentSubscriber;

export class Scheduler {
  private readonly ownerQueue: Owner[] = [];
  private flushing = false;
  private flushPending = false;
  private flushPromise: Promise<void> | null = null;
  private pendingPromises: Promise<unknown>[] | null = null;

  constructor(private readonly scheduleInteraction: ScheduleFlush = scheduleMicrotask) {}

  notify(subscriber: PhaseSubscriber): void {
    const owner = subscriber.owner;
    if (owner === null || owner.flags & OwnerFlags.Disposed) {
      return;
    }

    let phase: OwnerFlags;
    switch (subscriber.kind) {
      case SubscriberKind.Task:
        phase =
          subscriber.task.phase === Phase.BlockingTask
            ? OwnerFlags.DirtyBlockingTask
            : OwnerFlags.DirtyDeferredTask;
        break;
      case SubscriberKind.VisibleTask:
        phase = OwnerFlags.DirtyVisibleTask;
        break;
      case SubscriberKind.Dom:
        (subscriber as DomSubscriber).invalidate();
        phase = OwnerFlags.DirtyScalarDom;
        break;
      case SubscriberKind.Branch:
      case SubscriberKind.ForBlock:
      case SubscriberKind.Content:
        phase = OwnerFlags.DirtyStructuralDom;
        break;
      case SubscriberKind.Idle:
        phase = OwnerFlags.DirtyDeferredTask;
        break;
      default:
        return;
    }

    subscriber.flags |= SubscriberFlags.Dirty;
    const queued = markOwnerDirty(owner, phase);

    if (!(owner.flags & OwnerFlags.Queued)) {
      if (queued) {
        return;
      }
      this.removeQueuedDescendants(owner);
      owner.flags |= OwnerFlags.Queued;
      this.ownerQueue.push(owner);
    }

    this.scheduleFlush();
  }

  waitFor(value: ValueOrPromise<unknown>): void {
    if (isPromise(value)) {
      (this.pendingPromises ??= []).push(value);
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushing || this.flushPending) {
      return;
    }

    this.flushPending = true;
    this.scheduleInteraction(this.flushScheduled);
  }

  flushInteraction(): Promise<void> {
    if (this.flushPromise !== null) {
      return this.flushPromise;
    }

    return (this.flushPromise = this.runInteraction().finally(() => {
      this.flushPromise = null;
    }));
  }

  private async runInteraction(): Promise<void> {
    this.flushPending = false;
    this.flushing = true;

    try {
      while (this.pendingPromises !== null || this.ownerQueue.length > 0) {
        if (this.pendingPromises !== null) {
          const pending = this.pendingPromises!;
          this.pendingPromises = null;
          await Promise.all(pending);
          continue;
        }
        const owner = this.ownerQueue.shift()!;

        if (owner.flags & OwnerFlags.Disposed) {
          owner.flags &= ~OwnerFlags.Queued;
          continue;
        }

        try {
          await this.flushOwner(owner);
        } catch (error) {
          owner.flags &= ~OwnerFlags.Queued;
          throw error;
        }
        owner.flags &= ~OwnerFlags.Queued;
        if (owner.flags & OwnerFlags.DirtyMask) {
          owner.flags |= OwnerFlags.Queued;
          this.ownerQueue.push(owner);
        }
      }
    } finally {
      this.flushing = false;
      if (this.pendingPromises !== null || this.ownerQueue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private async flushOwner(owner: Owner): Promise<void> {
    const stack: OwnerFrame[] = [];
    pushOwnerFrame(stack, owner);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.items === null) {
        if ((frame.owner.flags & OwnerFlags.DirtyMask) === OwnerFlags.DirtyScalarDom) {
          const pending = this.flushScalarDom(frame.owner);
          if (isPromise(pending)) {
            await pending;
          }
        } else {
          await this.flushOwnerPhases(frame.owner);
        }
        frame.items = frame.owner.items;
        frame.end = frame.items?.length ?? 0;
      }

      if (frame.items === null || frame.index >= frame.end || frame.index >= frame.items.length) {
        stack.pop();
        continue;
      }

      const item = frame.items[frame.index++];
      if (item instanceof Owner && !(item.flags & OwnerFlags.Disposed)) {
        if (item.flags & OwnerFlags.DirtyMask) {
          pushOwnerFrame(stack, item);
        }
      }
    }
  }

  private async flushOwnerPhases(owner: Owner): Promise<void> {
    await this.flushBlockingTasks(owner);
    await this.flushStructuralDom(owner);
    await this.flushScalarDom(owner);
    this.flushVisibleTasks(owner);
    this.flushDeferredTasks(owner);
  }

  private async flushBlockingTasks(owner: Owner): Promise<void> {
    if (!(owner.flags & OwnerFlags.DirtyBlockingTask)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyBlockingTask;
    const items = owner.items;
    if (items === null) {
      return;
    }

    const end = items.length;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (
        !(item instanceof Owner) &&
        item.kind === SubscriberKind.Task &&
        item.task.phase === Phase.BlockingTask
      ) {
        await this.runTask(item);
      }
    }
  }

  private async flushStructuralDom(owner: Owner): Promise<void> {
    if (!(owner.flags & OwnerFlags.DirtyStructuralDom)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyStructuralDom;
    const items = owner.items;
    if (items === null) {
      return;
    }

    const end = items.length;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (
        item instanceof Owner ||
        (item.kind !== SubscriberKind.Branch &&
          item.kind !== SubscriberKind.ForBlock &&
          item.kind !== SubscriberKind.Content)
      ) {
        continue;
      }
      const subscriber = item as StructuralSubscriber;
      if (takeDirty(subscriber)) {
        cleanupDeps(subscriber);
        await subscriber.run();
      }
    }
  }

  private flushScalarDom(owner: Owner): ValueOrPromise<unknown> {
    if (!(owner.flags & OwnerFlags.DirtyScalarDom)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyScalarDom;
    const items = owner.items;
    if (items === null) {
      return;
    }

    const end = items.length;
    let pending: Promise<void>[] | null = null;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (!(item instanceof Owner) && item.kind === SubscriberKind.Dom) {
        const effect = item as DomSubscriber;
        if (!takeDirty(effect)) {
          continue;
        }
        const result = effect.run();
        if (isPromise(result)) {
          (pending ??= []).push(result);
        }
      }
    }
    return pending === null ? undefined : Promise.all(pending);
  }

  private flushVisibleTasks(owner: Owner): void {
    if (!(owner.flags & OwnerFlags.DirtyVisibleTask)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyVisibleTask;
    const items = owner.items;
    if (items === null) {
      return;
    }

    const end = items.length;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (!(item instanceof Owner) && item.kind === SubscriberKind.VisibleTask) {
        this.runTask(item).catch(logError);
      }
    }
  }

  private flushDeferredTasks(owner: Owner): void {
    if (!(owner.flags & OwnerFlags.DirtyDeferredTask)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyDeferredTask;
    const items = owner.items;
    if (items === null) {
      return;
    }

    const end = items.length;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (item instanceof Owner) {
        continue;
      }
      if (item.kind === SubscriberKind.Idle && takeDirty(item)) {
        void item.job.run();
      } else if (item.kind === SubscriberKind.Task && item.task.phase === Phase.DeferredTask) {
        this.runTask(item).catch(logError);
      }
    }
  }

  private async runTask(task: TaskSubscriber | VisibleTaskSubscriber): Promise<void> {
    await task.run();
  }

  private readonly flushScheduled = (): void => {
    this.flushPending = false;
    this.flushInteraction().catch(logError);
  };

  private removeQueuedDescendants(owner: Owner): void {
    for (let i = this.ownerQueue.length - 1; i >= 0; i--) {
      const queuedOwner = this.ownerQueue[i];
      if (isOwnerDescendantOf(queuedOwner, owner)) {
        queuedOwner.flags &= ~OwnerFlags.Queued;
        this.ownerQueue.splice(i, 1);
      }
    }
  }
}

export const defaultScheduler = new Scheduler();

function markOwnerDirty(owner: Owner, phase: OwnerFlags): boolean {
  let current: Owner | null = owner;
  let queued = false;
  while (current !== null) {
    if (current.flags & OwnerFlags.Disposed) {
      return true;
    }
    current.flags |= phase;
    queued ||= !!(current.flags & OwnerFlags.Queued);
    current = current.parent;
  }
  return queued;
}

function pushOwnerFrame(stack: OwnerFrame[], owner: Owner): void {
  stack.push({
    owner,
    items: null,
    index: 0,
    end: 0,
  });
}

function isOwnerDescendantOf(owner: Owner, maybeAncestor: Owner): boolean {
  let current = owner.parent;
  while (current !== null) {
    if (current === maybeAncestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function scheduleMicrotask(flush: () => void): void {
  queueMicrotask(flush);
}
