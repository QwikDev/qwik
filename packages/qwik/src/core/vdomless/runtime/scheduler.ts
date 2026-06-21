import { isPromise } from '../../shared/utils/promises';
import { cleanupDeps } from '../reactive/cleanup';
import { OwnerFlags, SubscriberFlags } from '../reactive/flags';
import { Owner, type OwnerItem } from './owner';
import { SubscriberKind } from './subscriber';
import { runWithCollector } from '../reactive/tracking';
import type {
  BranchSubscriber,
  DomSubscriber,
  IdleSubscriber,
  PhaseSubscriber,
  SsrDomSubscriber,
  TaskSubscriber,
  VisibleTaskSubscriber,
} from './subscriber';

export const enum Phase {
  BlockingTask = 0,
  StructuralDom = 1,
  ScalarDom = 2,
  VisibleTask = 3,
  DeferredTask = 4,
  Idle = 5,
}

export type ScheduleFlush = (flush: () => void) => void;

interface OwnerFrame {
  owner: Owner;
  items: OwnerItem[] | null;
  index: number;
  end: number;
}

export class Scheduler {
  private readonly ownerQueue: Owner[] = [];
  private flushing = false;
  private flushPending = false;

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
        phase = OwnerFlags.DirtyScalarDom;
        break;
      case SubscriberKind.Branch:
        phase = OwnerFlags.DirtyStructuralDom;
        break;
      case SubscriberKind.Idle:
        phase = OwnerFlags.DirtyDeferredTask;
        break;
      default:
        return;
    }

    subscriber.flags |= SubscriberFlags.Dirty;
    markOwnerDirty(owner, phase);

    if (!(owner.flags & OwnerFlags.Queued)) {
      if (hasQueuedAncestor(owner)) {
        this.scheduleFlush();
        return;
      }
      this.removeQueuedDescendants(owner);
      owner.flags |= OwnerFlags.Queued;
      this.ownerQueue.push(owner);
    }

    this.scheduleFlush();
  }

  scheduleFlush(): void {
    if (this.flushing || this.flushPending) {
      return;
    }

    this.flushPending = true;
    this.scheduleInteraction(this.flushScheduled);
  }

  async flushInteraction(): Promise<void> {
    if (this.flushing) {
      return;
    }

    this.flushPending = false;
    this.flushing = true;

    try {
      while (this.ownerQueue.length > 0) {
        const owner = this.ownerQueue.shift()!;
        owner.flags &= ~OwnerFlags.Queued;

        if (owner.flags & OwnerFlags.Disposed) {
          continue;
        }

        await this.flushOwner(owner);
      }
    } finally {
      this.flushing = false;
      if (this.ownerQueue.length > 0) {
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
        await this.flushOwnerPhases(frame.owner);
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
    this.flushScalarDom(owner);
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
      if (!(item instanceof Owner) && item.kind === SubscriberKind.Branch && 'flags' in item) {
        await this.runBranch(item);
      }
    }
  }

  private flushScalarDom(owner: Owner): void {
    if (!(owner.flags & OwnerFlags.DirtyScalarDom)) {
      return;
    }

    owner.flags &= ~OwnerFlags.DirtyScalarDom;
    const items = owner.items;
    if (items === null) {
      return;
    }

    const end = items.length;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (!(item instanceof Owner) && item.kind === SubscriberKind.Dom && 'flags' in item) {
        this.runScalarDomEffect(item);
      }
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

    const end = items.length;
    for (let i = 0; i < end && i < items.length; i++) {
      const item = items[i];
      if (!(item instanceof Owner) && item.kind === SubscriberKind.VisibleTask) {
        void this.runTask(item);
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
      if (item.kind === SubscriberKind.Idle) {
        this.runIdleJob(item);
      } else if (item.kind === SubscriberKind.Task && item.task.phase === Phase.DeferredTask) {
        void this.runTask(item);
      }
    }
  }

  private async runTask(task: TaskSubscriber | VisibleTaskSubscriber): Promise<void> {
    if (task.owner === null || !(task.flags & SubscriberFlags.Dirty)) {
      return;
    }

    task.flags &= ~SubscriberFlags.Dirty;
    cleanupDeps(task);
    await runWithCollector(task, () => task.task.run());
  }

  private async runBranch(branch: BranchSubscriber): Promise<void> {
    if (branch.owner === null || !(branch.flags & SubscriberFlags.Dirty)) {
      return;
    }

    branch.flags &= ~SubscriberFlags.Dirty;
    cleanupDeps(branch);
    await branch.run();
  }

  private runScalarDomEffect(effect: DomSubscriber): void {
    if (effect.owner === null || !(effect.flags & SubscriberFlags.Dirty)) {
      return;
    }

    effect.flags &= ~SubscriberFlags.Dirty;
    cleanupDeps(effect);

    const value = runWithCollector(effect, () => effect.effect.run());
    if (isPromise(value)) {
      throw new Error('Scalar DOM effects must be synchronous');
    }
  }

  private runIdleJob(job: IdleSubscriber): void {
    if (job.owner === null || !(job.flags & SubscriberFlags.Dirty)) {
      return;
    }

    job.flags &= ~SubscriberFlags.Dirty;
    void job.job.run();
  }

  private readonly flushScheduled = (): void => {
    this.flushPending = false;
    void this.flushInteraction();
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

export function createScheduler(scheduleInteraction?: ScheduleFlush): Scheduler {
  return new Scheduler(scheduleInteraction);
}

export function notifyPhaseSubscriber(subscriber: PhaseSubscriber | SsrDomSubscriber): void {
  if (subscriber.kind === SubscriberKind.Dom && !('scheduler' in subscriber)) {
    return;
  }
  if (subscriber.kind === SubscriberKind.Branch && !('scheduler' in subscriber)) {
    return;
  }

  const container = (
    subscriber as {
      container?: { notify?: (subscriber: PhaseSubscriber) => void; scheduler?: Scheduler };
    }
  ).container;
  if (container?.notify) {
    container.notify(subscriber as PhaseSubscriber);
    return;
  }

  const scheduler =
    (subscriber as { scheduler?: Scheduler }).scheduler ?? container?.scheduler ?? defaultScheduler;
  scheduler.notify(subscriber as PhaseSubscriber);
}

export function scheduleFlush(): void {
  defaultScheduler.scheduleFlush();
}

function markOwnerDirty(owner: Owner, phase: OwnerFlags): void {
  let current: Owner | null = owner;
  while (current !== null) {
    if (current.flags & OwnerFlags.Disposed) {
      return;
    }
    current.flags |= phase;
    current = current.parent;
  }
}

function pushOwnerFrame(stack: OwnerFrame[], owner: Owner): void {
  stack.push({
    owner,
    items: null,
    index: 0,
    end: 0,
  });
}

function hasQueuedAncestor(owner: Owner): boolean {
  let current = owner.parent;
  while (current !== null) {
    if (current.flags & OwnerFlags.Disposed) {
      return false;
    }
    if (current.flags & OwnerFlags.Queued) {
      return true;
    }
    current = current.parent;
  }
  return false;
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
