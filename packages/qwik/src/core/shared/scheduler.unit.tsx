import { $, _jsxSorted, type JSXOutput, type OnRenderFn, type QRL } from '@qwik.dev/core';

import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
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
import { addChore, createScheduler, type Chore } from './scheduler';
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

  describe('deadline-based async flushing', () => {
    let scheduler: ReturnType<typeof createScheduler> = null!;
    let document: ReturnType<typeof createDocument> = null!;
    let vHost: VirtualVNode = null!;

    async function waitForDrain() {
      await scheduler(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      (globalThis as any).testLog = [];
      vi.useFakeTimers();
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
      vnode_newUnMaterializedElement(document.body);
      vHost = vnode_newVirtual();
      vHost.setProp('q:id', 'host');
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('fast async (<16ms) + long async (>16ms): flush at ~16ms while long runs', async () => {
      const FREQUENCY_MS = Math.floor(1000 / 60);
      // Fast async (5ms)
      scheduler(
        ChoreType.TASK,
        mockTask(vHost, {
          index: 0,
          qrl: $(
            () =>
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  testLog.push('fastAsync');
                  resolve();
                }, 5)
              )
          ),
        })
      );
      // Long async (1000ms)
      scheduler(
        ChoreType.TASK,
        mockTask(vHost, {
          index: 1,
          qrl: $(
            () =>
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  testLog.push('longAsync');
                  resolve();
                }, 1000)
              )
          ),
        })
      );

      // Advance to 5ms: fast async resolves
      await vi.advanceTimersByTimeAsync(5);
      expect(testLog).toEqual([
        // end of queue flush
        'journalFlush',
        // task execution
        'fastAsync',
      ]);

      await vi.advanceTimersByTimeAsync(FREQUENCY_MS - 5);

      // Flush should have occurred before longAsync finishes
      expect(testLog).toEqual([
        // end of queue flush
        'journalFlush',
        // task execution
        'fastAsync',
        // after task execution flush
        'journalFlush',
      ]);

      // Finish long async
      await vi.advanceTimersByTimeAsync(1000 - FREQUENCY_MS);

      // Now long async completes and a final flush happens at end of drain
      const drainPromise = waitForDrain();
      // Need to advance timers to process the nextTick that waitForDrain schedules
      await vi.advanceTimersByTimeAsync(0);
      await drainPromise;

      expect(testLog).toEqual([
        // end of queue flush
        'journalFlush',
        // task execution
        'fastAsync',
        // after task execution flush
        'journalFlush',
        'longAsync',
        'journalFlush',
        // TODO: not sure why this is here, but seems related to the vi.advanceTimersByTimeAsync(0) above
        'journalFlush',
      ]);
    });

    it('multiple fast async (<16ms total): do not flush between, only after', async () => {
      const FREQUENCY_MS = Math.floor(1000 / 60);
      // Two fast async chores: 5ms and 6ms (total 11ms < 16ms)
      scheduler(
        ChoreType.TASK,
        mockTask(vHost, {
          index: 0,
          qrl: $(
            () =>
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  testLog.push('fast1');
                  resolve();
                }, 5)
              )
          ),
        })
      );
      scheduler(
        ChoreType.TASK,
        mockTask(vHost, {
          index: 1,
          qrl: $(
            () =>
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  testLog.push('fast2');
                  resolve();
                }, 6)
              )
          ),
        })
      );

      // First resolves at 5ms
      await vi.advanceTimersByTimeAsync(5);
      expect(testLog).toEqual([
        // end of queue flush
        'journalFlush',
        'fast1',
      ]);

      // Second resolves at 11ms
      await vi.advanceTimersByTimeAsync(6);
      expect(testLog).toEqual([
        // end of queue flush
        'journalFlush',
        'fast1',
        'fast2',
      ]);

      await vi.advanceTimersByTimeAsync(FREQUENCY_MS - 11);

      expect(testLog).toEqual([
        // end of queue flush
        'journalFlush',
        'fast1',
        'fast2',
        // journal flush after fast1/fast2 chore
        'journalFlush',
      ]);
    });
  });

  describe('addChore', () => {
    let choreArray: ChoreArray;
    let vHost: VirtualVNode;

    beforeEach(() => {
      choreArray = new ChoreArray();
      vHost = vnode_newVirtual();
      vHost.setProp('q:id', 'testHost');
    });

    it('should add a new chore to the choreArray', () => {
      const task = mockTask(vHost, { qrl: $(() => testLog.push('task1')) });
      const chore: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task.$index$,
        $host$: vHost as HostElement,
        $target$: null,
        $payload$: task,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      addChore(chore, choreArray);

      expect(choreArray.length).toBe(1);
      expect(choreArray[0]).toBe(chore);
    });

    it('should add chore to vnode host.chores when idx is negative', () => {
      const task = mockTask(vHost, { qrl: $(() => testLog.push('task1')) });
      const chore: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task.$index$,
        $host$: vHost as HostElement,
        $target$: null,
        $payload$: task,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      addChore(chore, choreArray);

      expect(vHost.chores).toBeDefined();
      expect(vHost.chores!.length).toBe(1);
      expect(vHost.chores![0]).toBe(chore);
    });

    it('should not add to vnode host.chores when chore already exists (idx >= 0)', () => {
      const task = mockTask(vHost, { qrl: $(() => testLog.push('task1')) });
      const chore1: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task.$index$,
        $host$: vHost as HostElement,
        $target$: null,
        $payload$: task,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      const chore2: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task.$index$,
        $host$: vHost as HostElement,
        $target$: null,
        $payload$: task,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      addChore(chore1, choreArray);
      addChore(chore2, choreArray);

      // choreArray should only have 1 chore (the existing one with updated payload)
      expect(choreArray.length).toBe(1);
      // vHost.chores should only have 1 chore (from first add)
      expect(vHost.chores!.length).toBe(1);
    });

    it('should not add to host.chores when host is not a VNode', () => {
      const nonVNodeHost = {} as HostElement;
      const task = mockTask(vHost, { qrl: $(() => testLog.push('task1')) });
      const chore: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task.$index$,
        $host$: nonVNodeHost,
        $target$: null,
        $payload$: task,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      addChore(chore, choreArray);

      expect(choreArray.length).toBe(1);
      expect((nonVNodeHost as any).chores).toBeUndefined();
    });

    it('should maintain correct sort order when adding multiple chores', () => {
      const task1 = mockTask(vAHost, { qrl: $(() => testLog.push('a1')), index: 0 });
      const task2 = mockTask(vBHost1, { qrl: $(() => testLog.push('b1')), index: 0 });
      const task3 = mockTask(vAHost, { qrl: $(() => testLog.push('a2')), index: 1 });

      const chore1: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task1.$index$,
        $host$: vAHost as HostElement,
        $target$: null,
        $payload$: task1,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      const chore2: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task2.$index$,
        $host$: vBHost1 as HostElement,
        $target$: null,
        $payload$: task2,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      const chore3: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task3.$index$,
        $host$: vAHost as HostElement,
        $target$: null,
        $payload$: task3,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      // Add in non-sorted order
      addChore(chore2, choreArray);
      addChore(chore3, choreArray);
      addChore(chore1, choreArray);

      expect(choreArray.length).toBe(3);
      // Should be sorted: vAHost tasks before vBHost1 tasks, and by index within same host
      expect(choreArray[0]).toBe(chore1); // vAHost, index 0
      expect(choreArray[1]).toBe(chore3); // vAHost, index 1
      expect(choreArray[2]).toBe(chore2); // vBHost1, index 0
    });

    it('should add chores of different types in correct macro order', () => {
      const task1 = mockTask(vHost, { qrl: $(() => testLog.push('task')), index: 0 });
      const visibleTask = mockTask(vHost, {
        qrl: $(() => testLog.push('visible')),
        index: 0,
        visible: true,
      });

      const taskChore: Chore = {
        $type$: ChoreType.TASK,
        $idx$: task1.$index$,
        $host$: vHost as HostElement,
        $target$: null,
        $payload$: task1,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      const visibleChore: Chore = {
        $type$: ChoreType.VISIBLE,
        $idx$: visibleTask.$index$,
        $host$: vHost as HostElement,
        $target$: null,
        $payload$: visibleTask,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: undefined,
        $endTime$: undefined,
        $resolve$: undefined,
        $reject$: undefined,
        $returnValue$: null!,
      };

      // Add visible task first
      addChore(visibleChore, choreArray);
      // Add regular task second
      addChore(taskChore, choreArray);

      expect(choreArray.length).toBe(2);
      // TASK should come before VISIBLE (different macro order)
      expect(choreArray[0]).toBe(taskChore);
      expect(choreArray[1]).toBe(visibleChore);
    });
  });

  describe('getRunningChore', () => {
    let scheduler: ReturnType<typeof createScheduler> = null!;
    let choreQueue: ChoreArray;
    let blockedChores: Set<Chore>;
    let runningChores: Set<Chore>;
    let vHost: VirtualVNode;

    beforeEach(() => {
      vi.clearAllMocks();
      (globalThis as any).testLog = [];
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const container = getDomContainer(document.body);
      choreQueue = new ChoreArray();
      blockedChores = new Set();
      runningChores = new Set();

      // Mock nextTick to prevent automatic draining of chores
      vi.spyOn(nextTick, 'createNextTick').mockReturnValue(() => {});

      scheduler = createScheduler(
        container,
        () => testLog.push('journalFlush'),
        choreQueue,
        blockedChores,
        runningChores
      );
      vHost = vnode_newVirtual();
      vHost.setProp('q:id', 'test-host');
    });

    afterEach(() => {
      // Restore all mocks to prevent interference with other tests
      vi.restoreAllMocks();
    });

    it('should return false when there are no running chores', async () => {
      const mockHost = vnode_newVirtual();
      mockHost.setProp('q:id', 'test-1');
      scheduler(ChoreType.COMPONENT, mockHost as any, {} as any, null);

      // The chore should be scheduled (not blocked)
      expect(choreQueue.length).toBe(1);
      expect(blockedChores.size).toBe(0);
    });

    it('should return false when running chores do not match', async () => {
      const mockHost1 = vnode_newVirtual();
      mockHost1.setProp('q:id', 'host-1');
      const mockHost2 = vnode_newVirtual();
      mockHost2.setProp('q:id', 'host-2');

      // Create and start first chore
      const chore1 = scheduler(ChoreType.COMPONENT, mockHost1 as any, {} as any, null);
      runningChores.add(chore1!);

      // Schedule a different chore
      const chore2 = scheduler(ChoreType.COMPONENT, mockHost2 as any, {} as any, null);

      // chore2 should be scheduled normally since it doesn't match chore1
      expect(choreQueue.some((c) => c === chore2)).toBe(true);
      expect(chore1!.$blockedChores$).toBeFalsy();
    });

    it('should return true and add to blocked chores when a matching chore is already running', async () => {
      const mockHost = vnode_newVirtual();
      mockHost.setProp('q:id', 'same-host');
      const mockQrl = { $hash$: 'same-qrl' } as any;

      // Create and start first chore
      const chore1 = scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);
      runningChores.add(chore1!);

      // Clear the queue to simulate chore1 being processed
      choreQueue.length = 0;

      // Try to schedule the same chore again
      const chore2 = scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);

      // chore2 should be blocked by chore1
      expect(chore1!.$blockedChores$).toBeTruthy();
      expect(chore1!.$blockedChores$!.includes(chore2!)).toBe(true);
      expect(choreQueue.includes(chore2!)).toBe(false);
    });

    it('should handle multiple running chores and find the matching one', async () => {
      const mockHost1 = vnode_newVirtual();
      mockHost1.setProp('q:id', 'host-1');
      const mockHost2 = vnode_newVirtual();
      mockHost2.setProp('q:id', 'host-2');
      const mockHost3 = vnode_newVirtual();
      mockHost3.setProp('q:id', 'host-3');
      const mockQrl1 = { $hash$: 'qrl-1' } as any;
      const mockQrl2 = { $hash$: 'qrl-2' } as any;
      const mockQrl3 = { $hash$: 'qrl-3' } as any;

      // Create multiple running chores
      const chore1 = scheduler(ChoreType.COMPONENT, mockHost1 as any, mockQrl1, null);
      const chore2 = scheduler(ChoreType.COMPONENT, mockHost2 as any, mockQrl2, null);
      const chore3 = scheduler(ChoreType.COMPONENT, mockHost3 as any, mockQrl3, null);

      runningChores.add(chore1!);
      runningChores.add(chore2!);
      runningChores.add(chore3!);

      choreQueue.length = 0;

      // Try to schedule a chore that matches chore2 (same host and same qrl)
      const duplicateChore = scheduler(ChoreType.COMPONENT, mockHost2 as any, mockQrl2, null);

      // duplicateChore should be blocked by chore2
      expect(chore2!.$blockedChores$).toBeTruthy();
      expect(chore2!.$blockedChores$!.includes(duplicateChore!)).toBe(true);
      expect(chore1!.$blockedChores$).toBeFalsy();
      expect(chore3!.$blockedChores$).toBeFalsy();
    });

    it('should work with TASK chores', async () => {
      const task = mockTask(vHost, { qrl: $(() => testLog.push('task')), index: 1 });

      // Create and start a task chore
      const chore1 = scheduler(ChoreType.TASK, task);
      runningChores.add(chore1!);
      choreQueue.length = 0;

      // Try to schedule the same task again
      const chore2 = scheduler(ChoreType.TASK, task);

      // chore2 should be blocked by chore1
      expect(chore1!.$blockedChores$).toBeTruthy();
      expect(chore1!.$blockedChores$!.includes(chore2!)).toBe(true);
    });

    it('should work with VISIBLE chores', async () => {
      const task = mockTask(vHost, {
        qrl: $(() => testLog.push('visible')),
        index: 1,
        visible: true,
      });

      // Create and start a visible task chore
      const chore1 = scheduler(ChoreType.VISIBLE, task);
      runningChores.add(chore1!);
      choreQueue.length = 0;

      // Try to schedule the same visible task again
      const chore2 = scheduler(ChoreType.VISIBLE, task);

      // chore2 should be blocked by chore1
      expect(chore1!.$blockedChores$).toBeTruthy();
      expect(chore1!.$blockedChores$!.includes(chore2!)).toBe(true);
    });

    it('should properly use choreComparator for equality check with QRLs', async () => {
      const mockHost = vnode_newVirtual();
      mockHost.setProp('q:id', 'qrl-test-host');
      const qrl = {
        $hash$: 'qrl-hash',
        getFn: () => () => {},
      } as any;

      // Create and start a chore with the qrl
      const chore1 = scheduler(ChoreType.COMPONENT, mockHost as any, qrl, {} as Props);
      runningChores.add(chore1!);
      choreQueue.length = 0;

      // Try to schedule the same chore again (same host, same qrl reference)
      const chore2 = scheduler(ChoreType.COMPONENT, mockHost as any, qrl, {} as Props);

      // chore2 should be blocked because it's the same qrl reference
      expect(chore1!.$blockedChores$).toBeTruthy();
      expect(chore1!.$blockedChores$!.includes(chore2!)).toBe(true);
    });

    it('should initialize blockedChores array when first chore is blocked', async () => {
      const mockHost = vnode_newVirtual();
      mockHost.setProp('q:id', 'init-test-host');
      const mockQrl = { $hash$: 'qrl-hash' } as any;

      // Create and start a chore
      const chore1 = scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);
      runningChores.add(chore1!);

      // Initially, there should be no blocked chores
      expect(chore1!.$blockedChores$).toBeNull();

      choreQueue.length = 0;

      // Schedule a duplicate chore
      const chore2 = scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);

      // Now blockedChores should be initialized and contain chore2
      expect(chore1!.$blockedChores$).toBeInstanceOf(ChoreArray);
      expect(chore1!.$blockedChores$!.length).toBe(1);
      expect(chore1!.$blockedChores$![0]).toBe(chore2);
    });

    it('should handle multiple blocked chores with different payloads', async () => {
      const mockHost = vnode_newVirtual();
      mockHost.setProp('q:id', 'multi-test-host');
      const mockQrl = { $hash$: 'qrl-hash' } as any;

      // Create and start a chore
      const chore1 = scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);
      runningChores.add(chore1!);
      choreQueue.length = 0;

      // Schedule identical chores - ChoreArray will merge them since they're identical
      scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);
      scheduler(ChoreType.COMPONENT, mockHost as any, mockQrl, null);

      // Since chores are identical and ChoreArray merges duplicates, there should be 1 entry
      // (ChoreArray.add returns existing index for duplicates and updates payload)
      expect(chore1!.$blockedChores$).toBeTruthy();
      expect(chore1!.$blockedChores$!.length).toBe(1);
    });
  });

  it('should keep blockedChores Set and vnode.blockedChores in sync when re-blocking', async () => {
    // Create three tasks in sequence
    const task1 = mockTask(vBHost1, {
      index: 0,
      qrl: $(() => testLog.push('task1')),
    });
    const task2 = mockTask(vBHost1, {
      index: 1,
      qrl: $(() => testLog.push('task2')),
    });
    const task3 = mockTask(vBHost1, {
      index: 2,
      qrl: $(() => testLog.push('task3')),
    });

    vBHost1.setProp(ELEMENT_SEQ, [task1, task2, task3]);

    // Schedule all three tasks
    const chore1 = scheduler(ChoreType.TASK, task1);
    const chore2 = scheduler(ChoreType.TASK, task2);
    const chore3 = scheduler(ChoreType.TASK, task3);

    // chore1 should be scheduled, chore2 blocked by chore1, chore3 blocked by chore2
    expect(choreQueue.length).toBe(1);
    expect(choreQueue[0]).toBe(chore1);
    expect(blockedChores.size).toBe(2);
    expect(blockedChores.has(chore2!)).toBe(true);
    expect(blockedChores.has(chore3!)).toBe(true);
    expect(vBHost1.blockedChores?.length).toBe(2);
    expect(vBHost1.blockedChores).toContain(chore2);
    expect(vBHost1.blockedChores).toContain(chore3);

    // chore2 is blocked by chore1 (immediate previous task)
    expect(chore1?.$blockedChores$?.length).toBe(1);
    expect(chore1?.$blockedChores$).toContain(chore2);

    // chore3 is blocked by chore2 (immediate previous task), not chore1
    // When chore3 was scheduled, it found chore2 in blockedChores as its blocking chore
    expect(chore2?.$blockedChores$?.length).toBe(1);
    expect(chore2?.$blockedChores$).toContain(chore3);

    // Wait for drain - this will execute all tasks
    await waitForDrain();

    // After chore1 completes, all tasks should have executed
    // The key test here is that during execution, when chore1 finished:
    // - chore2 was unblocked (removed from blockedChores and vnode.blockedChores)
    // - chore3 was checked for re-blocking and found chore2 still blocks it
    // - chore3 stayed in both blockedChores and vnode.blockedChores (the bug would have caused desync)
    // - chore3 was moved to chore2's $blockedChores$ list
    // Then chore2 executed and unblocked chore3, then chore3 executed

    expect(testLog).toEqual(['task1', 'task2', 'task3', 'journalFlush']);

    // After drain, everything should be clear
    expect(blockedChores.size).toBe(0);
    expect(vBHost1.blockedChores?.length).toBe(0);
  });

  it('should maintain sync when multiple hosts have blocked chores', async () => {
    // Create a scenario with multiple hosts where each has task chains
    const taskA1 = mockTask(vAHost, {
      index: 0,
      qrl: $(() => testLog.push('taskA1')),
    });
    const taskA2 = mockTask(vAHost, {
      index: 1,
      qrl: $(() => testLog.push('taskA2')),
    });
    const taskB1 = mockTask(vBHost1, {
      index: 0,
      qrl: $(() => testLog.push('taskB1')),
    });
    const taskB2 = mockTask(vBHost1, {
      index: 1,
      qrl: $(() => testLog.push('taskB2')),
    });

    vAHost.setProp(ELEMENT_SEQ, [taskA1, taskA2]);
    vBHost1.setProp(ELEMENT_SEQ, [taskB1, taskB2]);

    // Schedule tasks
    scheduler(ChoreType.TASK, taskA1);
    const choreA2 = scheduler(ChoreType.TASK, taskA2);
    scheduler(ChoreType.TASK, taskB1);
    const choreB2 = scheduler(ChoreType.TASK, taskB2);

    // Initial state: A1 and B1 scheduled (depth-first), A2 and B2 blocked
    expect(choreQueue.length).toBe(2); // A1, B1
    expect(blockedChores.size).toBe(2); // A2, B2
    expect(blockedChores.has(choreA2!)).toBe(true);
    expect(blockedChores.has(choreB2!)).toBe(true);

    // vnode blocked chores should match
    expect(vAHost.blockedChores?.length).toBe(1);
    expect(vAHost.blockedChores).toContain(choreA2);
    expect(vBHost1.blockedChores?.length).toBe(1);
    expect(vBHost1.blockedChores).toContain(choreB2);

    // Wait for drain - this executes all tasks
    await waitForDrain();

    // All tasks should have executed
    // The execution order is: A1, A2 (unblocked after A1), B1, B2 (unblocked after B1)
    expect(testLog).toEqual(['taskA1', 'taskA2', 'taskB1', 'taskB2', 'journalFlush']);

    // After drain, everything should be clear
    expect(blockedChores.size).toBe(0);
    expect(vAHost.blockedChores?.length).toBe(0);
    expect(vBHost1.blockedChores?.length).toBe(0);
  });

  describe('RUN_QRL and QRL_RESOLVE should never block', () => {
    afterEach(() => {
      // Restore all mocks after each test to prevent leakage
      vi.restoreAllMocks();
    });

    it('should not block RUN_QRL chores even when a matching one is running', async () => {
      let executionCount = 0;
      const mockQrl = {
        $hash$: 'test-qrl-hash',
        getFn: () => () => {
          executionCount++;
          testLog.push('qrl-executed');
        },
      } as any;

      // Mock isDraining to prevent immediate execution so we can test blocking logic
      const nextTickSpy = vi.spyOn(nextTick, 'createNextTick').mockReturnValue(() => {});

      // Schedule first RUN_QRL chore and manually mark as running
      const chore1 = scheduler(ChoreType.RUN_QRL, vAHost as HostElement, mockQrl, []);
      runningChores.add(chore1!);

      // Schedule second RUN_QRL chore with same QRL - it should NOT be blocked
      const chore2 = scheduler(ChoreType.RUN_QRL, vAHost as HostElement, mockQrl, []);

      // chore2 should NOT be blocked
      expect(blockedChores.has(chore2!)).toBe(false);
      expect(chore1!.$blockedChores$).toBeNull();
      // Verify no blocked chores for RUN_QRL type
      for (const chore of blockedChores) {
        expect(chore.$type$).not.toBe(ChoreType.RUN_QRL);
      }

      nextTickSpy.mockRestore();
    });

    it('should not block QRL_RESOLVE chores even when a matching one is running', async () => {
      const mockComputeQRL = {
        $hash$: 'compute-qrl-hash',
        resolved: false,
        resolve: vi.fn(() => Promise.resolve()),
      } as any;

      // Mock to prevent automatic draining
      const nextTickSpy = vi.spyOn(nextTick, 'createNextTick').mockReturnValue(() => {});

      // Schedule first QRL_RESOLVE chore and mark as running
      const chore1 = scheduler(ChoreType.QRL_RESOLVE, null, mockComputeQRL);
      runningChores.add(chore1!);

      // Schedule second QRL_RESOLVE chore with same QRL - it should NOT be blocked
      const chore2 = scheduler(ChoreType.QRL_RESOLVE, null, mockComputeQRL);

      // chore2 should NOT be blocked
      expect(blockedChores.has(chore2!)).toBe(false);
      expect(chore1!.$blockedChores$).toBeNull();
      // Verify no blocked chores for QRL_RESOLVE type
      for (const chore of blockedChores) {
        expect(chore.$type$).not.toBe(ChoreType.QRL_RESOLVE);
      }

      nextTickSpy.mockRestore();
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
