import { $, _jsxSorted, type JSXOutput, type OnRenderFn, type QRL } from '@qwik.dev/core';

import { createDocument } from '@qwik.dev/core/testing';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { getDomContainer } from '../client/dom-container';
import {
  vnode_insertBefore,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
} from '../client/vnode';
import { Task, TaskFlags } from '../use/use-task';
import type { Props } from './jsx/jsx-runtime';
import type { QRLInternal } from './qrl/qrl-class';
import { createScheduler, type Chore } from './scheduler';
import { ChoreType } from './util-chore-type';
import type { HostElement } from './types';
import { ELEMENT_SEQ, QContainerAttr } from './utils/markers';
import { MAX_RETRY_ON_PROMISE_COUNT } from './utils/promises';
import * as nextTick from './platform/next-tick';
import type { ElementVNode, VirtualVNode, VNode } from '../client/vnode-impl';
import { ChoreArray } from '../client/chore-array';

declare global {
  let testLog: string[];
}

vi.mock('../client/vnode-diff', () => ({
  vnode_diff: vi.fn().mockImplementation(() => {
    testLog.push('vnode-diff');
  }),
}));

describe('scheduler', () => {
  let scheduler: ReturnType<typeof createScheduler> = null!;
  let document: ReturnType<typeof createDocument> = null!;
  let vBody: ElementVNode = null!;
  let vA: ElementVNode = null!;
  let vAHost: VirtualVNode = null!;
  let vB: ElementVNode = null!;
  let vBHost1: VirtualVNode = null!;
  let vBHost2: VirtualVNode = null!;
  let handleError: (err: any, host: HostElement | null) => void;
  let choreQueue: ChoreArray;
  let blockedChores: Set<Chore>;
  let runningChores: Set<Chore>;

  async function waitForDrain() {
    await scheduler(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).testLog = [];
    document = createDocument();
    document.body.setAttribute(QContainerAttr, 'paused');
    const container = getDomContainer(document.body);
    handleError = container.handleError = vi.fn();
    choreQueue = new ChoreArray();
    blockedChores = new Set();
    runningChores = new Set();
    scheduler = createScheduler(
      container,
      () => testLog.push('journalFlush'),
      choreQueue,
      blockedChores,
      runningChores
    );
    document.body.innerHTML = '<a :></a><b :></b>';
    vBody = vnode_newUnMaterializedElement(document.body);
    vA = vnode_locate(vBody, document.querySelector('a') as Element) as ElementVNode;
    vAHost = vnode_newVirtual();
    vAHost.setProp('q:id', 'A');
    vnode_insertBefore([], vA, vAHost, null);
    vB = vnode_locate(vBody, document.querySelector('b') as Element) as ElementVNode;
    vBHost1 = vnode_newVirtual();
    vBHost1.setProp('q:id', 'b1');
    vBHost2 = vnode_newVirtual();
    vBHost2.setProp('q:id', 'b2');
    vnode_insertBefore([], vB, vBHost1, null);
    vnode_insertBefore([], vB, vBHost2, null);
  });

  it('should execute sort tasks', async () => {
    scheduler(ChoreType.TASK, mockTask(vBHost1, { index: 2, qrl: $(() => testLog.push('b1.2')) }));
    scheduler(ChoreType.TASK, mockTask(vAHost, { qrl: $(() => testLog.push('a1')) }));
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await waitForDrain();
    expect(testLog).toEqual([
      'a1', // DepthFirst a host component is before b host component.
      'b1.0', // Same component but smaller index.
      'b1.2', // Same component but larger index.
      'journalFlush',
    ]);
  });
  it('should execute visible tasks after journal flush', async () => {
    scheduler(
      ChoreType.TASK,
      mockTask(vBHost2, { index: 2, qrl: $(() => testLog.push('b2.2: Task')) })
    );
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0: Task')) }));
    scheduler(
      ChoreType.VISIBLE,
      mockTask(vBHost2, {
        index: 2,
        qrl: $(() => testLog.push('b2.2: VisibleTask')),
        visible: true,
      })
    );
    scheduler(
      ChoreType.VISIBLE,
      mockTask(vBHost1, {
        qrl: $(() => {
          testLog.push('b1.0: VisibleTask');
        }),
        visible: true,
      })
    );
    scheduler(
      ChoreType.COMPONENT,
      vBHost1 as HostElement,
      $(() => testLog.push('b1: Render')) as unknown as QRLInternal<OnRenderFn<unknown>>,
      {} as Props
    );
    await waitForDrain();
    // TODO: is it right?
    expect(testLog).toEqual([
      'b1.0: Task',
      'b1: Render',
      'vnode-diff',
      'b2.2: Task',
      'journalFlush',
      'b1.0: VisibleTask',
      'journalFlush',
      'b2.2: VisibleTask',
      'journalFlush',
    ]);
  });

  it('should execute chore', async () => {
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'journalFlush']);
  });

  it('should execute chore with promise', async () => {
    vi.useFakeTimers();
    scheduler(
      ChoreType.TASK,
      mockTask(vBHost1, {
        qrl: $(
          () =>
            new Promise<void>((resolve) =>
              setTimeout(() => {
                testLog.push('b1.0');
                resolve();
              }, 100)
            )
        ),
      })
    );
    vi.advanceTimersByTimeAsync(100);
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'journalFlush']);
    vi.useRealTimers();
  });

  it('should execute multiple chores', async () => {
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.1')), index: 1 }));
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'b1.1', 'journalFlush']);
  });

  it('should execute chore with promise and schedule blocked vnode-diff chores', async () => {
    scheduler(
      ChoreType.COMPONENT,
      vBHost1 as HostElement,
      $(() => testLog.push('component')) as unknown as QRLInternal<OnRenderFn<unknown>>,
      {}
    );
    scheduler(
      ChoreType.NODE_DIFF,
      vBHost1 as HostElement,
      vBHost1 as HostElement,
      _jsxSorted('div', null, null, null, 0, null) as JSXOutput
    );
    await waitForDrain();
    expect(testLog).toEqual([
      // component + component vnode-diff
      'component',
      'vnode-diff',
      // vnode-diff chore
      'vnode-diff',
      'journalFlush',
    ]);
  });

  it('should execute chores in two ticks', async () => {
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await waitForDrain();
    scheduler(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.1')) }));
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'journalFlush', 'b1.1', 'journalFlush']);
  });

  it('should not go into infinity loop on thrown promise', async () => {
    (globalThis as any).executionCounter = vi.fn();

    scheduler(
      ChoreType.COMPONENT,
      vBHost1 as HostElement,
      $(() => {
        (globalThis as any).executionCounter();
        throw Promise.resolve(null);
      }) as unknown as QRLInternal<OnRenderFn<unknown>>,
      {}
    );
    await waitForDrain();
    expect((globalThis as any).executionCounter).toHaveBeenCalledTimes(
      MAX_RETRY_ON_PROMISE_COUNT + 1
    );
    expect(handleError).toHaveBeenCalledTimes(1);
    (globalThis as any).executionCounter = undefined;
  });

  it('should not go into infinity loop on thrown promise', async () => {
    (globalThis as any).counter = 0;
    scheduler(
      ChoreType.COMPONENT,
      vBHost1 as HostElement,
      $(() => {
        testLog.push('component');
        (globalThis as any).counter++;
        if ((globalThis as any).counter === 1) {
          throw Promise.resolve(null);
        }
      }) as unknown as QRLInternal<OnRenderFn<unknown>>,
      {}
    );
    await waitForDrain();
    expect(testLog).toEqual(['component', 'component', 'vnode-diff', 'journalFlush']);
    (globalThis as any).counter = undefined;
  });

  it('should block tasks in the same component', async () => {
    const task1 = mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')), index: 0 });
    const task2 = mockTask(vBHost1, { qrl: $(() => testLog.push('b1.1')), index: 1 });
    const task3 = mockTask(vBHost1, { qrl: $(() => testLog.push('b1.2')), index: 2 });

    vBHost1.setProp(ELEMENT_SEQ, [task1, task2, task3]);

    scheduler(ChoreType.TASK, task1);
    scheduler(ChoreType.TASK, task2);
    scheduler(ChoreType.TASK, task3);
    // schedule only first task
    expect(choreQueue.length).toBe(1);
    // block the rest
    expect(blockedChores.size).toBe(2);
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'b1.1', 'b1.2', 'journalFlush']);
  });

  describe('flushing', () => {
    let scheduler: ReturnType<typeof createScheduler> = null!;
    let document: ReturnType<typeof createDocument> = null!;
    let vBHost1: VirtualVNode = null!;

    let nextTickSpy: Mocked<any>;

    async function waitForDrain() {
      await scheduler(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      nextTickSpy = vi.spyOn(nextTick, 'createNextTick');
      (globalThis as any as { testLog: string[] }).testLog = [];
      document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const container = getDomContainer(document.body);
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      scheduler = createScheduler(
        container,
        () => testLog.push('journalFlush'),
        choreQueue,
        blockedChores,
        runningChores
      );
      document.body.innerHTML = '<a :></a><b :></b>';
      vnode_newUnMaterializedElement(document.body);
      vBHost1 = vnode_newVirtual();
      vBHost1.setProp('q:id', 'b1');
    });

    it('should flush journal periodically', async () => {
      (globalThis as any).time = 0;
      const performance = {
        now: () => (globalThis as any).time,
      };
      vi.stubGlobal('performance', performance);

      const FREQUENCY_MS = Math.floor(1000 / 60);

      // Schedule a bunch of tasks
      for (let i = 0; i < 10; i++) {
        scheduler(
          ChoreType.TASK,
          mockTask(vBHost1, {
            index: i,
            qrl: $(() => {
              testLog.push(`b1.${i}`);
              (globalThis as any).time += FREQUENCY_MS / 5; // Each task takes some time
            }),
          })
        );
      }

      await waitForDrain();

      expect(testLog).toEqual([
        // First batch of tasks
        'b1.0',
        'b1.1',
        'b1.2',
        'b1.3',
        'b1.4',
        'b1.5',
        'journalFlush', // Should flush after exactly 16.67ms (5 tasks × 3.33ms)
        // Second batch of tasks
        'b1.6',
        'b1.7',
        'b1.8',
        'b1.9',
        'journalFlush', // Final flush
      ]);
    });

    it('should maintain flushBudgetStart across multiple drain calls', async () => {
      (globalThis as any).time = 0;
      const performance = {
        now: () => (globalThis as any).time,
      };
      vi.stubGlobal('performance', performance);

      const FREQUENCY_MS = Math.floor(1000 / 60);

      // First drain: Schedule tasks that take less than 16ms
      for (let i = 0; i < 3; i++) {
        scheduler(
          ChoreType.TASK,
          mockTask(vBHost1, {
            index: i,
            qrl: $(() => {
              testLog.push(`batch1.${i}`);
              (globalThis as any).time += FREQUENCY_MS / 6; // Each task takes ~2.67ms
            }),
          })
        );
      }

      // First drain call - executes tasks and flushes at end (3 × 2.67ms = 8ms < 16ms)
      await waitForDrain();

      // Verify first batch executed with journal flush at end
      expect(testLog).toEqual(['batch1.0', 'batch1.1', 'batch1.2', 'journalFlush']);

      // Reset time to test flushBudgetStart is reset after journal flush
      (globalThis as any).time = 0;

      // Second drain: Schedule many tasks that should trigger mid-drain flush
      for (let i = 0; i < 8; i++) {
        scheduler(
          ChoreType.TASK,
          mockTask(vBHost1, {
            index: i,
            qrl: $(() => {
              testLog.push(`batch2.${i}`);
              (globalThis as any).time += FREQUENCY_MS / 5; // Each task takes ~3.2ms
            }),
          })
        );
      }

      // Second drain call - should trigger journal flush mid-drain when time >= 16ms
      await waitForDrain();

      expect(testLog).toEqual([
        // First batch
        'batch1.0',
        'batch1.1',
        'batch1.2',
        'journalFlush', // End of first drain
        // Second batch - should flush after batch2.5 (when now = 16ms at start of batch2.5)
        'batch2.0',
        'batch2.1',
        'batch2.2',
        'batch2.3',
        'batch2.4',
        'batch2.5',
        'journalFlush', // Mid-drain flush when time >= 16ms
        // Remaining tasks
        'batch2.6',
        'batch2.7',
        'journalFlush', // Final flush at end of drain
      ]);

      expect(nextTickSpy).toHaveBeenCalledTimes(2);
    });
  });
});

function mockTask(host: VNode, opts: { index?: number; qrl?: QRL; visible?: boolean }): Task {
  return new Task(
    opts.visible ? TaskFlags.VISIBLE_TASK : TaskFlags.TASK,
    opts.index || 0,
    host as any,
    opts.qrl || ($(() => null) as any),
    null!,
    null!
  );
}
