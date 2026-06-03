import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { disposeSubscriber } from './cleanup';
import { Computed, createComputed } from './computed';
import { createComputedQrl } from './computed-qrl';
import { ReactiveFlags } from './flags';
import { Phase, Scheduler } from './scheduler';
import { createSignal } from './signal';
import {
  SubscriberKind,
  type DomSubscriber,
  type IdleSubscriber,
  type TaskSubscriber,
} from './subscriber';
import {
  createTask,
  createTaskGroup,
  createTaskQrl,
  createVisibleTask,
  createVisibleTaskQrl,
  type TaskFn,
} from './task';
import { runWithCollector } from './tracking';

const noopSchedule = (): void => {};

function createCaptureContainer(captures: Record<string, unknown>): Container {
  return {
    $getObjectById$: (id: number | string) => captures[String(id)],
  } as Container;
}

describe('vdomless reactivity', () => {
  it('notifies signal subscribers and skips Object.is-equal writes', () => {
    const count = createSignal(0);
    let notifications = 0;
    const subscriber = createIdleSubscriber(() => {
      notifications++;
    });

    count.subs = [subscriber];
    count.value = 0;

    expect(notifications).toBe(0);
    expect(count.version).toBe(0);

    count.value = 1;

    expect(notifications).toBe(1);
    expect(count.version).toBe(1);
  });

  it('keeps computed values lazy and cached until a dependency changes', () => {
    const count = createSignal(1);
    let runs = 0;
    const doubled = createComputed(() => {
      runs++;
      return count.value * 2;
    });

    expect(runs).toBe(0);
    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);

    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);

    count.value = 2;

    expect(runs).toBe(1);
    expect(doubled.value).toBe(4);
    expect(runs).toBe(2);
    expect(doubled.version).toBe(2);
  });

  it('propagates computed dirty state through computed chains lazily', () => {
    const count = createSignal(1);
    let doubledRuns = 0;
    let quadrupledRuns = 0;
    const doubled = createComputed(() => {
      doubledRuns++;
      return count.value * 2;
    });
    const quadrupled = createComputed(() => {
      quadrupledRuns++;
      return doubled.value * 2;
    });

    expect(quadrupled.value).toBe(4);
    expect(doubledRuns).toBe(1);
    expect(quadrupledRuns).toBe(1);

    count.value = 2;

    expect(doubledRuns).toBe(1);
    expect(quadrupledRuns).toBe(1);
    expect(quadrupled.value).toBe(8);
    expect(doubledRuns).toBe(2);
    expect(quadrupledRuns).toBe(2);
  });

  it('drops stale dynamic computed dependencies on recompute', () => {
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    let runs = 0;
    const selected = createComputed(() => {
      runs++;
      return useA.value ? a.value : b.value;
    });

    expect(selected.value).toBe('a');
    expect(runs).toBe(1);

    useA.value = false;
    expect(selected.value).toBe('b');
    expect(runs).toBe(2);
    expect(a.subs).toBeNull();

    a.value = 'next-a';
    expect(selected.value).toBe('b');
    expect(runs).toBe(2);

    b.value = 'next-b';
    expect(selected.value).toBe('next-b');
    expect(runs).toBe(3);
  });

  it('removes source subscriptions when a collector is disposed', () => {
    const count = createSignal(1);
    const doubled = createComputed(() => count.value * 2);

    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

    disposeSubscriber(doubled);

    expect(count.subs).toBeNull();
  });

  it('throws on circular computed dependencies', () => {
    const circular: Computed<number> = createComputed(() => circular.value + 1);

    expect(() => circular.value).toThrow('Circular computed dependency');
  });

  it('runs resolved computed QRLs synchronously', () => {
    const computed = createComputedQrl(createQRL('chunk', 'symbol', () => 'computed', null, null));

    expect(computed.value).toBe('computed');
  });

  it('throws unresolved computed QRL promises and computes after resolve', async () => {
    const qrl = createQRL(
      'chunk',
      'symbol',
      null,
      () => Promise.resolve({ symbol: () => 'resolved-computed' }),
      null
    );
    const computed = createComputedQrl(qrl);
    let pending: unknown;

    try {
      computed.value;
    } catch (promise) {
      pending = promise;
    }

    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(computed.value).toBe('resolved-computed');
  });

  it('restores serialized captures for computed QRLs', async () => {
    const container = createCaptureContainer({
      0: 'left',
      1: 'right',
    });
    const qrl = createQRL(
      'chunk',
      'symbol',
      null,
      () =>
        Promise.resolve({
          symbol: () => (_captures as readonly string[]).join(':'),
        }),
      '0 1',
      container
    );
    const computed = createComputedQrl(qrl, container);
    let pending: unknown;

    try {
      computed.value;
    } catch (promise) {
      pending = promise;
    }

    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(computed.value).toBe('left:right');
  });

  it('flushes scheduled work in phase order', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const task = createTaskSubscriber(scheduler, 'task', order);
    const structural = createDomSubscriber(scheduler, Phase.StructuralDom, 'structural', order);
    const scalar = createDomSubscriber(scheduler, Phase.ScalarDom, 'scalar', order);

    scheduler.notify(scalar);
    scheduler.notify(structural);
    scheduler.notify(task);

    await scheduler.flushInteraction();

    expect(order).toEqual(['task', 'structural', 'scalar']);
  });

  it('sorts blocking tasks by group path and task index', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const parent0 = createTaskSubscriber(scheduler, 'parent-0', order, [0], 0, 2);
    const parent1 = createTaskSubscriber(scheduler, 'parent-1', order, [0], 1, 1);
    const child0 = createTaskSubscriber(scheduler, 'child-0', order, [0, 0], 0, 0);

    scheduler.notify(child0);
    scheduler.notify(parent1);
    scheduler.notify(parent0);

    await scheduler.flushInteraction();

    expect(order).toEqual(['parent-0', 'parent-1', 'child-0']);
  });

  it('dedupes scheduled subscribers in one batch', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const scalar = createDomSubscriber(scheduler, Phase.ScalarDom, 'scalar', order);

    scheduler.notify(scalar);
    scheduler.notify(scalar);

    await scheduler.flushInteraction();

    expect(order).toEqual(['scalar']);
  });

  it('tracks dependencies for scheduled DOM subscribers', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(0);
    const seen: number[] = [];
    const scalar = createDomSubscriber(scheduler, Phase.ScalarDom, 'scalar', [], () => {
      seen.push(count.value);
    });

    runWithCollector(scalar, () => scalar.effect.run());

    expect(seen).toEqual([0]);
    expect(count.subs).toContain(scalar);

    count.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual([0, 1]);
  });

  it('createTask tracks dependencies and reruns after signal mutation', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(0);
    const seen: number[] = [];
    const task = createTask(
      () => {
        seen.push(count.value);
      },
      { scheduler }
    );

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual([0]);
    expect(count.subs).toContain(task);

    count.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual([0, 1]);
  });

  it('runs deferred tasks only during deferred flush', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const task = createTask(() => order.push('deferred'), {
      deferUpdates: true,
      scheduler,
    });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(order).toEqual([]);

    await scheduler.flushDeferred();

    expect(order).toEqual(['deferred']);
  });

  it('loads unresolved task QRLs before running them', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    let resolved = false;
    const qrl = createQRL<TaskFn>(
      'chunk',
      'symbol',
      null,
      () => {
        resolved = true;
        return Promise.resolve({
          symbol: () => {
            order.push('qrl');
          },
        });
      },
      null
    );
    const task = createTaskQrl(qrl, { scheduler });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(resolved).toBe(true);
    expect(order).toEqual(['qrl']);
  });

  it('sorts visible tasks by seq', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const second = createVisibleTask(() => order.push('second'), { scheduler, seq: 1 });
    const first = createVisibleTaskQrl(
      createQRL<TaskFn>(
        'chunk',
        'symbol',
        () => {
          order.push('first');
        },
        null,
        null
      ),
      { scheduler, seq: 0 }
    );

    scheduler.notify(second);
    scheduler.notify(first);
    await scheduler.flushInteraction();

    expect(order).toEqual(['first', 'second']);
  });

  it('starts visible tasks independently', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const first = createVisibleTask(
      () => {
        order.push('first:start');
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      },
      { scheduler, seq: 0 }
    );
    const second = createVisibleTask(
      () => {
        order.push('second:start');
      },
      { scheduler, seq: 1 }
    );

    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();
    resolveFirst?.();

    expect(order).toEqual(['first:start', 'second:start']);
  });

  it('restores serialized captures for task QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const seen: string[] = [];
    const container = createCaptureContainer({
      0: 'task',
      1: 'capture',
    });
    const qrl = createQRL<TaskFn>(
      'chunk',
      'symbol',
      null,
      () =>
        Promise.resolve({
          symbol: () => {
            seen.push((_captures as readonly string[]).join(':'));
          },
        }),
      '0 1',
      container
    );
    const task = createTaskQrl(qrl, { scheduler, container });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['task:capture']);
  });

  it('cleans up dynamic dependencies for tasks', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const seen: string[] = [];
    const task = createTask(() => seen.push(useA.value ? a.value : b.value), { scheduler });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    useA.value = false;
    await scheduler.flushInteraction();

    expect(a.subs).toBeNull();

    a.value = 'next-a';
    await scheduler.flushInteraction();

    b.value = 'next-b';
    await scheduler.flushInteraction();

    expect(seen).toEqual(['a', 'b', 'next-b']);
  });

  it('cleans up dynamic dependencies for visible tasks', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const seen: string[] = [];
    const task = createVisibleTask(() => seen.push(useA.value ? a.value : b.value), {
      scheduler,
    });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    useA.value = false;
    await scheduler.flushInteraction();

    expect(a.subs).toBeNull();

    a.value = 'next-a';
    await scheduler.flushInteraction();

    b.value = 'next-b';
    await scheduler.flushInteraction();

    expect(seen).toEqual(['a', 'b', 'next-b']);
  });
});

function createTaskSubscriber(
  scheduler: Scheduler,
  label: string,
  order: string[],
  groupPath: readonly number[] = [0],
  index = 0,
  seq = 0
): TaskSubscriber {
  return createTask(() => order.push(label), {
    scheduler,
    group: createTaskGroup(groupPath),
    index,
    seq,
  });
}

function createDomSubscriber(
  scheduler: Scheduler,
  phase: Phase.StructuralDom | Phase.ScalarDom,
  label: string,
  order: string[],
  run?: () => void,
  orderIndex = 0,
  seq = 0
): DomSubscriber {
  const effect: DomSubscriber = {
    kind: SubscriberKind.Dom,
    effect: {
      phase,
      order: orderIndex,
      seq,
      run() {
        order.push(label);
        run?.();
      },
    },
    flags: ReactiveFlags.None,
    schedulerEpoch: 0,
    deps: null,
    depVersions: null,
    notify() {
      scheduler.notify(effect);
    },
  };
  return effect;
}

function createIdleSubscriber(notify: () => void): IdleSubscriber {
  return {
    kind: SubscriberKind.Idle,
    job: {
      seq: 0,
      run() {},
    },
    flags: ReactiveFlags.None,
    schedulerEpoch: 0,
    notify,
  };
}
