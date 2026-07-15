import { cleanupDeps } from '../reactive/cleanup';
import { SubscriberFlags } from '../reactive/flags';
import { runWithCollector } from '../reactive/tracking';
import { getFunctionOrResolve } from '../utils/qrl';
import { isPromise, maybeThen } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { Task, TaskCleanupFn, VisibleTask } from './task';
import { takeDirty, type TaskSubscriber, type VisibleTaskSubscriber } from './subscriber';

export function runTaskSubscriber(
  subscriber: TaskSubscriber | VisibleTaskSubscriber
): ValueOrPromise<void> {
  if (subscriber.runPromise !== null) {
    return subscriber.runPromise;
  }

  if (!takeDirty(subscriber)) {
    return;
  }

  const task = subscriber.task;
  let result: ValueOrPromise<void>;
  try {
    result = maybeThen(runTaskCleanups(task), () => {
      cleanupDeps(subscriber);
      return maybeThen(task.runFn ?? getFunctionOrResolve(task.qrl!, task.container), (run) =>
        maybeThen(
          runWithCollector(subscriber, () =>
            run({
              cleanup(callback) {
                addCleanup(task, callback);
              },
            })
          ),
          (cleanup) => {
            if (typeof cleanup === 'function') {
              addCleanup(task, cleanup as TaskCleanupFn);
            }
          }
        )
      );
    });
  } catch (error) {
    finishTaskRun(subscriber);
    throw error;
  }

  if (!isPromise(result)) {
    finishTaskRun(subscriber);
    return;
  }

  const pending = result.then(
    () => finishTaskRun(subscriber),
    (error) => {
      finishTaskRun(subscriber);
      throw error;
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
  for (let i = 0; i < cleanups.length; i++) {
    const result = cleanups[i]();
    if (isPromise(result)) {
      (pending ??= []).push(result);
    }
  }
  if (pending === null) {
    return;
  }

  const cleanupPromise = Promise.all(pending).then(() => {});
  task.cleanupPromise = cleanupPromise;
  return cleanupPromise.finally(() => {
    task.cleanupPromise = null;
  });
}

function finishTaskRun(subscriber: TaskSubscriber | VisibleTaskSubscriber): void {
  subscriber.runPromise = null;
  if (subscriber.owner !== null && subscriber.flags & SubscriberFlags.Dirty) {
    subscriber.scheduler.notify(subscriber);
  }
}

function addCleanup(task: Task | VisibleTask, callback: TaskCleanupFn): void {
  const cleanups = task.cleanups ?? (task.cleanups = []);
  cleanups.push(callback);
}
