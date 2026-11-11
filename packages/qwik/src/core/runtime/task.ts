import { Brand, brandClass } from '../shared/utils/brand';
import { isServer } from '@qwik.dev/core/build';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import { isServerPlatform } from '../shared/platform/platform';
import { isPromise, maybeThen } from '../shared/utils/promises';
import { qTest } from '../shared/utils/qdev';
import type { ValueOrPromise } from '../shared/utils/types';
import { SubscriberFlags } from '../reactive/flags';
import { registerSubscriberToOwner } from './owner';
import { defaultScheduler, Phase, type TaskScheduler, type Scheduler } from './scheduler';
import { runTaskSubscriber } from './run-task';
import { useOn, useOnDocument } from './use-on';
import { createVisibleTaskHandlerQrl, wakeVisibleTasks } from '../handlers';
import { getActiveInvokeContext, getActiveInvokeContextOrNull } from './invoke-context';
import {
  SubscriberKind,
  type ScheduledSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import type { Source } from '../reactive/source';
import type { RuntimeContainerContext } from './invoke-context';
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
  disposed = false;

  constructor(
    readonly runFn: TaskFn | undefined,
    readonly qrl?: TaskQrlRef,
    readonly container?: RuntimeContainerContext,
    readonly invokeContext: RuntimeInvokeContext | null = null
  ) {}

  get isCancelled(): boolean {
    return this.disposed;
  }
}

export class Task extends RunnableTaskRecord {
  constructor(
    runFn: TaskFn | undefined,
    readonly phase: Phase.BlockingTask | Phase.DeferredTask,
    qrl?: TaskQrlRef,
    container?: RuntimeContainerContext,
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
  /** The loader trigger fired once; later triggers never re-run the task. */
  triggered = false;

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
  return registerTask(run, undefined, options);
}

/** A client render runs the task during setup and holds the render on it, as the server does. */
function registerTask(
  run: TaskFn | undefined,
  qrl: TaskQrlRef | undefined,
  options: TaskOptions | undefined
): TaskSubscriber {
  const invokeContext = getActiveInvokeContextOrNull();
  const container = invokeContext?.container;
  const scheduler = container?.scheduler ?? defaultScheduler;
  const subscriber = registerSubscriberToOwner(
    new TaskSubscription(
      new Task(
        run,
        options?.deferUpdates === false ? Phase.DeferredTask : Phase.BlockingTask,
        qrl,
        container,
        invokeContext
      ),
      scheduler
    )
  );
  if (invokeContext === null || (qTest ? isServerPlatform() : isServer)) {
    subscriber.scheduler.notify(subscriber);
    return subscriber;
  }
  subscriber.flags |= SubscriberFlags.Dirty;
  const result = maybeThen(invokeContext.pendingSetup, () => subscriber.run());
  if (isPromise(result)) {
    invokeContext.pendingSetup = result;
    (scheduler as Scheduler).waitFor(result, subscriber.owner);
  }
  return subscriber;
}

/**
 * Holds back the calling component's render until the promise settles. The compiler treats the call
 * like a task: the render waits for the scheduler on the server and for the setup on the client.
 *
 * @internal
 */
export function _waitOn(promise: Promise<unknown>): void {
  const invokeContext = getActiveInvokeContext();
  const scheduler = invokeContext.container?.scheduler ?? defaultScheduler;
  if (qTest ? isServerPlatform() : isServer) {
    scheduler.waitOn(promise);
    return;
  }
  const previous = invokeContext.pendingSetup;
  const pending = (previous ? previous.then(() => promise) : promise).then(() => {});
  invokeContext.pendingSetup = pending;
  scheduler.waitOn(pending);
}

export function useTaskQrl(qrl: TaskQrlRef, options?: TaskOptions): TaskSubscriber {
  return registerTask(undefined, qrl, options);
}

/** @public */
export const useTask$ = implicit$FirstArg(useTaskQrl) as (
  task: TaskFn,
  options?: TaskOptions
) => void;

export function useVisibleTask(run: TaskFn, options?: VisibleTaskOptions): VisibleTaskSubscriber {
  return registerVisibleTask(run, undefined, options);
}

export function useVisibleTaskQrl(
  qrl: TaskQrlRef,
  options?: VisibleTaskOptions
): VisibleTaskSubscriber {
  return registerVisibleTask(undefined, qrl, options);
}

/**
 * The trigger decides when the initial run happens: the loader fires `qvisible` when the first
 * element intersects, `qinit`/`qidle` when the document is ready or idle. A client render already
 * has a ready document, so the document strategies run right away.
 */
function registerVisibleTask(
  run: TaskFn | undefined,
  qrl: TaskQrlRef | undefined,
  options: VisibleTaskOptions | undefined
): VisibleTaskSubscription {
  const invokeContext = getActiveInvokeContext();
  const container = invokeContext.container;
  const subscription = registerSubscriberToOwner(
    new VisibleTaskSubscription(
      new VisibleTask(run, qrl, container, invokeContext),
      container?.scheduler ?? defaultScheduler
    )
  );
  const strategy = options?.strategy ?? 'intersection-observer';
  const isServerRender = qTest ? isServerPlatform() : isServer;
  if (!isServerRender && strategy !== 'intersection-observer') {
    subscription.triggered = true;
    subscription.scheduler.notify(subscription);
    return subscription;
  }
  // The loader awaits one handler at a time, so a group starts all its tasks from one handler.
  const event =
    strategy === 'intersection-observer'
      ? 'qvisible'
      : strategy === 'document-ready'
        ? 'qinit'
        : 'qidle';
  const groups = (invokeContext.visibleTaskGroups ??= {});
  const group = groups[event];
  if (group !== undefined) {
    group.push(subscription);
    return subscription;
  }
  const started = (groups[event] = [subscription]);
  const handler = isServerRender
    ? createVisibleTaskHandlerQrl(started)
    : () => wakeVisibleTasks(started);
  if (event === 'qvisible') {
    useOn(event, handler);
  } else {
    useOnDocument(event, handler);
  }
  return subscription;
}

/** @public */
export const useVisibleTask$ = implicit$FirstArg(useVisibleTaskQrl) as (
  task: TaskFn,
  options?: VisibleTaskOptions
) => void;

isServer && brandClass(TaskSubscription, Brand.TaskSubscription);
isServer && brandClass(VisibleTaskSubscription, Brand.VisibleTaskSubscription);
