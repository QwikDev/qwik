import { describe, expect, it } from 'vitest';
import {
  createOwner,
  createSerializationContext,
  disposeSubscriber,
  Phase,
  registerSubscriberToOwner,
  SsrAttrEffect,
  Task,
  TaskSubscription,
  useSignal,
  type TaskFn,
} from '@qwik.dev/core';
import { SsrScheduler, type SsrLane } from './ssr-scheduler';

function createLane(): { lane: SsrLane } {
  return { lane: new SsrScheduler().createLane() };
}

function createTask(lane: SsrLane, run: TaskFn): TaskSubscription {
  return registerSubscriberToOwner(
    new TaskSubscription(new Task(run, Phase.BlockingTask), lane),
    createOwner(null)
  );
}

function createDom(lane: SsrLane, promise: Promise<string>): SsrAttrEffect {
  const source = useSignal('initial');
  const subscriber = registerSubscriberToOwner(
    new SsrAttrEffect(0, 'title', source, null, lane),
    createOwner(null)
  );
  subscriber.schedulePromise(promise);
  return subscriber;
}

describe('SsrScheduler', () => {
  it('cancels descendants with a linear number of parent reads', () => {
    const scheduler = new SsrScheduler();
    const root = scheduler.createLane();
    let parent = root;
    let reads = 0;
    for (let i = 0; i < 64; i++) {
      const lane = scheduler.createLane(parent);
      const parentId = lane.parentId;
      Object.defineProperty(lane, 'parentId', {
        get() {
          reads++;
          return parentId;
        },
      });
      parent = lane;
    }
    const sibling = scheduler.createLane();
    reads = 0;
    scheduler.cancel(root);
    expect(reads).toBeLessThan(64 * 4);
    expect(scheduler.lanes.slice(0, -1).every((lane) => lane.isCancelled)).toBe(true);
    expect(sibling.isCancelled).toBe(false);
  });

  it('does not start work created under an already cancelled parent', () => {
    const scheduler = new SsrScheduler();
    const root = scheduler.createLane();
    scheduler.cancel(root);
    const child = scheduler.createLane(root);
    let runs = 0;
    child.notify(
      createTask(child, () => {
        runs++;
      })
    );
    expect(runs).toBe(0);
    expect(child.isCancelled).toBe(true);
  });

  it.each([false, true])('rollback respects lane cancellation: %s', async (cancelled) => {
    const { lane } = createLane();
    createDom(lane, Promise.resolve('PRIVATE_DISCARDED_PATCH'));
    await lane.settle();
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const transaction = serialization.$beginTransaction$();
    expect(lane.takePatches(serialization.$journal$)).toEqual([
      [0, 'title', 'PRIVATE_DISCARDED_PATCH'],
    ]);
    if (cancelled) {
      lane.cancel();
    }
    transaction.rollback();
    expect(lane.takePatches()).toEqual(
      cancelled ? null : [[0, 'title', 'PRIVATE_DISCARDED_PATCH']]
    );
  });

  it('starts tasks eagerly without registering serialization roots', () => {
    const { lane } = createLane();
    const order: string[] = [];
    const task = createTask(lane, () => {
      order.push('task');
    });

    lane.notify(task);

    expect(order).toEqual(['task']);
    expect(lane.flush()).toBeUndefined();
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

  it('flushes tasks without waiting for DOM Promises', async () => {
    const { lane } = createLane();
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => (resolve = done));
    createDom(lane, pending);

    expect(lane.flush()).toBeUndefined();
    expect(lane.takePatches()).toBeNull();

    const settled = lane.settle();
    resolve('final');
    await settled;
    expect(lane.takePatches()).toEqual([[0, 'title', 'final']]);
  });

  it('coalesces patches for the same attribute', async () => {
    const { lane } = createLane();
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    createDom(lane, new Promise<string>((resolve) => (resolveFirst = resolve)));
    createDom(lane, new Promise<string>((resolve) => (resolveSecond = resolve)));
    const settled = lane.settle();

    resolveFirst('first');
    resolveSecond('second');
    await settled;

    expect(lane.takePatches()).toEqual([[0, 'title', 'second']]);
  });

  it('drops a resolved patch superseded before collection', async () => {
    const { lane } = createLane();
    let resolve!: (value: string) => void;
    const subscriber = createDom(lane, new Promise<string>((done) => (resolve = done)));
    lane.flush();

    resolve('stale');
    await Promise.resolve();
    const source = subscriber.source!;
    source.v = 'final';
    lane.notify(subscriber);
    lane.flush();
    await lane.settle();

    expect(lane.takePatches()).toEqual([[0, 'title', 'final']]);
  });

  it('stops waiting when a pending DOM subscriber is disposed', async () => {
    const { lane } = createLane();
    const subscriber = createDom(lane, new Promise<string>(() => {}));
    const settled = Promise.resolve(lane.settle());

    disposeSubscriber(subscriber);
    await settled;
  });
});
