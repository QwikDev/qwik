import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../shared/qrl/qrl-class';
import {
  createCaptureContainer,
  createOrderTextExpressionEffect,
  useTaskSubscriber,
  createText,
  noopSchedule,
  runWithTestContainer,
} from '../test-utils';
import { disposeSubscriber } from '../reactive/cleanup';
import { OwnerFlags, SubscriberFlags } from '../reactive/flags';
import { useSignal, useComputed } from '../reactive/public-api';
import { _await, getActiveCollector, runWithCollector } from '../reactive/tracking';
import { createTextNodeEffect } from '../dom/effect/text-effect';
import {
  createOwner,
  disposeOwner,
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './owner';
import { getActiveInvokeContextOrNull, invoke, newInvokeContext } from './invoke-context';
import { Scheduler } from './scheduler';
import { runTaskSubscriber } from './run-task';
import {
  SubscriberKind,
  type BranchSubscriber,
  type DomSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import { useTask, useTaskQrl, useVisibleTask, useVisibleTaskQrl, type TaskFn } from './task';
import type { ContainerContext } from './container-context';

describe('runtime scheduler and owner lifecycle', () => {
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

  it('rejects the explicit flush when one-shot work rejects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    scheduler.waitFor(Promise.reject(new Error('one-shot failed')));

    await expect(scheduler.flushInteraction()).rejects.toThrow('one-shot failed');
  });

  it('starts all scalar promises before waiting for them', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const started: string[] = [];
    let first!: DomSubscriber;
    let second!: DomSubscriber;
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
    first.effect.run = () => {
      started.push('first');
      return firstPromise;
    };
    second.effect.run = () => {
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

    runWithTestContainer(scheduler, () =>
      useTask(() => {
        ran = true;
        throw new Error('scheduled boom');
      })
    );

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
        depVersions: null,
        owner: null,
        scheduler,
        branch: null!,
        run() {
          for (let i = 0; i < 32; i++) {
            const child = createOwner(parent);
            let effect!: DomSubscriber;
            runWithOwner(child, () => {
              effect = createOrderTextExpressionEffect(scheduler, String(i), []);
            });
            effect.effect.run = () => {
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
        parentDeferred = useTask(
          () => {
            order.push('parent:deferred');
          },
          { deferUpdates: false }
        );
        const child = createOwner();
        runWithOwner(child, () => {
          childBlocking = useTask(() => {
            order.push('child:blocking');
          });
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
    const task = runWithTestContainer(scheduler, () => useTask(() => seen.push('task')));

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
      expect(owner.items).toEqual([effect]);
    });
    expect(getActiveOwner()).toBeNull();
    expect(owner.items).toEqual([effect]);

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('1');
    expect(count.subs).toContain(effect);

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
    expect(context.owner!.items).toEqual([effect]);
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
    expect(owner.items).toEqual([effect]);
    expect(sourceOwner.items).toBeNull();

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
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
    expect(parent.items).toHaveLength(2);

    disposeOwner(first);
    disposeOwner(first);

    expect(first.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(first.parent).toBeNull();
    expect(parent.flags & OwnerFlags.Disposed).toBe(0);
    expect(second.flags & OwnerFlags.Disposed).toBe(0);
    expect(second.parent).toBe(parent);
    expect(parent.items).toEqual([second]);
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
    expect(child.items).toEqual([innerEffect]);

    scheduler.notify(outerEffect);
    scheduler.notify(innerEffect);
    await scheduler.flushInteraction();

    expect(outerSource.subs).toContain(outerEffect);
    expect(innerSource.subs).toContain(innerEffect);

    disposeOwner(parent);

    expect(parent.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(child.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(parent.items).toBeNull();
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

    expect(owner.items).toEqual([doubled]);
    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

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

    expect(tracked.subs).toEqual([collector]);
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

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual([0]);
    expect(count.subs).toContain(task);

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

  it('throws cleanup errors without rerunning the task', async () => {
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
    await expect(scheduler.flushInteraction()).rejects.toBe(error);

    expect(seen).toEqual([0]);
  });

  it('rejects async cleanup errors without rerunning the task', async () => {
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
    await expect(scheduler.flushInteraction()).rejects.toBe(error);

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
      useVisibleTask(({ cleanup }) => {
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
      })
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
    const task = runWithTestContainer(scheduler, () =>
      useTask(() => order.push('deferred'), {
        deferUpdates: false,
      })
    );

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
    const task = runWithTestContainer(scheduler, () =>
      useTask(() => seen.push(useA.value ? a.value : b.value))
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
