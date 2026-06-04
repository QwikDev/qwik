import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { ReactiveFlags } from '../reactive/flags';
import { registerSubscriberToOwner } from './owner';
import { defaultScheduler, Phase, type Scheduler } from './scheduler';
import {
  SubscriberKind,
  type PhaseSubscriber,
  type ScheduledSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import type { Dependency } from '../reactive/source';

export type TaskFn = () => unknown;
export type TaskQrlRef<T extends TaskFn = TaskFn> = QRLInternal<T>;
export type VisibleTaskStrategy = 'intersection-observer' | 'document-ready' | 'document-idle';

export interface TaskGroup {
  parent: TaskGroup | null;
  path: readonly number[];
}

export interface TaskOptions {
  deferUpdates?: boolean;
  group?: TaskGroup;
  index?: number;
  scheduler?: Scheduler;
  container?: Container;
}

export interface VisibleTaskOptions {
  strategy?: VisibleTaskStrategy;
  scheduler?: Scheduler;
  container?: Container;
}

export class Task {
  constructor(
    readonly runFn: TaskFn | undefined,
    readonly phase: Phase.BlockingTask | Phase.DeferredTask,
    readonly group: TaskGroup,
    readonly index: number,
    readonly qrl?: TaskQrlRef,
    readonly container?: Container
  ) {}

  run(): unknown {
    return runTaskBody(this.runFn, this.qrl, this.container);
  }
}

export class VisibleTask {
  constructor(
    readonly runFn: TaskFn | undefined,
    readonly strategy: VisibleTaskStrategy,
    readonly qrl?: TaskQrlRef,
    readonly container?: Container
  ) {}

  run(): unknown {
    return runTaskBody(this.runFn, this.qrl, this.container);
  }
}

abstract class ScheduledSubscription implements ScheduledSubscriber {
  abstract readonly kind: SubscriberKind;
  flags = ReactiveFlags.None;
  schedulerEpoch = 0;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly scheduler: Scheduler = defaultScheduler) {}

  notify(): void {
    this.scheduler.notify(this as unknown as PhaseSubscriber);
  }
}

export class TaskSubscription extends ScheduledSubscription implements TaskSubscriber {
  readonly kind = SubscriberKind.Task;

  constructor(
    readonly task: Task,
    scheduler: Scheduler = defaultScheduler
  ) {
    super(scheduler);
  }
}

export class VisibleTaskSubscription
  extends ScheduledSubscription
  implements VisibleTaskSubscriber
{
  readonly kind = SubscriberKind.VisibleTask;

  constructor(
    readonly task: VisibleTask,
    scheduler: Scheduler = defaultScheduler
  ) {
    super(scheduler);
  }
}

export function createTaskGroup(
  path: readonly number[],
  parent: TaskGroup | null = null
): TaskGroup {
  return {
    parent,
    path,
  };
}

export function createTask(run: TaskFn, options?: TaskOptions): TaskSubscriber {
  return registerSubscriberToOwner(
    new TaskSubscription(createTaskRecord(run, undefined, options), options?.scheduler)
  );
}

export function createTaskQrl(qrl: TaskQrlRef, options?: TaskOptions): TaskSubscriber {
  return registerSubscriberToOwner(
    new TaskSubscription(createTaskRecord(undefined, qrl, options), options?.scheduler)
  );
}

export function createVisibleTask(
  run: TaskFn,
  options?: VisibleTaskOptions
): VisibleTaskSubscriber {
  return registerSubscriberToOwner(
    new VisibleTaskSubscription(
      createVisibleTaskRecord(run, undefined, options),
      options?.scheduler
    )
  );
}

export function createVisibleTaskQrl(
  qrl: TaskQrlRef,
  options?: VisibleTaskOptions
): VisibleTaskSubscriber {
  return registerSubscriberToOwner(
    new VisibleTaskSubscription(
      createVisibleTaskRecord(undefined, qrl, options),
      options?.scheduler
    )
  );
}

function createTaskRecord(
  run: TaskFn | undefined,
  qrl: TaskQrlRef | undefined,
  options: TaskOptions | undefined
): Task {
  return new Task(
    run,
    options?.deferUpdates === true ? Phase.DeferredTask : Phase.BlockingTask,
    options?.group ?? createTaskGroup([0]),
    options?.index ?? 0,
    qrl,
    options?.container
  );
}

function createVisibleTaskRecord(
  run: TaskFn | undefined,
  qrl: TaskQrlRef | undefined,
  options: VisibleTaskOptions | undefined
): VisibleTask {
  return new VisibleTask(run, options?.strategy ?? 'document-ready', qrl, options?.container);
}

function runResolvedTask(run: TaskFn): unknown {
  return run();
}

function runTaskBody(
  run: TaskFn | undefined,
  qrl: TaskQrlRef | undefined,
  container: Container | undefined
): unknown {
  if (run !== undefined) {
    return run();
  }

  const taskQrl = qrl!;
  const resolved = taskQrl.resolved;
  if (resolved === undefined) {
    return taskQrl.resolve(container).then(runResolvedTask);
  }

  return resolved();
}
