import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import type { QRL } from '../../shared/qrl/qrl.public';
import type { ValueOrPromise } from '../../shared/utils/types';
import { SubscriberFlags } from '../reactive/flags';
import { registerSubscriberToOwner } from './owner';
import { defaultScheduler, notifyPhaseSubscriber, Phase, type Scheduler } from './scheduler';
import { runTaskCleanups } from './run-task';
import { getActiveInvokeContextOrNull } from './invoke-context';
import {
  SubscriberKind,
  type ScheduledSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import type { Source } from '../reactive/source';
import type { ContainerContext } from './container-context';
import type { Owner } from './owner';

export type TaskCleanupFn = () => ValueOrPromise<void>;

export interface TaskCtx {
  cleanup(callback: TaskCleanupFn): void;
}

export type TaskResult = ValueOrPromise<unknown> | Generator<unknown, unknown, unknown>;
export type TaskFn = (ctx: TaskCtx) => TaskResult;
export type TaskQrlRef<T extends TaskFn = TaskFn> = QRL<T>;

export interface TaskOptions {
  deferUpdates?: boolean;
}

export type VisibleTaskStrategy = 'intersection-observer' | 'document-ready' | 'document-idle';

export interface VisibleTaskOptions {
  strategy?: VisibleTaskStrategy;
}

abstract class RunnableTaskRecord {
  cleanups: TaskCleanupFn[] | null = null;
  cleanupPromise: Promise<void> | null = null;

  constructor(
    readonly runFn: TaskFn | undefined,
    readonly qrl?: TaskQrlRef,
    readonly container?: ContainerContext
  ) {}

  dispose(): ValueOrPromise<void> {
    return runTaskCleanups(this);
  }
}

export class Task extends RunnableTaskRecord {
  constructor(
    runFn: TaskFn | undefined,
    readonly phase: Phase.BlockingTask | Phase.DeferredTask,
    qrl?: TaskQrlRef,
    container?: ContainerContext
  ) {
    super(runFn, qrl, container);
  }
}

export class VisibleTask extends RunnableTaskRecord {}

abstract class ScheduledSubscription implements ScheduledSubscriber {
  abstract readonly kind: SubscriberKind;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;
  runPromise: Promise<void> | null = null;

  constructor(readonly scheduler: Scheduler = defaultScheduler) {}
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

export function createTask(run: TaskFn, options?: TaskOptions): TaskSubscriber {
  const container = getActiveInvokeContextOrNull()?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new TaskSubscription(
      new Task(
        run,
        options?.deferUpdates === false ? Phase.DeferredTask : Phase.BlockingTask,
        undefined,
        container
      ),
      scheduler
    )
  );
  notifyPhaseSubscriber(subscriber);
  return subscriber;
}

export function createTaskQrl(qrl: TaskQrlRef, options?: TaskOptions): TaskSubscriber {
  const container = getActiveInvokeContextOrNull()?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new TaskSubscription(
      new Task(
        undefined,
        options?.deferUpdates === false ? Phase.DeferredTask : Phase.BlockingTask,
        qrl,
        container
      ),
      scheduler
    )
  );
  notifyPhaseSubscriber(subscriber);
  return subscriber;
}

export const createTask$ = implicit$FirstArg(createTaskQrl);

export function createVisibleTask(
  run: TaskFn,
  options?: VisibleTaskOptions
): VisibleTaskSubscriber {
  const container = getActiveInvokeContextOrNull()?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new VisibleTaskSubscription(new VisibleTask(run, undefined, container), scheduler)
  );
  notifyPhaseSubscriber(subscriber);
  return subscriber;
}

export function createVisibleTaskQrl(
  qrl: TaskQrlRef,
  options?: VisibleTaskOptions
): VisibleTaskSubscriber {
  const container = getActiveInvokeContextOrNull()?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new VisibleTaskSubscription(new VisibleTask(undefined, qrl, container), scheduler)
  );
  notifyPhaseSubscriber(subscriber);
  return subscriber;
}

export const createVisibleTask$ = implicit$FirstArg(createVisibleTaskQrl);
