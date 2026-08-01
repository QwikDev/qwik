import { describe, expect, it } from 'vitest';
import {
  createOwner,
  createSsrElementTarget,
  disposeSubscriber,
  Phase,
  registerSubscriberToOwner,
  SsrAttrEffect,
  SsrDomSubscription,
  Task,
  TaskSubscription,
  useSignal,
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

function createDom(lane: SsrLane, promise: Promise<string>): SsrDomSubscription {
  const source = useSignal('initial');
  const subscriber = registerSubscriberToOwner(
    new SsrDomSubscription(new SsrAttrEffect(createSsrElementTarget(0), 'title', source), lane),
    createOwner(null)
  );
  subscriber.schedulePromise(promise);
  return subscriber;
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
    const source = (subscriber.effect as SsrAttrEffect).source!;
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
