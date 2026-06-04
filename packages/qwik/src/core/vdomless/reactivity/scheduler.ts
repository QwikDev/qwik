import { isPromise } from '../../shared/utils/promises';
import { cleanupDeps } from './cleanup';
import { ReactiveFlags } from './flags';
import { SubscriberKind } from './subscriber';
import { runWithCollector } from './tracking';
import type {
  BranchSubscriber,
  DomSubscriber,
  IdleSubscriber,
  PhaseSubscriber,
  TaskSubscriber,
  VisibleTaskSubscriber,
} from './subscriber';

type StructuralSubscriber = DomSubscriber | BranchSubscriber;

export const enum Phase {
  BlockingTask = 0,
  StructuralDom = 1,
  ScalarDom = 2,
  VisibleTask = 3,
  DeferredTask = 4,
  Idle = 5,
}

export type ScheduleFlush = (flush: () => void) => void;

interface SchedulerJob<T extends PhaseSubscriber = PhaseSubscriber> {
  subscriber: T;
  epoch: number;
}

export class Scheduler {
  private readonly blockingTasks: SchedulerJob<TaskSubscriber>[] = [];
  private readonly structuralDom: SchedulerJob<StructuralSubscriber>[] = [];
  private readonly scalarDom: SchedulerJob<DomSubscriber>[] = [];
  private readonly visibleTasks: SchedulerJob<VisibleTaskSubscriber>[] = [];
  private readonly deferredTasks: SchedulerJob<TaskSubscriber>[] = [];
  private readonly idle: SchedulerJob<IdleSubscriber>[] = [];
  private flushing = false;
  private flushPending = false;
  private deferredPending = false;

  constructor(
    private readonly scheduleInteraction: ScheduleFlush = scheduleMicrotask,
    private readonly scheduleDeferred: ScheduleFlush = scheduleMacrotask
  ) {}

  notify(subscriber: PhaseSubscriber): void {
    if (subscriber.flags & ReactiveFlags.Disposed) {
      return;
    }

    this.enqueue(subscriber);
  }

  enqueueTask(task: TaskSubscriber): void {
    this.enqueue(task);
  }

  enqueueVisibleTask(task: VisibleTaskSubscriber): void {
    this.enqueue(task);
  }

  enqueueDomEffect(effect: DomSubscriber): void {
    this.enqueue(effect);
  }

  enqueueBranch(branch: BranchSubscriber): void {
    this.enqueue(branch);
  }

  enqueueIdleJob(job: IdleSubscriber): void {
    this.enqueue(job);
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
      await this.flushBlockingTasks();
      await this.flushStructuralDom();
      this.flushScalarDom();
      this.flushVisibleTasks();
      this.scheduleDeferredTasks();
    } finally {
      this.flushing = false;
    }
  }

  async flushDeferred(): Promise<void> {
    this.deferredPending = false;
    await this.flushDeferredTasks();
    this.flushIdle();
  }

  private enqueue(subscriber: PhaseSubscriber): void {
    subscriber.flags |= ReactiveFlags.Dirty;

    if (subscriber.flags & ReactiveFlags.Scheduled) {
      return;
    }

    subscriber.flags |= ReactiveFlags.Scheduled;
    subscriber.schedulerEpoch++;
    this.pushPhaseQueue(subscriber, subscriber.schedulerEpoch);

    if (
      (subscriber.kind === SubscriberKind.Task && subscriber.task.phase === Phase.DeferredTask) ||
      subscriber.kind === SubscriberKind.Idle
    ) {
      this.scheduleDeferredTasks();
    } else {
      this.scheduleFlush();
    }
  }

  private pushPhaseQueue(subscriber: PhaseSubscriber, epoch: number): void {
    switch (subscriber.kind) {
      case SubscriberKind.Task:
        if (subscriber.task.phase === Phase.BlockingTask) {
          pushSorted(this.blockingTasks, { subscriber, epoch }, compareTaskJob);
        } else {
          pushSorted(this.deferredTasks, { subscriber, epoch }, compareTaskJob);
        }
        return;
      case SubscriberKind.VisibleTask:
        this.visibleTasks.push({ subscriber, epoch });
        return;
      case SubscriberKind.Dom:
        if (subscriber.effect.phase === Phase.StructuralDom) {
          pushSorted(this.structuralDom, { subscriber, epoch }, compareStructuralJob);
        } else {
          pushSorted(this.scalarDom, { subscriber, epoch }, compareDomJob);
        }
        return;
      case SubscriberKind.Branch:
        pushSorted(this.structuralDom, { subscriber, epoch }, compareStructuralJob);
        return;
      case SubscriberKind.Idle:
        this.idle.push({ subscriber, epoch });
        return;
    }
  }

  private async flushBlockingTasks(): Promise<void> {
    while (true) {
      const job = popValid(this.blockingTasks);
      if (job === null) {
        return;
      }

      await this.runTask(job.subscriber);
    }
  }

  private async flushStructuralDom(): Promise<void> {
    while (true) {
      const job = popValid(this.structuralDom);
      if (job === null) {
        return;
      }

      await this.runStructuralSubscriber(job.subscriber);
    }
  }

  private flushScalarDom(): void {
    while (true) {
      const job = popValid(this.scalarDom);
      if (job === null) {
        return;
      }

      this.runScalarDomEffect(job.subscriber);
    }
  }

  private flushVisibleTasks(): void {
    while (true) {
      const job = popValid(this.visibleTasks);
      if (job === null) {
        return;
      }

      void this.runVisibleTask(job.subscriber);
    }
  }

  private scheduleDeferredTasks(): void {
    if (this.deferredPending) {
      return;
    }

    if (this.deferredTasks.length === 0 && this.idle.length === 0) {
      return;
    }

    this.deferredPending = true;
    this.scheduleDeferred(this.flushDeferredScheduled);
  }

  private async flushDeferredTasks(): Promise<void> {
    while (true) {
      const job = popValid(this.deferredTasks);
      if (job === null) {
        return;
      }

      await this.runTask(job.subscriber);
    }
  }

  private flushIdle(): void {
    while (true) {
      const job = popValid(this.idle);
      if (job === null) {
        return;
      }

      this.runIdleJob(job.subscriber);
    }
  }

  private async runTask(task: TaskSubscriber): Promise<void> {
    task.flags &= ~ReactiveFlags.Scheduled;

    if (!(task.flags & ReactiveFlags.Dirty)) {
      return;
    }

    task.flags &= ~ReactiveFlags.Dirty;
    cleanupDeps(task);
    await runWithCollector(task, runTaskRecord, task.task);
  }

  private async runVisibleTask(task: VisibleTaskSubscriber): Promise<void> {
    task.flags &= ~ReactiveFlags.Scheduled;

    if (!(task.flags & ReactiveFlags.Dirty)) {
      return;
    }

    task.flags &= ~ReactiveFlags.Dirty;
    cleanupDeps(task);
    await runWithCollector(task, runVisibleTaskRecord, task.task);
  }

  private async runDomEffect(effect: DomSubscriber): Promise<void> {
    effect.flags &= ~ReactiveFlags.Scheduled;
    effect.flags &= ~ReactiveFlags.Dirty;
    cleanupDeps(effect);
    await runWithCollector(effect, runDomEffectRecord, effect.effect);
  }

  private async runBranch(branch: BranchSubscriber): Promise<void> {
    branch.flags &= ~ReactiveFlags.Scheduled;
    branch.flags &= ~ReactiveFlags.Dirty;
    cleanupDeps(branch);
    await branch.run();
  }

  private async runStructuralSubscriber(subscriber: StructuralSubscriber): Promise<void> {
    if (subscriber.kind === SubscriberKind.Branch) {
      await this.runBranch(subscriber);
    } else {
      await this.runDomEffect(subscriber);
    }
  }

  private runScalarDomEffect(effect: DomSubscriber): void {
    effect.flags &= ~ReactiveFlags.Scheduled;
    effect.flags &= ~ReactiveFlags.Dirty;
    cleanupDeps(effect);

    const value = runWithCollector(effect, runDomEffectRecord, effect.effect);
    if (isPromise(value)) {
      throw new Error('Scalar DOM effects must be synchronous');
    }
  }

  private runIdleJob(job: IdleSubscriber): void {
    job.flags &= ~ReactiveFlags.Scheduled;
    job.flags &= ~ReactiveFlags.Dirty;
    void job.job.run();
  }

  private readonly flushScheduled = (): void => {
    this.flushPending = false;
    void this.flushInteraction();
  };

  private readonly flushDeferredScheduled = (): void => {
    void this.flushDeferred();
  };
}

export const defaultScheduler = new Scheduler();

export function createScheduler(
  scheduleInteraction?: ScheduleFlush,
  scheduleDeferred?: ScheduleFlush
): Scheduler {
  return new Scheduler(scheduleInteraction, scheduleDeferred);
}

export function notify(subscriber: PhaseSubscriber): void {
  defaultScheduler.notify(subscriber);
}

export function notifyPhaseSubscriber(this: PhaseSubscriber): void {
  defaultScheduler.notify(this);
}

export function enqueueTask(task: TaskSubscriber): void {
  defaultScheduler.enqueueTask(task);
}

export function enqueueVisibleTask(task: VisibleTaskSubscriber): void {
  defaultScheduler.enqueueVisibleTask(task);
}

export function enqueueDomEffect(effect: DomSubscriber): void {
  defaultScheduler.enqueueDomEffect(effect);
}

export function enqueueBranch(branch: BranchSubscriber): void {
  defaultScheduler.enqueueBranch(branch);
}

export function enqueueIdleJob(job: IdleSubscriber): void {
  defaultScheduler.enqueueIdleJob(job);
}

export function scheduleFlush(): void {
  defaultScheduler.scheduleFlush();
}

export function flushInteraction(): Promise<void> {
  return defaultScheduler.flushInteraction();
}

export function flush(): Promise<void> {
  return flushInteraction();
}

function pushSorted<T extends PhaseSubscriber>(
  queue: SchedulerJob<T>[],
  job: SchedulerJob<T>,
  compare: (a: SchedulerJob<T>, b: SchedulerJob<T>) => number
): void {
  let index = queue.length;
  while (index > 0 && compare(job, queue[index - 1]) < 0) {
    index--;
  }

  queue.splice(index, 0, job);
}

function popValid<T extends PhaseSubscriber>(queue: SchedulerJob<T>[]): SchedulerJob<T> | null {
  while (queue.length > 0) {
    const job = queue.shift()!;
    const subscriber = job.subscriber;

    if (subscriber.flags & ReactiveFlags.Disposed) {
      continue;
    }

    if (job.epoch !== subscriber.schedulerEpoch) {
      continue;
    }

    return job;
  }

  return null;
}

function compareTaskJob(a: SchedulerJob<TaskSubscriber>, b: SchedulerJob<TaskSubscriber>): number {
  const aTask = a.subscriber.task;
  const bTask = b.subscriber.task;
  const phase = aTask.phase - bTask.phase;
  if (phase !== 0) {
    return phase;
  }

  const groupPath = comparePath(aTask.group.path, bTask.group.path);
  if (groupPath !== 0) {
    return groupPath;
  }

  const index = aTask.index - bTask.index;
  if (index !== 0) {
    return index;
  }

  return 0;
}

function compareDomJob(a: SchedulerJob<DomSubscriber>, b: SchedulerJob<DomSubscriber>): number {
  const aEffect = a.subscriber.effect;
  const bEffect = b.subscriber.effect;
  const phase = aEffect.phase - bEffect.phase;
  if (phase !== 0) {
    return phase;
  }

  const order = aEffect.order - bEffect.order;
  if (order !== 0) {
    return order;
  }

  return 0;
}

function compareStructuralJob(
  a: SchedulerJob<StructuralSubscriber>,
  b: SchedulerJob<StructuralSubscriber>
): number {
  const order = getStructuralOrder(a.subscriber) - getStructuralOrder(b.subscriber);
  if (order !== 0) {
    return order;
  }

  return 0;
}

function getStructuralOrder(subscriber: StructuralSubscriber): number {
  return subscriber.kind === SubscriberKind.Branch
    ? subscriber.branch.order
    : subscriber.effect.order;
}

function comparePath(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = a[i] - b[i];
    if (diff !== 0) {
      return diff;
    }
  }

  return a.length - b.length;
}

function runTaskRecord(task: TaskSubscriber['task']): unknown {
  return task.run();
}

function runVisibleTaskRecord(task: VisibleTaskSubscriber['task']): unknown {
  return task.run();
}

function runDomEffectRecord(effect: DomSubscriber['effect']): unknown {
  return effect.run();
}

function scheduleMicrotask(flush: () => void): void {
  queueMicrotask(flush);
}

function scheduleMacrotask(flush: () => void): void {
  setTimeout(flush, 0);
}
