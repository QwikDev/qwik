import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import type { ValueOrPromise } from '../shared/utils/types';
import { SubscriberFlags } from '../reactive/flags';
import { registerSubscriberToOwner } from './owner';
import { defaultScheduler, notifyPhaseSubscriber, Phase, type TaskScheduler } from './scheduler';
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

/** @public */
export interface TaskCtx {
  cleanup(callback: TaskCleanupFn): void;
}

export type TaskResult = ValueOrPromise<unknown>;
/** @public */
export type TaskFn = (ctx: TaskCtx) => TaskResult;
export type TaskQrlRef<T extends TaskFn = TaskFn> = QRL<T>;

/** @public */
export interface TaskOptions {
  deferUpdates?: boolean;
}

/** @public */
export type VisibleTaskStrategy = 'intersection-observer' | 'document-ready' | 'document-idle';

/** @public */
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

  constructor(readonly scheduler: TaskScheduler = defaultScheduler) {}
}

export class TaskSubscription extends ScheduledSubscription implements TaskSubscriber {
  readonly kind = SubscriberKind.Task;

  constructor(
    readonly task: Task,
    scheduler: TaskScheduler = defaultScheduler
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
    scheduler: TaskScheduler = defaultScheduler
  ) {
    super(scheduler);
  }
}

export function useTask(run: TaskFn, options?: TaskOptions): TaskSubscriber {
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

export function useTaskQrl(qrl: TaskQrlRef, options?: TaskOptions): TaskSubscriber {
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

/** @public */
export const useTask$ = implicit$FirstArg(useTaskQrl) as (
  task: TaskFn,
  options?: TaskOptions
) => void;

export function useVisibleTask(run: TaskFn, options?: VisibleTaskOptions): VisibleTaskSubscriber {
  const container = getActiveInvokeContextOrNull()?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new VisibleTaskSubscription(new VisibleTask(run, undefined, container), scheduler)
  );
  notifyPhaseSubscriber(subscriber);
  return subscriber;
}

export function useVisibleTaskQrl(
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

/** @public */
export const useVisibleTask$ = implicit$FirstArg(useVisibleTaskQrl) as (
  task: TaskFn,
  options?: VisibleTaskOptions
) => void;
