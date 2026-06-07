import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../../shared/qrl/qrl-class';
import {
  createCaptureContainer,
  createOrderTextExpressionEffect,
  createTaskSubscriber,
  createText,
  noopSchedule,
} from '../test-utils';
import { disposeSubscriber } from '../reactive/cleanup';
import { createComputed } from '../reactive/computed';
import { ReactiveFlags } from '../reactive/flags';
import { createSignal } from '../reactive/signal';
import { getActiveCollector, runWithCollector } from '../reactive/tracking';
import { createTextNodeEffect } from '../dom/effect/effect';
import {
  createOwner,
  disposeOwner,
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './owner';
import { Scheduler } from './scheduler';
import type { DomSubscriber, TaskSubscriber, VisibleTaskSubscriber } from './subscriber';
import {
  createTask,
  createTaskQrl,
  createVisibleTask,
  createVisibleTaskQrl,
  type TaskFn,
} from './task';

describe('runtime scheduler and owner lifecycle', () => {
  it('flushes blocking tasks before DOM effects', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const task = createTaskSubscriber(scheduler, 'task', order);
    const firstDom = createOrderTextExpressionEffect(scheduler, 'first-dom', order);
    const secondDom = createOrderTextExpressionEffect(scheduler, 'second-dom', order);

    scheduler.notify(secondDom);
    scheduler.notify(firstDom);
    scheduler.notify(task);

    await scheduler.flushInteraction();

    expect(order).toEqual(['task', 'second-dom', 'first-dom']);
  });

  it('sorts blocking tasks by group path and task index', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const parent0 = createTaskSubscriber(scheduler, 'parent-0', order, [0], 0);
    const parent1 = createTaskSubscriber(scheduler, 'parent-1', order, [0], 1);
    const child0 = createTaskSubscriber(scheduler, 'child-0', order, [0, 0], 0);

    scheduler.notify(child0);
    scheduler.notify(parent1);
    scheduler.notify(parent0);

    await scheduler.flushInteraction();

    expect(order).toEqual(['parent-0', 'parent-1', 'child-0']);
  });

  it('keeps enqueue order for tasks with the same group path and index', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const first = createTaskSubscriber(scheduler, 'first', order, [0], 0);
    const second = createTaskSubscriber(scheduler, 'second', order, [0], 0);

    scheduler.notify(first);
    scheduler.notify(second);

    await scheduler.flushInteraction();

    expect(order).toEqual(['first', 'second']);
  });

  it('dedupes scheduled subscribers in one batch', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const scalar = createOrderTextExpressionEffect(scheduler, 'scalar', order);

    scheduler.notify(scalar);
    scheduler.notify(scalar);

    await scheduler.flushInteraction();

    expect(order).toEqual(['scalar']);
  });

  it('skips disposed tasks that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const seen: string[] = [];
    const task = createTask(() => seen.push('task'), { scheduler });

    scheduler.notify(task);
    disposeSubscriber(task);
    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual([]);
    expect(task.flags).toBe(ReactiveFlags.Disposed);
  });

  it('registers subscribers with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const count = createSignal(1);
    const text = createText();
    let effect!: DomSubscriber;

    expect(getActiveOwner()).toBeNull();
    runWithOwner(owner, () => {
      expect(getActiveOwner()).toBe(owner);
      effect = createTextNodeEffect(text, count, { scheduler });
      expect(owner.subscribers).toEqual([effect]);
    });
    expect(getActiveOwner()).toBeNull();
    expect(owner.subscribers).toEqual([effect]);

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('1');
    expect(count.subs).toContain(effect);

    disposeOwner(owner);

    expect(owner.disposed).toBe(true);
    expect(owner.subscribers).toBeNull();
    expect(count.subs).toBeNull();
  });

  it('registers subscribers to an explicit owner without duplication', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const count = createSignal(1);
    const effect = createTextNodeEffect(createText(), count, { scheduler });

    expect(owner.subscribers).toBeNull();
    registerSubscriberToOwner(effect, owner);
    registerSubscriberToOwner(effect, owner);
    expect(owner.subscribers).toEqual([effect]);

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('leaves subscribers created without an active owner unowned', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const effect = createTextNodeEffect(createText(), createSignal(1), { scheduler });

    expect(owner.subscribers).toBeNull();

    disposeOwner(owner);

    expect(effect.flags & ReactiveFlags.Disposed).toBe(0);
  });

  it('detaches disposed child owners from their parent', () => {
    const parent = createOwner();
    let first!: Owner;
    let second!: Owner;

    runWithOwner(parent, () => {
      first = createOwner();
      second = createOwner();
    });

    expect(first.parent).toBe(parent);
    expect(second.parent).toBe(parent);
    expect(parent.childOwners).toHaveLength(2);

    disposeOwner(first);
    disposeOwner(first);

    expect(first.disposed).toBe(true);
    expect(first.parent).toBeNull();
    expect(parent.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    expect(second.parent).toBe(parent);
    expect(parent.childOwners).toHaveLength(1);
    expect(parent.childOwners![0]).toBe(second);
  });

  it('disposes child owners with their parent owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const parent = createOwner();
    const outerSource = createSignal('outer');
    const innerSource = createSignal('inner');
    let child!: Owner;
    let outerEffect!: DomSubscriber;
    let innerEffect!: DomSubscriber;

    runWithOwner(parent, () => {
      outerEffect = createTextNodeEffect(createText(), outerSource, { scheduler });
      child = createOwner();
      runWithOwner(child, () => {
        innerEffect = createTextNodeEffect(createText(), innerSource, { scheduler });
      });
    });

    expect(parent.subscribers).toEqual([outerEffect]);
    expect(parent.childOwners).toHaveLength(1);
    expect(parent.childOwners![0]).toBe(child);
    expect(child.parent).toBe(parent);
    expect(child.subscribers).toEqual([innerEffect]);

    scheduler.notify(outerEffect);
    scheduler.notify(innerEffect);
    await scheduler.flushInteraction();

    expect(outerSource.subs).toContain(outerEffect);
    expect(innerSource.subs).toContain(innerEffect);

    disposeOwner(parent);

    expect(parent.disposed).toBe(true);
    expect(child.disposed).toBe(true);
    expect(parent.childOwners).toBeNull();
    expect(parent.subscribers).toBeNull();
    expect(child.parent).toBeNull();
    expect(outerSource.subs).toBeNull();
    expect(innerSource.subs).toBeNull();
  });

  it('creates disposed child owners under disposed owners', () => {
    const parent = createOwner();
    let child!: Owner;

    disposeOwner(parent);

    runWithOwner(parent, () => {
      child = createOwner();
    });

    expect(parent.childOwners).toBeNull();
    expect(child.disposed).toBe(true);
    expect(child.parent).toBeNull();
  });

  it('disposes subscribers registered to disposed owners', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const effect = createTextNodeEffect(createText(), createSignal(1), { scheduler });

    disposeOwner(owner);
    registerSubscriberToOwner(effect, owner);

    expect(effect.flags).toBe(ReactiveFlags.Disposed);
    expect(owner.subscribers).toBeNull();
  });

  it('registers computed subscribers with the active owner', () => {
    const owner = createOwner();
    const count = createSignal(1);
    const doubled = runWithOwner(owner, () => createComputed(() => count.value * 2));

    expect(owner.subscribers).toEqual([doubled]);
    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('registers task subscribers with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const count = createSignal(1);
    const seen: number[] = [];
    let task!: TaskSubscriber;
    let visibleTask!: VisibleTaskSubscriber;

    runWithOwner(owner, () => {
      task = createTask(() => seen.push(count.value), { scheduler });
      visibleTask = createVisibleTask(() => seen.push(count.value + 10), {
        scheduler,
      });
    });

    expect(owner.subscribers).toEqual([task, visibleTask]);

    scheduler.notify(task);
    scheduler.notify(visibleTask);
    await scheduler.flushInteraction();

    expect(seen).toEqual([1, 11]);
    expect(count.subs).toContain(task);
    expect(count.subs).toContain(visibleTask);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('does not track dependencies through runWithOwner', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const collector = createTask(() => {}, { scheduler });
    const owner = createOwner();
    const tracked = createSignal('tracked');
    const untracked = createSignal('untracked');

    runWithCollector(collector, () => {
      expect(getActiveCollector()).toBe(collector);

      tracked.value;
      runWithOwner(owner, () => {
        expect(getActiveOwner()).toBe(owner);
        expect(getActiveCollector()).toBeNull();
        untracked.value;
      });

      expect(getActiveCollector()).toBe(collector);
    });

    expect(tracked.subs).toEqual([collector]);
    expect(untracked.subs).toBeNull();
  });

  it('restores owner and collector after runWithOwner throws', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const parent = createOwner();
    const child = createOwner();
    const collector = createTask(() => {}, { scheduler });

    runWithOwner(parent, () => {
      runWithCollector(collector, () => {
        expect(() =>
          runWithOwner(child, () => {
            expect(getActiveOwner()).toBe(child);
            expect(getActiveCollector()).toBeNull();
            throw new Error('boom');
          })
        ).toThrow('boom');

        expect(getActiveOwner()).toBe(parent);
        expect(getActiveCollector()).toBe(collector);
      });
    });

    expect(getActiveOwner()).toBeNull();
    expect(getActiveCollector()).toBeNull();
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

  it('runs visible tasks in enqueue order', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const second = createVisibleTask(() => order.push('second'), { scheduler });
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
      { scheduler }
    );

    scheduler.notify(second);
    scheduler.notify(first);
    await scheduler.flushInteraction();

    expect(order).toEqual(['second', 'first']);
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
      { scheduler }
    );
    const second = createVisibleTask(
      () => {
        order.push('second:start');
      },
      { scheduler }
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
