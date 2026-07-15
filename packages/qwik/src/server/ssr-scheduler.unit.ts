import { describe, expect, it } from 'vitest';
import {
  createOwner,
  Phase,
  registerSubscriberToOwner,
  Task,
  TaskSubscription,
  type TaskFn,
} from '@qwik.dev/core';
import { SsrScheduler, type SsrLane } from './ssr-scheduler';

function createLane(): { lane: SsrLane; roots: unknown[] } {
  const roots: unknown[] = [];
  const serializationCtx = {
    $addRoot$(value: unknown) {
      roots.push(value);
      return roots.length - 1;
    },
  };
  return { lane: new SsrScheduler().createLane(serializationCtx), roots };
}

function createTask(lane: SsrLane, run: TaskFn): TaskSubscription {
  return registerSubscriberToOwner(
    new TaskSubscription(new Task(run, Phase.BlockingTask), lane),
    createOwner(null)
  );
}

describe('SsrScheduler', () => {
  it('starts the first task eagerly and keeps the sync path promise-free', () => {
    const { lane, roots } = createLane();
    const order: string[] = [];
    const task = createTask(lane, () => {
      order.push('task');
    });

    lane.notify(task);

    expect(order).toEqual(['task']);
    expect(lane.flush()).toBeUndefined();
    expect(roots).toEqual([task]);
  });

  it('runs queued tasks in registration order while setup can continue', async () => {
    const { lane } = createLane();
    const order: string[] = [];
    let resolveFirst!: () => void;
    const first = createTask(
      lane,
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
          order.push('first:start');
        })
    );
    const second = createTask(lane, () => {
      order.push('second');
    });

    lane.notify(first);
    order.push('setup');
    lane.notify(second);

    expect(order).toEqual(['first:start', 'setup']);
    const flushed = lane.flush();
    resolveFirst();
    await flushed;
    expect(order).toEqual(['first:start', 'setup', 'second']);
  });

  it('drains invalidation created by the running task', async () => {
    const { lane } = createLane();
    let runs = 0;
    const task = createTask(lane, () => {
      runs++;
      if (runs === 1) {
        lane.notify(task);
      }
    });

    lane.notify(task);
    await lane.flush();

    expect(runs).toBe(2);
  });

  it('observes rejection immediately and rejects flush', async () => {
    const { lane } = createLane();
    const task = createTask(lane, () => Promise.reject(new Error('task failed')));

    lane.notify(task);

    await expect(lane.flush()).rejects.toThrow('task failed');
  });
});
