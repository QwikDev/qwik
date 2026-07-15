import { describe, expect, it } from 'vitest';
import { SERIALIZABLE_STATE } from '../shared/component.public';
import { _captures, createQRL } from '../shared/qrl/qrl-class';
import {
  createCaptureContainer,
  createIdleSubscriber,
  noopSchedule,
  runWithTestContainer,
} from '../test-utils';
import { disposeSubscriber } from './cleanup';
import { Computed } from './computed';
import { ComputedQrl } from './computed-qrl';
import { _wrapArray, useComputedQrl, useComputed, useConstant, useSignal } from './public-api';
import { readSourceValue, type Source } from './source';
import { runWithCollector } from './tracking';
import { Scheduler } from '../runtime/scheduler';
import { useTask } from '../runtime/task';
import { createOwner, runWithOwner } from '../runtime/owner';

describe('reactive primitives', () => {
  it('creates constants without hook state or dependency tracking', () => {
    const scheduler = new Scheduler(noopSchedule);
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));
    const source = useSignal(2);
    let runs = 0;

    const value = runWithCollector(collector, () =>
      useConstant(
        (left: number, right: number) => {
          runs++;
          return source.value + left + right;
        },
        3,
        4
      )
    );

    expect(value).toBe(9);
    expect(runs).toBe(1);
    expect(collector.deps).toBeNull();
    expect(source.subs).toBeNull();
    expect(useConstant('constant')).toBe('constant');
  });

  it('keeps Qwik component functions as constant values', () => {
    const component = () => 'component';
    (component as any)[SERIALIZABLE_STATE] = [];

    expect(useConstant(component)).toBe(component);
  });

  it('notifies signal subscribers and skips Object.is-equal writes', async () => {
    const count = useSignal(0);
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
    const count = useSignal(1);
    let runs = 0;
    const doubled = createOwned(() =>
      useComputed(() => {
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

  it('returns a plain array when an array wrapper collects no dependencies', () => {
    const owner = createOwner(null);
    let runs = 0;
    const array = runWithOwner(owner, () =>
      _wrapArray(
        createQRL(
          'chunk',
          'static-array',
          () => {
            runs++;
            return [1, 2];
          },
          null,
          null
        )
      )
    );

    expect(array).toEqual([1, 2]);
    expect(array).not.toBeInstanceOf(ComputedQrl);
    expect(runs).toBe(1);
    expect(owner.items).toBeNull();
  });

  it('keeps a computed source when the collection requires a reactive index', () => {
    const owner = createOwner(null);
    const array = runWithOwner(owner, () =>
      _wrapArray(
        createQRL('chunk', 'static-array-source', () => [1, 2], null, null),
        true
      )
    );

    expect(array).toBeInstanceOf(ComputedQrl);
    expect(owner.items).not.toBeNull();
  });

  it('returns a computed source for a derived reactive array', () => {
    const left = useSignal<readonly number[]>([1]);
    const right = useSignal<readonly number[]>([2]);
    let runs = 0;
    const array = createOwned(() =>
      _wrapArray(
        createQRL(
          'chunk',
          'array',
          () => {
            runs++;
            return [...left.value, ...right.value];
          },
          null,
          null
        )
      )
    );

    expect(array).toBeInstanceOf(ComputedQrl);
    const source = array as Source<readonly number[]>;
    expect(runs).toBe(1);
    expect(readSourceValue(source)).toEqual([1, 2]);
    expect(runs).toBe(1);

    left.value = [3];

    expect(readSourceValue(source)).toEqual([3, 2]);
    expect(runs).toBe(2);
  });

  it('propagates computed dirty state through computed chains lazily', () => {
    const count = useSignal(1);
    let doubledRuns = 0;
    let quadrupledRuns = 0;
    const [, quadrupled] = createOwned(() => {
      const doubled = useComputed(() => {
        doubledRuns++;
        return count.value * 2;
      });
      const quadrupled = useComputed(() => {
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
    const useA = useSignal(true);
    const a = useSignal('a');
    const b = useSignal('b');
    let runs = 0;
    const selected = createOwned(() =>
      useComputed(() => {
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
    const count = useSignal(1);
    const doubled = createOwned(() => useComputed(() => count.value * 2));

    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

    disposeSubscriber(doubled);

    expect(count.subs).toBeNull();
  });

  it('reads cached disposed computed values without tracking', () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(1);
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));
    let runs = 0;
    const doubled = createOwned(() =>
      useComputed(() => {
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
    const doubled = createOwned(() => useComputed(() => 2));

    disposeSubscriber(doubled);

    expect(() => doubled.value).toThrow('Cannot read disposed computed without cached value');
  });

  it('clears computed subscribers when disposed', () => {
    const count = useSignal(1);
    let runs = 0;
    const [doubled, quadrupled] = createOwned(() => {
      const doubled = useComputed(() => {
        runs++;
        return count.value * 2;
      });
      const quadrupled = useComputed(() => doubled.value * 2);
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
      circular = useComputed(() => circular.value + 1);
    });

    expect(() => circular.value).toThrow('Circular computed dependency');
  });

  it('runs resolved computed QRLs synchronously', () => {
    const computed = createOwned(() =>
      useComputedQrl(createQRL('chunk', 'symbol', () => 'computed', null, null))
    );

    expect(computed.value).toBe('computed');
  });

  it('throws unresolved computed QRL promises and computes after resolve', async () => {
    let loadCount = 0;
    const qrl = createQRL(
      'chunk',
      'symbol',
      null,
      async () => {
        loadCount++;
        return { symbol: () => 'resolved-computed' };
      },
      null
    );
    const computed = createOwned(() => useComputedQrl(qrl));
    let pending: unknown;

    expect(loadCount).toBe(1);

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
    const computed = createOwned(() => useComputedQrl(qrl, container));
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
