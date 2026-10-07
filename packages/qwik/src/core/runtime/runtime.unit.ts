import { describe, expect, it, vi } from 'vitest';
import { _captures, createQRL } from '../shared/qrl/qrl-class';
import {
  createCaptureContainer,
  createIdleSubscriber,
  createOrderTextExpressionEffect,
  useTaskSubscriber,
  createText,
  noopSchedule,
  runWithTestContainer,
  toArray,
} from '../test-utils';
import { disposeSubscriber } from '../reactive/cleanup';
import { OwnerFlags, SubscriberFlags } from '../reactive/flags';
import type { Signal } from '../reactive/signal';
import { useSignal, useComputed } from '../reactive/public-api';
import { _await, getActiveCollector, runWithCollector } from '../reactive/tracking';
import { createTextNodeEffect, type TextExpressionEffect } from '../dom/effect/text-effect';
import {
  createOwner,
  disposeOwner,
  disposeOwnerItems,
  getActiveOwner,
  ownerItemsLength,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './owner';
import { getActiveInvokeContextOrNull, invoke, newInvokeContext } from './invoke-context';
import { Phase, Scheduler } from './scheduler';
import { runTaskSubscriber } from './run-task';
import {
  SubscriberKind,
  type BranchSubscriber,
  type DomSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import {
  Task,
  TaskSubscription,
  useTask,
  useTaskQrl,
  useVisibleTask,
  useVisibleTaskQrl,
  type TaskFn,
  type TaskCtx,
} from './task';
import type { ContainerContext } from './container-context';
import { LazySerialized } from '../reactive/lazy-serialized';

describe('runtime scheduler and owner lifecycle', () => {
  it('runs scheduled tasks under their creation invoke context', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const container = createCaptureContainer({}, scheduler);
    const context = newInvokeContext({ owner: createOwner(null), container });
    let seen: unknown = 'unset';
    const qrl = createQRL('chunk', 'task', () => {
      seen = getActiveInvokeContextOrNull()?.container;
    });

    invoke(context, () => runWithOwner(createOwner(null), () => useTaskQrl(qrl)));
    await scheduler.flushInteraction();

    expect(seen).toBe(container);
  });

  it('runs resumed tasks under a context carrying their container', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const container = createCaptureContainer({}, scheduler);
    let seen: unknown = 'unset';
    const qrl = createQRL('chunk', 'task', () => {
      seen = getActiveInvokeContextOrNull()?.container;
    });
    // the deserialized shape: qrl + container, no stored invoke context
    const subscriber = runWithOwner(createOwner(null), () =>
      registerSubscriberToOwner(
        new TaskSubscription(new Task(undefined, Phase.BlockingTask, qrl, container), scheduler)
      )
    ) as TaskSubscriber;
    subscriber.flags |= SubscriberFlags.Dirty;

    await runTaskSubscriber(subscriber);

    expect(seen).toBe(container);
  });

  it('chains initial tasks on the active invoke context', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const context = newInvokeContext({
      owner: createOwner(null),
      container: createCaptureContainer({}, scheduler),
    });
    const order: string[] = [];
    let resolveFirst!: () => void;

    invoke(context, () => {
      useTask(
        () =>
          new Promise<void>((resolve) => {
            order.push('first:start');
            resolveFirst = resolve;
          })
      );
      useTask(() => {
        order.push('second');
      });
    });

    expect(order).toEqual(['first:start']);
    resolveFirst();
    await context.pendingSetup;
    expect(order).toEqual(['first:start', 'second']);
  });

  it('waits for one-shot work and drains work scheduled by its resolution', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    let resolve!: () => void;
    const effect = createOrderTextExpressionEffect(scheduler, 'effect', order);

    scheduler.waitFor(
      new Promise<void>((done) => {
        resolve = () => {
          scheduler.notify(effect);
          done();
        };
      })
    );

    const flushing = scheduler.flushInteraction();
    expect(order).toEqual([]);
    resolve();
    await flushing;

    expect(order).toEqual(['effect']);
  });

  it('runs independent owners while one owner is waiting', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const blocked = createOrderTextExpressionEffect(scheduler, 'blocked', order);
    blocked.execute = () => pending;
    const sibling = createOrderTextExpressionEffect(scheduler, 'sibling', order);

    scheduler.notify(blocked);
    const flushing = scheduler.flushInteraction();
    scheduler.notify(sibling);
    scheduler.flushInteraction();
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(order).toEqual(['sibling']);
    } finally {
      release();
      await flushing;
    }
  });

  it('drains ready owners while one-shot work is waiting', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    let release!: () => void;
    scheduler.waitFor(new Promise<void>((resolve) => (release = resolve)));
    scheduler.notify(createOrderTextExpressionEffect(scheduler, 'sibling', order));

    const flushing = scheduler.flushInteraction();
    try {
      await Promise.resolve();
      expect(order).toEqual(['sibling']);
    } finally {
      release();
      await flushing;
    }
  });

  it('waits for initial work before flushing that owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const blocked = createOrderTextExpressionEffect(scheduler, 'blocked', order);
    const sibling = createOrderTextExpressionEffect(scheduler, 'sibling', order);
    let release!: () => void;
    scheduler.waitFor(new Promise<void>((resolve) => (release = resolve)), blocked.owner);
    scheduler.notify(blocked);
    scheduler.notify(sibling);
    const flushing = scheduler.flushInteraction();
    try {
      expect(order).toEqual(['sibling']);
    } finally {
      release();
      await flushing;
    }
    expect(order).toEqual(['sibling', 'blocked']);
  });

  it('runs commit callbacks for a ready owner while another owner waits', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    let release!: () => void;
    const blocked = createOrderTextExpressionEffect(scheduler, 'blocked', order);
    blocked.execute = () => new Promise<void>((resolve) => (release = resolve));
    const ready = createOrderTextExpressionEffect(scheduler, 'ready', order);
    ready.execute = () =>
      runWithOwner(ready.owner, () => {
        order.push('commit');
        scheduler.onFlushed(() => order.push('scan'));
      });
    scheduler.notify(blocked);
    scheduler.notify(ready);
    const flushing = scheduler.flushInteraction();
    try {
      expect(order).toEqual(['commit', 'scan']);
    } finally {
      release();
      await flushing;
    }
  });

  it('restores the owner tree before tasks and structural writes while scalar work runs', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const source = useSignal(0);
    const lazy = createOrderTextExpressionEffect(scheduler, 'lazy', order);
    let release!: () => void;
    source.subs = new LazySerialized(
      () =>
        new Promise<DomSubscriber>((resolve) => {
          release = () => resolve(lazy);
        }),
      scheduler
    );
    const structural = registerSubscriberToOwner(
      {
        kind: SubscriberKind.Branch,
        owner: null,
        flags: SubscriberFlags.None,
        deps: null,
        branch: {} as BranchSubscriber['branch'],
        scheduler,
        run: () => {
          order.push('structural');
        },
      },
      createOwner(null)
    );
    source.value++;
    scheduler.notify(structural);
    scheduler.notify(
      registerSubscriberToOwner(
        new TaskSubscription(
          new Task(() => {
            order.push('task');
          }, Phase.BlockingTask),
          scheduler
        ),
        createOwner(null)
      )
    );
    scheduler.notify(createOrderTextExpressionEffect(scheduler, 'scalar', order));
    const flushing = scheduler.flushInteraction();
    try {
      expect(order).toEqual(['scalar']);
    } finally {
      release();
      await flushing;
    }
    expect(order).toContain('structural');
    expect(order).toContain('task');
    expect(order).toContain('lazy');
  });

  it('releases a disposed owner without waiting for its promise', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner(null);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const effect = runWithOwner(owner, () =>
      createOrderTextExpressionEffect(scheduler, 'blocked', [])
    );
    effect.execute = () => pending;
    scheduler.notify(effect);
    let finished = false;
    const flushing = scheduler.flushInteraction().then(() => (finished = true));
    disposeOwner(owner);

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(finished).toBe(true);
    } finally {
      release();
      await flushing;
    }
  });

  it.each([false, true])(
    'releases initial work with owner already disposed=%s',
    async (disposed) => {
      const scheduler = new Scheduler(noopSchedule);
      const owner = createOwner(null);
      if (disposed) {
        disposeOwner(owner);
      }
      let release!: () => void;
      scheduler.waitFor(new Promise<void>((resolve) => (release = resolve)), owner);
      let finished = false;
      const flushing = scheduler.flushInteraction().then(() => {
        finished = true;
      });
      if (!disposed) {
        disposeOwner(owner);
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(finished).toBe(true);
      } finally {
        release();
        await flushing;
      }
    }
  );

  it('keeps a dirty child behind an already waiting parent task', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner(null);
    const order: string[] = [];
    let releaseChild!: () => void;
    let releaseParent!: () => void;
    const childPending = new Promise<void>((resolve) => (releaseChild = resolve));
    const parentPending = new Promise<void>((resolve) => (releaseParent = resolve));
    const child = runWithOwner(createOwner(parent), () =>
      createOrderTextExpressionEffect(scheduler, 'child', order)
    );
    let first = true;
    child.execute = () => {
      if (first) {
        first = false;
        return childPending;
      }
      order.push('child');
    };
    const task = registerSubscriberToOwner(
      new TaskSubscription(
        new Task(() => {
          order.push('parent:start');
          return parentPending.then(() => {
            order.push('parent:done');
          });
        }, Phase.BlockingTask),
        scheduler
      ),
      parent
    );
    scheduler.notify(child);
    const flushing = scheduler.flushInteraction();
    scheduler.notify(task);
    scheduler.flushInteraction();
    scheduler.notify(child);
    releaseChild();
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(order).toEqual(['parent:start']);
    } finally {
      releaseParent();
      await flushing;
    }
    expect(order).toEqual(['parent:start', 'parent:done', 'child']);
  });

  it('waits for an active child task when its parent starts flushing', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner(null);
    const child = createOwner(parent);
    const order: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const task = registerSubscriberToOwner(
      new TaskSubscription(
        new Task(() => {
          order.push('child:start');
          return pending.then(() => order.push('child:done'));
        }, Phase.BlockingTask),
        scheduler
      ),
      child
    );
    const childEffect = runWithOwner(child, () =>
      createOrderTextExpressionEffect(scheduler, 'child:dom', order)
    );
    const parentEffect = runWithOwner(parent, () =>
      createOrderTextExpressionEffect(scheduler, 'parent:dom', order)
    );
    scheduler.notify(task);
    const flushing = scheduler.flushInteraction();
    scheduler.notify(childEffect);
    scheduler.notify(parentEffect);
    scheduler.flushInteraction();
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(order).toEqual(['child:start', 'parent:dom']);
    } finally {
      release();
      await flushing;
    }
    expect(order).toEqual(['child:start', 'parent:dom', 'child:done', 'child:dom']);
  });

  it('updates an owner whose own phases finished while its descendant still waits', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const root = createOwner(null);
    const parent = createOwner(root);
    const order: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const child = runWithOwner(createOwner(parent), () =>
      createOrderTextExpressionEffect(scheduler, 'child', order)
    );
    child.execute = () => pending;
    const parentEffect = runWithOwner(parent, () =>
      createOrderTextExpressionEffect(scheduler, 'parent', order)
    );
    const rootEffect = runWithOwner(root, () =>
      createOrderTextExpressionEffect(scheduler, 'root', order)
    );
    const visible = invoke(
      newInvokeContext({ owner: root, container: createCaptureContainer({}, scheduler) }),
      () => useVisibleTask(() => order.push('visible'))
    );
    scheduler.notify(child);
    scheduler.notify(parentEffect);
    const flushing = scheduler.flushInteraction();
    scheduler.notify(parentEffect);
    scheduler.notify(rootEffect);
    scheduler.notify(visible);
    scheduler.flushInteraction();
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(order).toEqual(['parent', 'root', 'parent']);
    } finally {
      release();
      await flushing;
    }
    expect(order).toEqual(['parent', 'root', 'parent', 'visible']);
  });

  it.each([false, true])('releases a parent flush after child disposal, task=%s', async (task) => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner(null);
    const child = createOwner(parent);
    const order: string[] = [];
    const sibling = runWithOwner(createOwner(parent), () =>
      createOrderTextExpressionEffect(scheduler, 'sibling', order)
    );
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    if (task) {
      scheduler.notify(
        registerSubscriberToOwner(
          new TaskSubscription(new Task(() => pending, Phase.BlockingTask), scheduler),
          child
        )
      );
    } else {
      scheduler.waitFor(pending, child);
    }
    const effect = runWithOwner(parent, () =>
      createOrderTextExpressionEffect(scheduler, 'parent', order)
    );
    scheduler.notify(sibling);
    scheduler.notify(effect);
    let finished = false;
    const flushing = scheduler.flushInteraction().then(() => {
      finished = true;
    });
    disposeOwner(child);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(finished).toBe(true);
      expect(parent.flags & OwnerFlags.Disposed).toBe(0);
      expect(order).toEqual(['parent', 'sibling']);
    } finally {
      release();
      await flushing;
    }
  });

  it('keeps one owner entry when a subscriber is registered repeatedly', () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner(null);
    const other = createOwner(null);
    const subscriber = createOrderTextExpressionEffect(scheduler, 'effect', []);

    registerSubscriberToOwner(subscriber, owner);
    registerSubscriberToOwner(subscriber, owner);
    expect(ownerItemsLength(owner.items)).toBe(1);

    registerSubscriberToOwner(subscriber, other);
    expect(ownerItemsLength(owner.items)).toBe(0);
    expect(ownerItemsLength(other.items)).toBe(1);

    registerSubscriberToOwner(subscriber, owner);
    expect(ownerItemsLength(owner.items)).toBe(1);
    expect(ownerItemsLength(other.items)).toBe(0);
  });

  it('rejects the explicit flush when one-shot work rejects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    scheduler.waitFor(Promise.reject(new Error('one-shot failed')));

    await expect(scheduler.flushInteraction()).rejects.toThrow('one-shot failed');
  });

  // An unowned queued rejection fails the whole run, not just this test.
  it('owns a queued rejection until the flush awaits it', async () => {
    const scheduler = new Scheduler(noopSchedule);
    scheduler.waitFor(Promise.reject(new Error('deferred failure')));

    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(scheduler.flushInteraction()).rejects.toThrow('deferred failure');
  });

  it('starts all scalar promises before waiting for them', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const started: string[] = [];
    let first!: TextExpressionEffect;
    let second!: TextExpressionEffect;
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    runWithOwner(owner, () => {
      first = createOrderTextExpressionEffect(scheduler, 'first', []);
      second = createOrderTextExpressionEffect(scheduler, 'second', []);
    });
    first.execute = () => {
      started.push('first');
      return firstPromise;
    };
    second.execute = () => {
      started.push('second');
      return secondPromise;
    };

    scheduler.notify(first);
    scheduler.notify(second);
    const flushing = scheduler.flushInteraction();
    for (let i = 0; i < 4 && started.length < 2; i++) {
      await Promise.resolve();
    }

    expect(started).toEqual(['first', 'second']);
    resolveFirst();
    resolveSecond();
    await flushing;
  });

  it('flushes blocking tasks before DOM effects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const order: string[] = [];
    let task!: TaskSubscriber;
    let firstDom!: DomSubscriber;
    let secondDom!: DomSubscriber;

    runWithOwner(owner, () => {
      task = useTaskSubscriber(scheduler, 'task', order);
      firstDom = createOrderTextExpressionEffect(scheduler, 'first-dom', order);
      secondDom = createOrderTextExpressionEffect(scheduler, 'second-dom', order);
    });

    scheduler.notify(secondDom);
    scheduler.notify(firstDom);
    scheduler.notify(task);

    await scheduler.flushInteraction();

    expect(order).toEqual(['task', 'first-dom', 'second-dom']);
  });

  it('handles errors from automatically scheduled flushes', async () => {
    let flush!: () => void;
    let ran = false;
    const scheduler = new Scheduler((scheduledFlush) => {
      flush = scheduledFlush;
    });

    const task = registerSubscriberToOwner(
      new TaskSubscription(
        new Task(() => {
          ran = true;
          throw new Error('scheduled boom');
        }, Phase.BlockingTask),
        scheduler
      ),
      createOwner(null)
    );
    scheduler.notify(task);

    flush();
    await Promise.resolve();

    expect(ran).toBe(true);
  });

  it('runs parent owner work before child owner work', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner();
    const order: string[] = [];
    let parentTask!: TaskSubscriber;
    let childTask!: TaskSubscriber;

    runWithOwner(parent, () => {
      parentTask = useTaskSubscriber(scheduler, 'parent', order);
      const child = createOwner();
      runWithOwner(child, () => {
        childTask = useTaskSubscriber(scheduler, 'child', order);
      });
    });

    scheduler.notify(childTask);
    scheduler.notify(parentTask);

    await scheduler.flushInteraction();

    expect(order).toEqual(['parent', 'child']);
  });

  it('flushes scalar work created by a structural owner without yielding per child', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner();
    const order: number[] = [];
    let observed = 0;
    let structural!: BranchSubscriber;

    runWithOwner(parent, () => {
      structural = registerSubscriberToOwner({
        kind: SubscriberKind.Branch,
        flags: SubscriberFlags.None,
        deps: null,
        owner: null,
        scheduler,
        branch: null!,
        run() {
          for (let i = 0; i < 32; i++) {
            const child = createOwner(parent);
            let effect!: TextExpressionEffect;
            runWithOwner(child, () => {
              effect = createOrderTextExpressionEffect(scheduler, String(i), []);
            });
            effect.execute = () => {
              order.push(i);
              if (i === 0) {
                queueMicrotask(() => (observed = order.length));
              }
            };
            scheduler.notify(effect);
          }
        },
      });
    });

    scheduler.notify(structural);
    await scheduler.flushInteraction();

    expect(order).toHaveLength(32);
    expect(observed).toBe(32);
  });

  it('runs all parent owner phases before descending into child owners', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner();
    const order: string[] = [];
    let parentDeferred!: TaskSubscriber;
    let childBlocking!: TaskSubscriber;

    runWithTestContainer(
      scheduler,
      () => {
        parentDeferred = useTaskSubscriber(scheduler, 'parent:deferred', order, Phase.DeferredTask);
        const child = createOwner();
        runWithOwner(child, () => {
          childBlocking = useTaskSubscriber(scheduler, 'child:blocking', order);
        });
      },
      parent
    );

    scheduler.notify(childBlocking);
    scheduler.notify(parentDeferred);

    await scheduler.flushInteraction();

    expect(order).toEqual(['parent:deferred', 'child:blocking']);
  });

  it('keeps enqueue order for tasks', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const first = useTaskSubscriber(scheduler, 'first', order);
    const second = useTaskSubscriber(scheduler, 'second', order);

    scheduler.notify(first);
    scheduler.notify(second);

    await scheduler.flushInteraction();

    expect(order).toEqual(['first', 'second']);
  });

  it('dedupes scheduled subscribers in one batch', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const scalar = createOrderTextExpressionEffect(scheduler, 'scalar', order);

    scheduler.notify(scalar);
    scheduler.notify(scalar);

    await scheduler.flushInteraction();

    expect(order).toEqual(['scalar']);
  });

  it('skips disposed tasks that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const seen: string[] = [];
    const task = useTaskSubscriber(scheduler, 'task', seen);

    scheduler.notify(task);
    disposeSubscriber(task);
    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual([]);
    expect(task.owner).toBeNull();
  });

  it('registers subscribers with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const count = useSignal(1);
    const text = createText();
    let effect!: DomSubscriber;

    expect(getActiveOwner()).toBeNull();
    runWithOwner(owner, () => {
      expect(getActiveOwner()).toBe(owner);
      effect = createTextNodeEffect(text, count, scheduler);
      expect(owner.items).toBe(effect);
    });
    expect(getActiveOwner()).toBeNull();
    expect(owner.items).toBe(effect);

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('1');
    expect(toArray(count.subs)).toContain(effect);

    disposeOwner(owner);

    expect(owner.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(owner.items).toBeNull();
    expect(count.subs).toBeNull();
  });

  it('materializes lazy root context owners', () => {
    const scheduler = new Scheduler(noopSchedule);
    const context = newInvokeContext({ owner: null });
    const count = useSignal(1);
    let effect!: DomSubscriber;

    invoke(context, () => {
      effect = createTextNodeEffect(createText(), count, scheduler);
    });

    expect(context.owner).not.toBeNull();
    expect(context.owner!.parent).toBeNull();
    expect(context.owner!.items).toBe(effect);
  });

  it('does not allocate useOn state for ordinary invoke contexts', () => {
    const context = newInvokeContext();

    expect('useOnEvents' in context).toBe(false);
    expect('inheritedUseOnEvents' in context).toBe(false);
  });

  it('restores the invoke context in compiler-instrumented async continuations', async () => {
    const context = newInvokeContext({ owner: createOwner(null) });

    const restored = await invoke(context, async () => {
      expect(getActiveInvokeContextOrNull()).toBe(context);
      (await _await(Promise.resolve()))();
      return getActiveInvokeContextOrNull();
    });

    expect(restored).toBe(context);
    await Promise.resolve();
    expect(getActiveInvokeContextOrNull()).toBeNull();
  });

  it('registers subscribers to an explicit owner without duplication', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const sourceOwner = createOwner();
    const count = useSignal(1);
    const effect = runWithOwner(sourceOwner, () =>
      createTextNodeEffect(createText(), count, scheduler)
    );

    expect(owner.items).toBeNull();
    registerSubscriberToOwner(effect, owner);
    registerSubscriberToOwner(effect, owner);
    expect(owner.items).toBe(effect);
    expect(sourceOwner.items).toBeNull();

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(toArray(count.subs)).toContain(effect);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('collapses owner items and preserves disposal LIFO order', () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner(null);
    const order: string[] = [];
    const first = createIdleSubscriber(() => {}, scheduler);
    const second = createIdleSubscriber(() => {}, scheduler);
    first.job.dispose = () => order.push('first');
    second.job.dispose = () => order.push('second');

    registerSubscriberToOwner(first, owner);
    registerSubscriberToOwner(second, owner);
    expect(owner.items).toEqual([first, second]);

    disposeSubscriber(first);
    expect(owner.items).toBe(second);

    // re-attaching a disposed subscriber does not revive it: disposal is terminal
    registerSubscriberToOwner(first, owner);
    disposeOwner(owner);

    expect(order).toEqual(['first', 'second']);
    expect(owner.items).toBeNull();
  });

  it('throws when creating subscribers without an active owner', () => {
    const scheduler = new Scheduler(noopSchedule);
    expect(() => createTextNodeEffect(createText(), useSignal(1), scheduler)).toThrow(
      'Missing active owner context for subscriber'
    );
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
    expect(ownerItemsLength(parent.items)).toBe(2);

    disposeOwner(first);
    disposeOwner(first);

    expect(first.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(first.parent).toBeNull();
    expect(parent.flags & OwnerFlags.Disposed).toBe(0);
    expect(second.flags & OwnerFlags.Disposed).toBe(0);
    expect(second.parent).toBe(parent);
    expect(parent.items).toBe(second);
  });

  it('disposes child owners with their parent owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner();
    const outerSource = useSignal('outer');
    const innerSource = useSignal('inner');
    let child!: Owner;
    let outerEffect!: DomSubscriber;
    let innerEffect!: DomSubscriber;

    runWithOwner(parent, () => {
      outerEffect = createTextNodeEffect(createText(), outerSource, scheduler);
      child = createOwner();
      runWithOwner(child, () => {
        innerEffect = createTextNodeEffect(createText(), innerSource, scheduler);
      });
    });

    expect(parent.items).toEqual([outerEffect, child]);
    expect(child.parent).toBe(parent);
    expect(child.items).toBe(innerEffect);

    scheduler.notify(outerEffect);
    scheduler.notify(innerEffect);
    await scheduler.flushInteraction();

    expect(toArray(outerSource.subs)).toContain(outerEffect);
    expect(toArray(innerSource.subs)).toContain(innerEffect);

    disposeOwner(parent);

    expect(parent.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(child.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(parent.items).toBeNull();
    expect(child.parent).toBeNull();
    expect(outerSource.subs).toBeNull();
    expect(innerSource.subs).toBeNull();
  });

  it('keeps subscriber and owner item order when one is removed', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner(null);
    const source = useSignal('value');
    const rows = [0, 1, 2, 3].map(() => createOwner(parent));
    const effects = rows.map((row) =>
      runWithOwner(row, () => createTextNodeEffect(createText(), source, scheduler))
    );
    effects.forEach((effect) => scheduler.notify(effect));
    await scheduler.flushInteraction();

    disposeOwner(rows[0]);
    disposeOwner(rows[2]);

    // identity, not deep equality: the rows are structurally identical
    const subs = toArray(source.subs);
    const items = toArray(parent.items);
    expect(subs.map((effect) => effects.indexOf(effect as never))).toEqual([1, 3]);
    expect(items.map((row) => rows.indexOf(row as Owner))).toEqual([1, 3]);
  });

  it('releases owner contents and allows new child subscriptions', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner(null);
    const child = createOwner(parent);
    const source = useSignal('value');
    const effect = runWithOwner(child, () => createTextNodeEffect(createText(), source, scheduler));
    scheduler.notify(effect);
    await scheduler.flushInteraction();
    expect(toArray(source.subs)).toContain(effect);

    disposeOwnerItems(parent);

    expect(parent.items).toBeNull();
    expect(parent.flags & OwnerFlags.Disposed).toBe(0);
    expect(child.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(child.parent).toBeNull();
    expect(source.subs).toBeNull();

    const nextChild = createOwner(parent);
    const nextEffect = runWithOwner(nextChild, () =>
      createTextNodeEffect(createText(), source, scheduler)
    );
    expect(nextChild.parent).toBe(parent);
    expect(parent.items).toBe(nextChild);
    scheduler.notify(nextEffect);
    await scheduler.flushInteraction();
    expect(toArray(source.subs)).toContain(nextEffect);
  });

  it('creates disposed child owners under disposed owners', () => {
    const parent = createOwner();
    let child!: Owner;

    disposeOwner(parent);

    runWithOwner(parent, () => {
      child = createOwner();
    });

    expect(parent.items).toBeNull();
    expect(child.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(child.parent).toBeNull();
  });

  it('disposes subscribers registered to disposed owners', () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const sourceOwner = createOwner();
    const effect = runWithOwner(sourceOwner, () =>
      createTextNodeEffect(createText(), useSignal(1), scheduler)
    );

    disposeOwner(owner);
    registerSubscriberToOwner(effect, owner);

    expect(effect.owner).toBeNull();
    expect(sourceOwner.items).toBeNull();
    expect(owner.items).toBeNull();
  });

  it('registers computed subscribers with the active owner', () => {
    const owner = createOwner();
    const count = useSignal(1);
    const doubled = runWithOwner(owner, () => useComputed(() => count.value * 2));

    expect(owner.items).toBe(doubled);
    expect(doubled.value).toBe(2);
    expect(toArray(count.subs)).toContain(doubled);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('registers task subscribers with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const count = useSignal(1);
    const seen: number[] = [];
    let task!: TaskSubscriber;
    let visibleTask!: VisibleTaskSubscriber;

    runWithTestContainer(
      scheduler,
      () => {
        task = useTask(() => seen.push(count.value));
        visibleTask = useVisibleTask(() => seen.push(count.value + 10));
      },
      owner
    );

    expect(owner.items).toEqual([task, visibleTask]);

    scheduler.notify(visibleTask);
    await scheduler.flushInteraction();

    expect(seen).toEqual([1, 11]);
    expect(toArray(count.subs)).toContain(task);
    expect(toArray(count.subs)).toContain(visibleTask);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('does not track dependencies through runWithOwner', () => {
    const scheduler = new Scheduler(noopSchedule);
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));
    const owner = createOwner();
    const tracked = useSignal('tracked');
    const untracked = useSignal('untracked');

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

    expect(tracked.subs).toBe(collector);
    expect(untracked.subs).toBeNull();
  });

  it('restores owner and collector after runWithOwner throws', () => {
    const scheduler = new Scheduler(noopSchedule);
    const parent = createOwner();
    const child = createOwner();
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));

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

  it('useTask tracks dependencies and reruns after signal mutation', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
    const seen: number[] = [];
    const task = runWithTestContainer(scheduler, () =>
      useTask(() => {
        seen.push(count.value);
      })
    );

    expect(seen).toEqual([0]);
    expect(toArray(count.subs)).toContain(task);

    count.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual([0, 1]);
  });

  it('tracks async task dependencies before and after await', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const before = useSignal(0);
    const after = useSignal(10);
    const seen: string[] = [];

    runWithTestContainer(scheduler, () =>
      useTask(async () => {
        seen.push(`before:${before.value}`);
        (await _await(Promise.resolve()))();
        seen.push(`after:${after.value}`);
      })
    );

    await scheduler.flushInteraction();
    before.value = 1;
    await scheduler.flushInteraction();
    after.value = 11;
    await scheduler.flushInteraction();

    expect(seen).toEqual(['before:0', 'after:10', 'before:1', 'after:10', 'before:1', 'after:11']);
  });

  it('restores task tracking when await rejects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const after = useSignal(0);
    const seen: string[] = [];

    runWithTestContainer(scheduler, () =>
      useTask(async () => {
        try {
          (await _await(Promise.reject(new Error('boom'))))();
        } catch (error) {
          seen.push(`${(error as Error).message}:${after.value}`);
        }
      })
    );

    await scheduler.flushInteraction();
    after.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual(['boom:0', 'boom:1']);
  });

  it('does not rerun a pending task unless it was marked dirty', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    let release!: () => void;
    const task = runWithTestContainer(scheduler, () =>
      useTask(() => {
        order.push('run');
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
    );

    const run = runTaskSubscriber(task);
    await Promise.resolve();
    const flush = scheduler.flushInteraction();
    await Promise.resolve();

    expect(order).toEqual(['run']);

    release();
    await run;
    await flush;
    await scheduler.flushInteraction();

    expect(order).toEqual(['run']);
  });

  it.each([
    [
      'cleanup callbacks',
      (
        cleanup: (callback: () => Promise<void>) => void,
        value: number,
        order: string[],
        wait: () => Promise<void>
      ) => {
        cleanup(async () => {
          order.push(`cleanup:${value}:start`);
          await wait();
          order.push(`cleanup:${value}:end`);
        });
      },
    ],
    [
      'returned cleanup',
      (
        _cleanup: (callback: () => Promise<void>) => void,
        value: number,
        order: string[],
        wait: () => Promise<void>
      ) => {
        return async () => {
          order.push(`cleanup:${value}:start`);
          await wait();
          order.push(`cleanup:${value}:end`);
        };
      },
    ],
  ])('awaits async %s before rerun', async (_name, registerCleanup) => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
    const order: string[] = [];
    let releaseCleanup!: () => void;

    runWithTestContainer(scheduler, () =>
      useTask(({ cleanup }) => {
        const value = count.value;
        order.push(`run:${value}`);
        return registerCleanup(cleanup, value, order, () => {
          return new Promise<void>((resolve) => {
            releaseCleanup = resolve;
          });
        });
      })
    );

    await scheduler.flushInteraction();
    count.value = 1;
    const rerun = scheduler.flushInteraction();
    await Promise.resolve();

    expect(order).toEqual(['run:0', 'cleanup:0:start']);

    releaseCleanup();
    await rerun;

    expect(order).toEqual(['run:0', 'cleanup:0:start', 'cleanup:0:end', 'run:1']);
  });

  it('logs cleanup errors without rerunning the task or aborting the flush', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
    const seen: number[] = [];
    const error = new Error('cleanup boom');

    runWithTestContainer(scheduler, () =>
      useTask(({ cleanup }) => {
        seen.push(count.value);
        cleanup(() => {
          throw error;
        });
      })
    );

    await scheduler.flushInteraction();
    count.value = 1;
    // the error is logged and isolated: the flush settles instead of rejecting
    await expect(scheduler.flushInteraction()).resolves.toBeUndefined();

    expect(seen).toEqual([0]);
  });

  it('logs async cleanup errors without rerunning the task', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
    const seen: number[] = [];
    const error = new Error('async cleanup boom');

    runWithTestContainer(scheduler, () =>
      useTask(({ cleanup }) => {
        seen.push(count.value);
        cleanup(async () => {
          await Promise.resolve();
          throw error;
        });
      })
    );

    await scheduler.flushInteraction();
    count.value = 1;
    await expect(scheduler.flushInteraction()).resolves.toBeUndefined();

    expect(seen).toEqual([0]);
  });

  it('awaits async visible task cleanup before rerun', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
    const order: string[] = [];
    let releaseCleanup!: () => void;
    let resolveSecondRun!: () => void;
    const secondRun = new Promise<void>((resolve) => {
      resolveSecondRun = resolve;
    });

    runWithTestContainer(scheduler, () =>
      useVisibleTask(
        ({ cleanup }) => {
          const value = count.value;
          order.push(`run:${value}`);
          if (value === 1) {
            resolveSecondRun();
          }
          cleanup(async () => {
            order.push(`cleanup:${value}:start`);
            await new Promise<void>((resolve) => {
              releaseCleanup = resolve;
            });
            order.push(`cleanup:${value}:end`);
          });
        },
        // the document strategies run at once on the client; the loader trigger has no test here
        { strategy: 'document-ready' }
      )
    );

    await scheduler.flushInteraction();
    count.value = 1;
    await scheduler.flushInteraction();
    await Promise.resolve();

    expect(order).toEqual(['run:0', 'cleanup:0:start']);

    releaseCleanup();
    await secondRun;

    expect(order).toEqual(['run:0', 'cleanup:0:start', 'cleanup:0:end', 'run:1']);
  });

  it('runs deferred tasks without blocking on a deferred queue', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const task = useTaskSubscriber(scheduler, 'deferred', order, Phase.DeferredTask);

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(order).toEqual(['deferred']);
  });

  it('loads unresolved task QRLs before running them', async () => {
    const scheduler = new Scheduler(noopSchedule);
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
    const task = runWithTestContainer(scheduler, () => useTaskQrl(qrl));

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(resolved).toBe(true);
    expect(order).toEqual(['qrl']);
  });

  describe.each([
    ['task', useTaskQrl],
    ['visible task', useVisibleTaskQrl],
  ] as const)('%s raw QRL', (_, createTask) => {
    it('shares code while restoring scopes, tracking after await, and cleaning up', async () => {
      const scheduler = new Scheduler(noopSchedule);
      const firstSource = useSignal(1);
      const firstAfter = useSignal(10);
      const secondSource = useSignal(3);
      const secondAfter = useSignal(20);
      const seen: number[] = [];
      const cleanups: number[] = [];
      const returnedCleanups: number[] = [];
      const contexts: unknown[] = [];
      const receivers: unknown[] = [];
      const container = createCaptureContainer(
        { 0: firstSource, 1: firstAfter, 2: 100 },
        scheduler
      );
      const body = async function (this: unknown, ctx: TaskCtx) {
        const [source, after, offset] = _captures as [Signal<number>, Signal<number>, number];
        contexts.push(getActiveInvokeContextOrNull()?.container);
        receivers.push(this);
        const value = source.value;
        ctx.cleanup(() => {
          cleanups.push(value + offset);
        });
        (await _await(Promise.resolve()))();
        seen.push(value + after.value + offset);
        return () => {
          returnedCleanups.push(value + offset);
        };
      };
      const load = vi.fn(async () => ({ body }));
      const firstQrl = createQRL<TaskFn>('chunk', 'body', null, load, '0 1 1', container);
      const secondQrl = firstQrl.w([secondSource, secondAfter, 200]);
      const first = createOwned(() => createTask(firstQrl), container);
      const second = createOwned(() => createTask(secondQrl), container);
      scheduler.notify(first);
      scheduler.notify(second);
      await scheduler.flushInteraction();
      await Promise.all([first.runPromise, second.runPromise]);

      expect(seen.sort((a, b) => a - b)).toEqual([111, 223]);
      expect(contexts).toEqual([container, container]);
      expect(receivers).toEqual([undefined, undefined]);
      expect(load).toHaveBeenCalledOnce();
      expect(firstQrl.resolved).toBeUndefined();
      expect(secondQrl.resolved).toBeUndefined();
      expect(first.deps).toEqual([firstSource, firstAfter]);
      expect(second.deps).toEqual([secondSource, secondAfter]);

      const reload = vi.spyOn(firstQrl.$lazy$, '$load$');
      firstAfter.value = 11;
      await scheduler.flushInteraction();
      await Promise.all([first.runPromise, second.runPromise]);
      expect(seen.at(-1)).toBe(112);
      expect(cleanups).toEqual([101]);
      expect(returnedCleanups).toEqual([101]);
      expect(reload).not.toHaveBeenCalled();
      disposeSubscriber(first);
      disposeSubscriber(second);
      expect(cleanups).toEqual([101, 101, 203]);
      expect(returnedCleanups).toEqual([101, 101, 203]);
      expect(firstSource.subs).toBeNull();
      expect(firstAfter.subs).toBeNull();
      expect(secondSource.subs).toBeNull();
      expect(secondAfter.subs).toBeNull();
    });

    it('keeps public resolved overrides without loading unused captures', async () => {
      const scheduler = new Scheduler(noopSchedule);
      const load = vi.fn(async () => ({ body: () => {} }));
      const restoreCaptures = vi.fn(async () => ['unused']);
      const qrl = createQRL<TaskFn>('chunk', 'body', null, load, '0', { restoreCaptures } as any);
      const run = vi.fn();
      qrl.resolved = run;
      const task = runWithTestContainer(scheduler, () => createTask(qrl));
      scheduler.notify(task);
      await scheduler.flushInteraction();

      expect(run).toHaveBeenCalledOnce();
      expect(load).not.toHaveBeenCalled();
      expect(restoreCaptures).not.toHaveBeenCalled();
      disposeSubscriber(task);
    });
  });

  it('runs visible tasks in enqueue order', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const second = runWithTestContainer(scheduler, () =>
      useVisibleTask(() => order.push('second'))
    );
    const first = runWithTestContainer(scheduler, () =>
      useVisibleTaskQrl(
        createQRL<TaskFn>(
          'chunk',
          'symbol',
          () => {
            order.push('first');
          },
          null,
          null
        )
      )
    );

    scheduler.notify(second);
    scheduler.notify(first);
    await scheduler.flushInteraction();

    expect(order).toEqual(['second', 'first']);
  });

  it('starts visible tasks independently', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const first = runWithTestContainer(scheduler, () =>
      useVisibleTask(() => {
        order.push('first:start');
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      })
    );
    const second = runWithTestContainer(scheduler, () =>
      useVisibleTask(() => {
        order.push('second:start');
      })
    );

    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();
    resolveFirst?.();

    expect(order).toEqual(['first:start', 'second:start']);
  });

  it('restores serialized captures for task QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const seen: string[] = [];
    const container = createCaptureContainer(
      {
        0: 'task',
        1: 'capture',
      },
      scheduler
    );
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
    const task = createOwned(() => useTaskQrl(qrl), container);

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['task:capture']);
  });

  it('cleans up dynamic dependencies for tasks', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const useA = useSignal(true);
    const a = useSignal('a');
    const b = useSignal('b');
    const seen: string[] = [];
    runWithTestContainer(scheduler, () => useTask(() => seen.push(useA.value ? a.value : b.value)));

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
    const scheduler = new Scheduler(noopSchedule);
    const useA = useSignal(true);
    const a = useSignal('a');
    const b = useSignal('b');
    const seen: string[] = [];
    const task = runWithTestContainer(scheduler, () =>
      useVisibleTask(() => seen.push(useA.value ? a.value : b.value))
    );

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

function createOwned<T>(run: () => T, container?: ContainerContext): T {
  return runWithCollector(
    null,
    invoke,
    newInvokeContext({ owner: createOwner(null), container }),
    run
  );
}
