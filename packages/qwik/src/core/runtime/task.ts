import { isServer } from '@qwik.dev/core/build';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import { isServerPlatform } from '../shared/platform/platform';
import { isPromise, maybeThen } from '../shared/utils/promises';
import { qTest } from '../shared/utils/qdev';
import type { ValueOrPromise } from '../shared/utils/types';
import { SubscriberFlags } from '../reactive/flags';
import { registerSubscriberToOwner } from './owner';
import { defaultScheduler, Phase, type TaskScheduler } from './scheduler';
import { runTaskCleanups, runTaskSubscriber } from './run-task';
import { getActiveInvokeContext, getActiveInvokeContextOrNull } from './invoke-context';
import {
  SubscriberKind,
  type ScheduledSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import type { Source } from '../reactive/source';
import type { ContainerContext } from './container-context';
import type { RuntimeInvokeContext } from './invoke-context';
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
    readonly container?: ContainerContext,
    readonly invokeContext: RuntimeInvokeContext | null = null
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
    container?: ContainerContext,
    invokeContext: RuntimeInvokeContext | null = null
  ) {
    super(runFn, qrl, container, invokeContext);
  }
}

export class VisibleTask extends RunnableTaskRecord {}

abstract class ScheduledSubscription implements ScheduledSubscriber {
  abstract readonly kind: SubscriberKind;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
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

  run(): ValueOrPromise<void> {
    return runTaskSubscriber(this);
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

  run(): ValueOrPromise<void> {
    return runTaskSubscriber(this);
  }
}

export function useTask(run: TaskFn, options?: TaskOptions): TaskSubscriber {
  const invokeContext = getActiveInvokeContext();
  const container = invokeContext.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new TaskSubscription(
      new Task(
        run,
        options?.deferUpdates === false ? Phase.DeferredTask : Phase.BlockingTask,
        undefined,
        container,
        invokeContext
      ),
      scheduler
    )
  );
  if (qTest ? isServerPlatform() : isServer) {
    subscriber.scheduler.notify(subscriber);
    return subscriber;
  }
  subscriber.flags |= SubscriberFlags.Dirty;
  const result = maybeThen(invokeContext.initialTaskPromise, () => subscriber.run());
  if (isPromise(result)) {
    invokeContext.initialTaskPromise = result;
    void result.catch(() => {});
  }
  return subscriber;
}

export function useTaskQrl(qrl: TaskQrlRef, options?: TaskOptions): TaskSubscriber {
  const invokeContext = getActiveInvokeContextOrNull();
  const container = invokeContext?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new TaskSubscription(
      new Task(
        undefined,
        options?.deferUpdates === false ? Phase.DeferredTask : Phase.BlockingTask,
        qrl,
        container,
        invokeContext
      ),
      scheduler
    )
  );
  subscriber.scheduler.notify(subscriber);
  return subscriber;
}

/** @public */
export const useTask$ = implicit$FirstArg(useTaskQrl) as (
  task: TaskFn,
  options?: TaskOptions
) => void;

export function useVisibleTask(run: TaskFn, options?: VisibleTaskOptions): VisibleTaskSubscriber {
  const invokeContext = getActiveInvokeContextOrNull();
  const container = invokeContext?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new VisibleTaskSubscription(
      new VisibleTask(run, undefined, container, invokeContext),
      scheduler
    )
  );
  subscriber.scheduler.notify(subscriber);
  return subscriber;
}

export function useVisibleTaskQrl(
  qrl: TaskQrlRef,
  options?: VisibleTaskOptions
): VisibleTaskSubscriber {
  const invokeContext = getActiveInvokeContextOrNull();
  const container = invokeContext?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new VisibleTaskSubscription(
      new VisibleTask(undefined, qrl, container, invokeContext),
      scheduler
    )
  );
  subscriber.scheduler.notify(subscriber);
  return subscriber;
}

/** @public */
export const useVisibleTask$ = implicit$FirstArg(useVisibleTaskQrl) as (
  task: TaskFn,
  options?: VisibleTaskOptions
) => void;
