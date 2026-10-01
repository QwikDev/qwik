import { cleanupDeps } from '../reactive/cleanup';
import { SuspenseContentSubscription } from '../dom/content/content';
import { findSuspenseBoundary } from '../dom/content/suspense-boundary';
import { OwnerFlags, SubscriberFlags } from '../reactive/flags';
import { logError } from '../shared/utils/log';
import { isPromise, maybeThen } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { getActiveInvokeContextOrNull } from './invoke-context';
import {
  getOrCreateContextOwner,
  Owner,
  ownerItemAt,
  ownerItemsLength,
  type OwnerItems,
  type PendingWork,
} from './owner';
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
  hasSnapshot?: boolean;
}

const NO_ERROR = Symbol();

type StructuralSubscriber = BranchSubscriber | ForBlockSubscriber | ContentSubscriber;

export class Scheduler {
  private readonly ownerQueue: Owner[] = [];
  private queueIndex = 0;
  /** Runs after the owner's DOM writes have committed. */
  private afterFlush: [() => void, Owner | null][] | null = null;
  private draining = false;
  private flushPending = false;
  private flushPromise: Promise<void> | null = null;
  private pendingPromises: Set<Promise<unknown>> | null = null;
  private pendingResume: Set<Promise<unknown>> | null = null;
  private resolveFlush: (() => void) | null = null;
  private rejectFlush: ((error: unknown) => void) | null = null;
  private error: unknown = NO_ERROR;

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
    const root = markOwnerDirty(owner, phase);
    if (root === null) {
      return;
    }
    if (root.items instanceof Owner || Array.isArray(root.items)) {
      this.removeQueuedDescendants(root);
    }
    root.flags |= OwnerFlags.Queued;
    this.ownerQueue.push(root);

    this.scheduleFlush();
  }

  onFlushed(callback: () => void): void {
    let owner = getOrCreateContextOwner(getActiveInvokeContextOrNull());
    while (owner !== null && !(owner.flags & OwnerFlags.Queued)) {
      owner = owner.parent;
    }
    if (owner === null && !this.draining && this.pendingPromises === null) {
      callback();
      return;
    }
    (this.afterFlush ??= []).push([callback, owner]);
  }

  waitFor(value: ValueOrPromise<unknown>, owner?: Owner | null): void {
    if (!isPromise(value)) {
      return;
    }
    let pendingValue = value;
    const scope =
      owner === undefined ? getOrCreateContextOwner(getActiveInvokeContextOrNull()) : owner;
    if (scope !== null && scope.flags & OwnerFlags.Disposed) {
      value.then(undefined, () => {});
      return;
    }
    if (scope !== null) {
      const work = (scope.pendingWork ??= new Map());
      if (work.has(value)) {
        return;
      }
      const original = value;
      const guarded = guardPendingWork(original);
      pendingValue = guarded.promise;
      work.set(original, guarded);
      scope.flags |= OwnerFlags.PendingWork;
      const finish = () => {
        work.delete(original);
        if (work.size === 0) {
          scope.pendingWork = undefined;
          scope.flags &= ~OwnerFlags.PendingWork;
        }
      };
      pendingValue.then(finish, finish);
    }
    const boundary = findSuspenseBoundary(scope);
    if (boundary instanceof SuspenseContentSubscription) {
      boundary.suspend(pendingValue);
      return;
    }
    const pending = (this.pendingPromises ??= new Set());
    if (pending.has(pendingValue)) {
      return;
    }
    pending.add(pendingValue);
    pendingValue.then(
      () => this.finishPromise(pendingValue),
      (error) => {
        this.error = error;
        this.finishPromise(pendingValue);
      }
    );
    this.scheduleFlush();
  }

  private finishPromise(value: Promise<unknown>): void {
    this.pendingPromises!.delete(value);
    if (this.pendingPromises!.size === 0) {
      this.pendingPromises = null;
    }
    if (this.flushPromise !== null) {
      this.drainInteraction();
    } else {
      this.scheduleFlush();
    }
  }

  waitForResume(value: Promise<unknown>): void {
    const pending = (this.pendingResume ??= new Set());
    if (pending.has(value)) {
      return;
    }
    pending.add(value);
    const finish = () => {
      pending.delete(value);
      if (pending.size === 0) {
        this.pendingResume = null;
      }
    };
    value.then(finish, finish);
    this.waitFor(value, null);
  }

  private scheduleFlush(): void {
    if (this.draining || this.flushPending) {
      return;
    }

    this.flushPending = true;
    this.scheduleInteraction(this.flushScheduled);
  }

  flushInteraction(): Promise<void> {
    if (this.flushPromise === null) {
      this.flushPromise = new Promise((resolve, reject) => {
        this.resolveFlush = resolve;
        this.rejectFlush = reject;
      });
    }
    const pending = this.flushPromise;
    this.drainInteraction();
    return pending;
  }

  private drainInteraction(): void {
    if (this.draining) {
      return;
    }
    this.flushPending = false;
    this.draining = true;
    try {
      while (this.queueIndex < this.ownerQueue.length) {
        const owner = this.ownerQueue[this.queueIndex++];
        if (owner.flags & OwnerFlags.Disposed) {
          owner.flags &= ~OwnerFlags.Queued;
          continue;
        }
        try {
          const pending = this.flushOwner(owner);
          if (isPromise(pending)) {
            const boundary = findSuspenseBoundary(owner);
            const finished = pending.then(
              () => {
                this.finishOwner(owner);
              },
              (error) => {
                this.finishOwner(owner);
                if (boundary instanceof SuspenseContentSubscription) {
                  throw error;
                }
                logError(error);
              }
            );
            if (boundary instanceof SuspenseContentSubscription) {
              // Blocking tasks retain content until DOM actually suspends.
              boundary.suspend(finished, false);
              finished.then(
                () => this.drainInteraction(),
                () => this.drainInteraction()
              );
            } else {
              this.waitFor(finished, null);
            }
            continue;
          }
        } catch (error) {
          logError(error);
        }
        this.finishOwner(owner);
      }
      this.ownerQueue.length = this.queueIndex = 0;
    } finally {
      this.draining = false;
    }
    const callbacks = this.afterFlush;
    this.afterFlush = null;
    if (callbacks !== null) {
      for (let i = 0; i < callbacks.length; i++) {
        const [callback, owner] = callbacks[i];
        if (owner === null ? this.pendingPromises !== null : owner.flags & OwnerFlags.Queued) {
          (this.afterFlush ??= []).push(callbacks[i]);
        } else if (owner === null || !(owner.flags & OwnerFlags.Disposed)) {
          callback();
        }
      }
    }
    if (this.pendingPromises !== null) {
      return;
    }
    const resolve = this.resolveFlush;
    const reject = this.rejectFlush;
    this.flushPromise = this.resolveFlush = this.rejectFlush = null;
    const error = this.error;
    this.error = NO_ERROR;
    if (error === NO_ERROR) {
      resolve?.();
    } else if (reject !== null) {
      reject(error);
    } else {
      logError(error);
    }
  }

  private finishOwner(owner: Owner): void {
    owner.flags &= ~OwnerFlags.Queued;
    if (owner.flags & OwnerFlags.Disposed || !(owner.flags & OwnerFlags.DirtyMask)) {
      return;
    }
    const root = markOwnerDirty(owner, OwnerFlags.None);
    if (root !== null) {
      root.flags |= OwnerFlags.Queued;
      this.ownerQueue.push(root);
    }
  }

  private waitForOwnerPhases(owner: Owner, pending: Promise<unknown>): Promise<void> {
    const work = guardPendingWork(pending);
    owner.pendingPhases = work;
    owner.flags |= OwnerFlags.WaitingForPhases;
    const finish = () => {
      owner.pendingPhases = undefined;
      owner.flags &= ~OwnerFlags.WaitingForPhases;
    };
    return work.promise.then(finish, (error) => {
      finish();
      throw error;
    });
  }

  private flushOwner(owner: Owner): ValueOrPromise<void> {
    const stack: OwnerFrame[] = [];
    const rendered: Owner[] = [];
    pushOwnerFrame(stack, owner);
    // Visible tasks see the whole subtree's DOM, not just their own owner's
    return maybeThen(this.drainOwnerStack(stack, rendered), () => {
      for (let i = 0; i < rendered.length; i++) {
        this.flushVisibleTasks(rendered[i]);
      }
    });
  }

  private drainOwnerStack(stack: OwnerFrame[], rendered: Owner[]): ValueOrPromise<void> {
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.items === null) {
        rendered.push(frame.owner);
        const active =
          frame.owner.flags & OwnerFlags.WaitingForPhases
            ? frame.owner.pendingPhases!.promise
            : undefined;
        let pending =
          active === undefined
            ? this.flushOwnerPhases(frame.owner)
            : active.then(() => {
                const next = this.flushOwnerPhases(frame.owner);
                return isPromise(next) ? this.waitForOwnerPhases(frame.owner, next) : next;
              });
        if (isPromise(pending)) {
          if (active === undefined) {
            pending = this.waitForOwnerPhases(frame.owner, pending);
          }
          snapshotOwnerStack(stack);
          return pending.then(() => {
            frame.items = frame.owner.items;
            frame.end = ownerItemsLength(frame.items);
            return this.drainOwnerStack(stack, rendered);
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
        if (
          item.flags &
          (OwnerFlags.DirtyMask | OwnerFlags.PendingWork | OwnerFlags.WaitingForPhases)
        ) {
          if (item.flags & OwnerFlags.PendingRoot) {
            if (!(item.flags & OwnerFlags.Queued)) {
              item.flags |= OwnerFlags.Queued;
              this.ownerQueue.push(item);
            }
          } else {
            pushOwnerFrame(stack, item);
          }
        }
      }
    }
  }

  // Phase order is blocking -> structural -> scalar -> deferred; visible follows the subtree.
  private flushOwnerPhases(owner: Owner): ValueOrPromise<void> {
    if (
      this.pendingResume !== null &&
      owner.flags & (OwnerFlags.DirtyBlockingTask | OwnerFlags.DirtyStructuralDom)
    ) {
      return Promise.all(this.pendingResume).then(() => this.flushOwnerPhases(owner));
    }
    if (owner.flags & OwnerFlags.PendingWork) {
      return Promise.all(Array.from(owner.pendingWork!.values(), (work) => work.promise)).then(() =>
        this.flushOwnerPhases(owner)
      );
    }
    return maybeThen(this.flushBlockingTasks(owner), () =>
      maybeThen(this.flushStructuralDom(owner), () =>
        maybeThen(this.flushScalarDom(owner), () => this.flushDeferredTasks(owner))
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
          this.suspendDomWork(subscriber.owner, result);
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
          this.suspendDomWork(owner, result);
          (pending ??= []).push(result);
        }
      }
    }
    return pending === null ? undefined : Promise.all(pending);
  }

  private suspendDomWork(owner: Owner | null, pending: Promise<unknown>): void {
    const boundary = findSuspenseBoundary(owner);
    if (boundary instanceof SuspenseContentSubscription) {
      boundary.suspend(pending);
    }
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
    for (let i = this.ownerQueue.length - 1; i >= this.queueIndex; i--) {
      const queuedOwner = this.ownerQueue[i];
      if (isOwnerDescendantOf(queuedOwner, owner)) {
        queuedOwner.flags &= ~OwnerFlags.Queued;
        this.ownerQueue.splice(i, 1);
      }
    }
  }
}

export const defaultScheduler = new Scheduler();

function guardPendingWork(pending: Promise<unknown>): PendingWork {
  let cancel!: () => void;
  const promise = new Promise((resolve, reject) => {
    cancel = () => resolve(undefined);
    pending.then(resolve, reject);
  });
  return { promise, cancel };
}

function markOwnerDirty(owner: Owner, phase: OwnerFlags): Owner | null {
  let current: Owner | null = owner;
  let queued = false;
  let root = owner;
  while (current !== null) {
    if (current.flags & OwnerFlags.Disposed) {
      return null;
    }
    current.flags |= phase;
    queued ||= !!(current.flags & OwnerFlags.Queued);
    if (current.flags & OwnerFlags.PendingRoot) {
      root = current;
      break;
    }
    if (current.renderParent !== undefined && current.renderParent !== current.parent) {
      break;
    }
    current = current.parent;
  }
  return queued ? null : root;
}

function pushOwnerFrame(stack: OwnerFrame[], owner: Owner): void {
  stack.push({
    owner,
    items: null,
    index: 0,
    end: 0,
  });
}

function snapshotOwnerStack(stack: OwnerFrame[]): void {
  // Disposal can shift ancestor cursors while this owner waits.
  for (let i = 0; i < stack.length - 1; i++) {
    const frame = stack[i];
    if (Array.isArray(frame.items) && !frame.hasSnapshot) {
      frame.items = frame.items.slice(frame.index, frame.end);
      frame.index = 0;
      frame.end = frame.items.length;
      frame.hasSnapshot = true;
    }
  }
}

function isOwnerDescendantOf(owner: Owner, maybeAncestor: Owner): boolean {
  let current: Owner | null = owner;
  while (current !== null) {
    if (current === maybeAncestor) {
      return true;
    }
    if (
      current.flags & OwnerFlags.PendingRoot ||
      (current.renderParent !== undefined && current.renderParent !== current.parent)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function scheduleMicrotask(flush: () => void): void {
  queueMicrotask(flush);
}
