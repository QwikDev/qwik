import { isGenerator } from '../../shared/utils/async-generator';
import { cleanupDeps } from '../reactive/cleanup';
import { SubscriberFlags } from '../reactive/flags';
import { runWithCollector } from '../reactive/tracking';
import { getFunctionOrResolve } from '../utils/qrl';
import type { Task, TaskCleanupFn, VisibleTask } from './task';
import { takeDirty, type TaskSubscriber, type VisibleTaskSubscriber } from './subscriber';

export function runTaskSubscriber(
  subscriber: TaskSubscriber | VisibleTaskSubscriber
): Promise<void> {
  if (subscriber.runPromise !== null) {
    return subscriber.runPromise;
  }

  if (!takeDirty(subscriber)) {
    return Promise.resolve();
  }

  const task = subscriber.task;
  const runPromise = (async () => {
    try {
      await runTaskCleanups(task);
      cleanupDeps(subscriber);
      const run = task.runFn ?? (await getFunctionOrResolve(task.qrl!, task.container));
      const result = runWithCollector(subscriber, () =>
        run({
          cleanup(callback) {
            addCleanup(task, callback);
          },
        })
      );
      const cleanup = isGenerator(result)
        ? await drainTaskGenerator(subscriber, result)
        : await result;
      if (typeof cleanup === 'function') {
        addCleanup(task, cleanup as TaskCleanupFn);
      }
    } finally {
      subscriber.runPromise = null;
      if (subscriber.owner !== null && subscriber.flags & SubscriberFlags.Dirty) {
        subscriber.scheduler.notify(subscriber);
      }
    }
  })();
  subscriber.runPromise = runPromise;
  return runPromise;
}

export async function runTaskCleanups(task: Task | VisibleTask): Promise<void> {
  if (task.cleanupPromise !== null) {
    await task.cleanupPromise;
    return;
  }

  const cleanups = task.cleanups;
  if (cleanups === null || cleanups.length === 0) {
    return;
  }

  task.cleanups = null;
  const cleanupPromise = Promise.all(cleanups.map((cleanup) => cleanup())).then(() => {});
  task.cleanupPromise = cleanupPromise;
  try {
    await cleanupPromise;
  } finally {
    task.cleanupPromise = null;
  }
}

function addCleanup(task: Task | VisibleTask, callback: TaskCleanupFn): void {
  const cleanups = task.cleanups ?? (task.cleanups = []);
  cleanups.push(callback);
}

async function drainTaskGenerator(
  subscriber: TaskSubscriber | VisibleTaskSubscriber,
  generator: Generator<unknown>
): Promise<unknown> {
  let input: unknown;
  let rejected = false;
  while (true) {
    let step: IteratorResult<unknown>;
    try {
      step = runWithCollector(subscriber, () =>
        rejected ? generator.throw!(input) : generator.next(input)
      );
    } catch (error) {
      await closeTaskGenerator(generator);
      throw error;
    }

    if (step.done) {
      return step.value;
    }

    try {
      input = await step.value;
      rejected = false;
    } catch (error) {
      if (typeof generator.throw !== 'function') {
        throw error;
      }
      input = error;
      rejected = true;
    }
  }
}

async function closeTaskGenerator(generator: Generator<unknown>): Promise<void> {
  if (typeof generator.return !== 'function') {
    return;
  }
  await generator.return(undefined);
}
