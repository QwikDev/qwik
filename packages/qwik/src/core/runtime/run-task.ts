import { cleanupDeps, runLateCleanup } from '../reactive/cleanup';
import { SubscriberFlags } from '../reactive/flags';
import { runWithCollector } from '../reactive/tracking';
import { invoke, newInvokeContext } from './invoke-context';
import { invokeCaptured } from '../shared/qrl/qrl-captures';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { getFunctionOrResolve } from '../utils/qrl';
import { isPromise, thenInLifetime, retryInLifetime } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { Task, TaskCleanupFn, TaskFn, VisibleTask } from './task';
import { takeDirty, type TaskSubscriber, type VisibleTaskSubscriber } from './subscriber';
import { isSubscriberDisposed } from './subscriber';
import { handleError } from '../dom/content/catch-boundary';

export function runTaskSubscriber(
  subscriber: TaskSubscriber | VisibleTaskSubscriber
): ValueOrPromise<void> {
  if (isSubscriberDisposed(subscriber)) {
    return;
  }
  if (subscriber.runPromise !== null) {
    return subscriber.runPromise;
  }

  if (!takeDirty(subscriber)) {
    return;
  }

  const task = subscriber.task;
  // a resumed task carries no creation context, so its container makes a minimal one
  const invokeContext =
    task.invokeContext ??
    (task.container === undefined ? null : newInvokeContext({ container: task.container }));
  let result: ValueOrPromise<void>;
  try {
    result = thenInLifetime(task, runTaskCleanups(task), () => {
      cleanupDeps(subscriber);
      return thenInLifetime(
        task,
        task.runFn ?? getFunctionOrResolve(task.qrl!, task.container, false),
        (run) => {
          const qrl = task.runFn === undefined ? (task.qrl as QRLInternal<TaskFn>) : undefined;
          const captures =
            qrl?.resolved === run
              ? undefined
              : (qrl?.$captures$ as readonly unknown[] | null | undefined);
          return retryInLifetime(task, () => {
            if (isSubscriberDisposed(subscriber)) {
              return;
            }
            const result = runWithCollector(subscriber, () =>
              invoke(invokeContext, () =>
                invokeCaptured(run, captures, undefined, [
                  {
                    cleanup(callback: TaskCleanupFn) {
                      addCleanup(task, callback);
                    },
                  },
                ])
              )
            );
            if (!isPromise(result) && !task.disposed) {
              if (typeof result === 'function') {
                addCleanup(task, result as TaskCleanupFn);
              }
              return;
            }
            return thenInLifetime(
              task,
              result,
              (cleanup) => {
                if (typeof cleanup === 'function') {
                  addCleanup(task, cleanup as TaskCleanupFn);
                }
              },
              undefined,
              undefined,
              runReturnedCleanup
            );
          });
        }
      );
    });
  } catch (error) {
    finishTaskRun(subscriber);
    return handleError(subscriber.owner, error);
  }

  if (!isPromise(result)) {
    finishTaskRun(subscriber);
    return;
  }

  const pending = result.then(
    () => finishTaskRun(subscriber),
    (error) => {
      finishTaskRun(subscriber);
      return handleError(subscriber.owner, error);
    }
  );
  subscriber.runPromise = pending;
  return pending;
}

export function runTaskCleanups(task: Task | VisibleTask): ValueOrPromise<void> {
  if (task.cleanupPromise !== null) {
    return task.cleanupPromise;
  }

  const cleanups = task.cleanups;
  if (cleanups === null || cleanups.length === 0) {
    return;
  }

  task.cleanups = null;
  let pending: Promise<void>[] | null = null;
  let failure: { error: unknown } | undefined;
  for (let i = 0; i < cleanups.length; i++) {
    try {
      const result = cleanups[i]();
      if (isPromise(result)) {
        (pending ??= []).push(result);
      }
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure !== undefined) {
    if (pending !== null) {
      for (let i = 0; i < pending.length; i++) {
        pending[i].catch(() => {});
      }
    }
    throw failure.error;
  }
  if (pending === null) {
    return;
  }

  const cleanupPromise = Promise.all(pending).then(
    () => {
      if (task.cleanupPromise === cleanupPromise) {
        task.cleanupPromise = null;
      }
    },
    (error) => {
      if (task.cleanupPromise === cleanupPromise) {
        task.cleanupPromise = null;
        throw error;
      }
    }
  );
  task.cleanupPromise = cleanupPromise;
  return cleanupPromise;
}

function finishTaskRun(subscriber: TaskSubscriber | VisibleTaskSubscriber): void {
  subscriber.runPromise = null;
  if (!isSubscriberDisposed(subscriber) && subscriber.flags & SubscriberFlags.Dirty) {
    subscriber.scheduler.notify(subscriber);
  }
}

function addCleanup(task: Task | VisibleTask, callback: TaskCleanupFn): void {
  if (task.disposed) {
    runLateCleanup(callback);
    return;
  }
  const cleanups = task.cleanups ?? (task.cleanups = []);
  cleanups.push(callback);
}

function runReturnedCleanup(value: unknown): void {
  if (typeof value !== 'function') {
    return;
  }
  runLateCleanup(value as () => unknown);
}
