import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../../shared/qrl/qrl-class';
import {
  createCaptureContainer,
  createIdleSubscriber,
  noopSchedule,
  runWithTestContainer,
} from '../test-utils';
import { disposeSubscriber } from './cleanup';
import { Computed, createComputed } from './computed';
import { createComputedQrl } from './computed-qrl';
import { createSignal } from './signal';
import { runWithCollector } from './tracking';
import { Scheduler } from '../runtime/scheduler';
import { createTask } from '../runtime/task';
import { createOwner, runWithOwner } from '../runtime/owner';

describe('reactive primitives', () => {
  it('notifies signal subscribers and skips Object.is-equal writes', async () => {
    const count = createSignal(0);
    const scheduler = new Scheduler(noopSchedule);
    let notifications = 0;
    const subscriber = createIdleSubscriber(() => {
      notifications++;
    }, scheduler);

    count.subs = [subscriber];
    count.value = 0;

    expect(notifications).toBe(0);
    expect(count.version).toBe(0);

    count.value = 1;
    await scheduler.flushInteraction();

    expect(notifications).toBe(1);
    expect(count.version).toBe(1);
  });

  it('keeps computed values lazy and cached until a dependency changes', () => {
    const count = createSignal(1);
    let runs = 0;
    const doubled = createOwned(() =>
      createComputed(() => {
        runs++;
        return count.value * 2;
      })
    );

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
    const [doubled, quadrupled] = createOwned(() => {
      const doubled = createComputed(() => {
        doubledRuns++;
        return count.value * 2;
      });
      const quadrupled = createComputed(() => {
        quadrupledRuns++;
        return doubled.value * 2;
      });
      return [doubled, quadrupled] as const;
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
    const selected = createOwned(() =>
      createComputed(() => {
        runs++;
        return useA.value ? a.value : b.value;
      })
    );

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
    const doubled = createOwned(() => createComputed(() => count.value * 2));

    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

    disposeSubscriber(doubled);

    expect(count.subs).toBeNull();
  });

  it('reads cached disposed computed values without tracking', () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(1);
    const collector = runWithTestContainer(scheduler, () => createTask(() => {}));
    let runs = 0;
    const doubled = createOwned(() =>
      createComputed(() => {
        runs++;
        return count.value * 2;
      })
    );

    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);

    disposeSubscriber(doubled);
    count.value = 2;

    runWithCollector(collector, () => {
      expect(doubled.value).toBe(2);
    });

    expect(runs).toBe(1);
    expect(count.subs).toBeNull();
    expect(doubled.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });

  it('throws when reading a disposed computed without a cached value', () => {
    const doubled = createOwned(() => createComputed(() => 2));

    disposeSubscriber(doubled);

    expect(() => doubled.value).toThrow('Cannot read disposed computed without cached value');
  });

  it('clears computed subscribers when disposed', () => {
    const count = createSignal(1);
    let runs = 0;
    const [doubled, quadrupled] = createOwned(() => {
      const doubled = createComputed(() => {
        runs++;
        return count.value * 2;
      });
      const quadrupled = createComputed(() => doubled.value * 2);
      return [doubled, quadrupled] as const;
    });

    expect(quadrupled.value).toBe(4);
    expect(doubled.subs).toContain(quadrupled);

    disposeSubscriber(doubled);
    count.value = 2;

    expect(doubled.subs).toBeNull();
    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);
  });

  it('throws on circular computed dependencies', () => {
    let circular!: Computed<number>;
    createOwned(() => {
      circular = createComputed(() => circular.value + 1);
    });

    expect(() => circular.value).toThrow('Circular computed dependency');
  });

  it('runs resolved computed QRLs synchronously', () => {
    const computed = createOwned(() =>
      createComputedQrl(createQRL('chunk', 'symbol', () => 'computed', null, null))
    );

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
    const computed = createOwned(() => createComputedQrl(qrl));
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
    const computed = createOwned(() => createComputedQrl(qrl, container));
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
});

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}
