import { cleanupDeps } from '../reactive/cleanup';
import { OwnerFlags, SubscriberFlags } from '../reactive/flags';
import { logError } from '../shared/utils/log';
import { isPromise, maybeThen } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { Owner, ownerItemAt, ownerItemsLength, type OwnerItems } from './owner';
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
  items: OwnerItems;
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
      // Own it on queue; the flush that awaits it can be many turns away.
      value.catch(() => {});
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
          const pending = this.flushOwner(owner);
          if (isPromise(pending)) {
            await pending;
          }
        } catch (error) {
          // one failing owner must not starve the rest of the batch
          owner.flags &= ~OwnerFlags.Queued;
          logError(error);
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

  private flushOwner(owner: Owner): ValueOrPromise<void> {
    const stack: OwnerFrame[] = [];
    pushOwnerFrame(stack, owner);
    return this.drainOwnerStack(stack);
  }

  private drainOwnerStack(stack: OwnerFrame[]): ValueOrPromise<void> {
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.items === null) {
        const pending = this.flushOwnerPhases(frame.owner);
        if (isPromise(pending)) {
          // Snapshot items only once the phases have settled, exactly as the await did.
          return pending.then(() => {
            frame.items = frame.owner.items;
            frame.end = ownerItemsLength(frame.items);
            return this.drainOwnerStack(stack);
          });
        }
        frame.items = frame.owner.items;
        frame.end = ownerItemsLength(frame.items);
      }

      if (
        frame.items === null ||
        frame.index >= frame.end ||
        frame.index >= ownerItemsLength(frame.items)
      ) {
        stack.pop();
        continue;
      }

      const item = ownerItemAt(frame.items, frame.index++);
      if (item === undefined) {
        continue;
      }
      if (item instanceof Owner && !(item.flags & OwnerFlags.Disposed)) {
        if (item.flags & OwnerFlags.DirtyMask) {
          pushOwnerFrame(stack, item);
        }
      }
    }
  }

  // Phase order is blocking -> structural -> scalar -> visible -> deferred.
  private flushOwnerPhases(owner: Owner): ValueOrPromise<void> {
    return maybeThen(this.flushBlockingTasks(owner), () =>
      maybeThen(this.flushStructuralDom(owner), () =>
        maybeThen(this.flushScalarDom(owner), () => {
          this.flushVisibleTasks(owner);
          this.flushDeferredTasks(owner);
        })
      )
    );
  }

  private flushBlockingTasks(owner: Owner): ValueOrPromise<void> {
    if (!(owner.flags & OwnerFlags.DirtyBlockingTask)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyBlockingTask;
    const items = owner.items;
    if (items === null) {
      return;
    }

    return this.runBlockingTasksFrom(items, ownerItemsLength(items), 0);
  }

  /** Blocking tasks run strictly in order, so a suspending one resumes the rest. */
  private runBlockingTasksFrom(
    items: NonNullable<OwnerItems>,
    end: number,
    from: number
  ): ValueOrPromise<void> {
    for (let i = from; i < end && i < ownerItemsLength(items); i++) {
      const item = ownerItemAt(items, i)!;
      if (
        !(item instanceof Owner) &&
        item.kind === SubscriberKind.Task &&
        item.task.phase === Phase.BlockingTask
      ) {
        const result = item.run();
        if (isPromise(result)) {
          const next = i + 1;
          return result.then(() => this.runBlockingTasksFrom(items, end, next));
        }
      }
    }
  }

  private flushStructuralDom(owner: Owner): ValueOrPromise<void> {
    if (!(owner.flags & OwnerFlags.DirtyStructuralDom)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyStructuralDom;
    const items = owner.items;
    if (items === null) {
      return;
    }

    return this.runStructuralDomFrom(items, ownerItemsLength(items), 0);
  }

  /** Structural work runs in order too: a suspending branch holds back its siblings. */
  private runStructuralDomFrom(
    items: NonNullable<OwnerItems>,
    end: number,
    from: number
  ): ValueOrPromise<void> {
    for (let i = from; i < end && i < ownerItemsLength(items); i++) {
      const item = ownerItemAt(items, i)!;
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
        const result = subscriber.run();
        if (isPromise(result)) {
          const next = i + 1;
          return result.then(() => this.runStructuralDomFrom(items, end, next));
        }
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

    const end = ownerItemsLength(items);
    let pending: Promise<void>[] | null = null;
    for (let i = 0; i < end && i < ownerItemsLength(items); i++) {
      const item = ownerItemAt(items, i)!;
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

    const end = ownerItemsLength(items);
    for (let i = 0; i < end && i < ownerItemsLength(items); i++) {
      const item = ownerItemAt(items, i)!;
      if (!(item instanceof Owner) && item.kind === SubscriberKind.VisibleTask) {
        this.runDetached(item);
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

    const end = ownerItemsLength(items);
    for (let i = 0; i < end && i < ownerItemsLength(items); i++) {
      const item = ownerItemAt(items, i)!;
      if (item instanceof Owner) {
        continue;
      }
      if (item.kind === SubscriberKind.Idle && takeDirty(item)) {
        void item.job.run();
      } else if (item.kind === SubscriberKind.Task && item.task.phase === Phase.DeferredTask) {
        this.runDetached(item);
      }
    }
  }

  /** Fire-and-forget phases report failures rather than propagating them into the flush. */
  private runDetached(task: TaskSubscriber | VisibleTaskSubscriber): void {
    try {
      const result = task.run();
      if (isPromise(result)) {
        result.catch(logError);
      }
    } catch (error) {
      logError(error);
    }
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
