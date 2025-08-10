import { $, _jsxSorted, type JSXOutput, type OnRenderFn, type QRL } from '@qwik.dev/core';

import { createDocument, getTestPlatform } from '@qwik.dev/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDomContainer } from '../client/dom-container';
import type { ElementVNode, VNode, VirtualVNode } from '../client/types';
import {
  vnode_insertBefore,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
  vnode_setProp,
} from '../client/vnode';
import { Task, TaskFlags } from '../use/use-task';
import type { Props } from './jsx/jsx-runtime';
import type { QRLInternal } from './qrl/qrl-class';
import { createScheduler, type Chore } from './scheduler';
import { ChoreType } from './util-chore-type';
import type { HostElement } from './types';
import { ELEMENT_SEQ, QContainerAttr } from './utils/markers';
import { _EFFECT_BACK_REF } from '../reactive-primitives/types';
import { MAX_RETRY_ON_PROMISE_COUNT } from './utils/promises';

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
  let choreQueue: Chore[];
  let blockedChores: Set<Chore>;

  async function waitForDrain() {
    const chore = scheduler.schedule(ChoreType.WAIT_FOR_QUEUE);
    getTestPlatform().flush();
    await chore.$returnValue$;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any as { testLog: string[] }).testLog = [];
    document = createDocument();
    document.body.setAttribute(QContainerAttr, 'paused');
    const container = getDomContainer(document.body);
    handleError = container.handleError = vi.fn();
    choreQueue = [];
    blockedChores = new Set();
    scheduler = createScheduler(
      container,
      () => testLog.push('journalFlush'),
      choreQueue,
      blockedChores
    );
    document.body.innerHTML = '<a></a><b></b>';
    vBody = vnode_newUnMaterializedElement(document.body);
    vA = vnode_locate(vBody, document.querySelector('a') as Element) as ElementVNode;
    vAHost = vnode_newVirtual();
    vnode_setProp(vAHost, 'q:id', 'A');
    vnode_insertBefore([], vA, vAHost, null);
    vB = vnode_locate(vBody, document.querySelector('b') as Element) as ElementVNode;
    vBHost1 = vnode_newVirtual();
    vnode_setProp(vBHost1, 'q:id', 'b1');
    vBHost2 = vnode_newVirtual();
    vnode_setProp(vBHost2, 'q:id', 'b2');
    vnode_insertBefore([], vB, vBHost1, null);
    vnode_insertBefore([], vB, vBHost2, null);
  });

  it('should execute sort tasks', async () => {
    scheduler.schedule(
      ChoreType.TASK,
      mockTask(vBHost1, { index: 2, qrl: $(() => testLog.push('b1.2')) })
    );
    scheduler.schedule(ChoreType.TASK, mockTask(vAHost, { qrl: $(() => testLog.push('a1')) }));
    scheduler.schedule(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await waitForDrain();
    expect(testLog).toEqual([
      'a1', // DepthFirst a host component is before b host component.
      'b1.0', // Same component but smaller index.
      'b1.2', // Same component but larger index.
      'journalFlush',
    ]);
  });
  it('should execute visible tasks after journal flush', async () => {
    scheduler.schedule(
      ChoreType.TASK,
      mockTask(vBHost2, { index: 2, qrl: $(() => testLog.push('b2.2: Task')) })
    );
    scheduler.schedule(
      ChoreType.TASK,
      mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0: Task')) })
    );
    scheduler.schedule(
      ChoreType.VISIBLE,
      mockTask(vBHost2, {
        index: 2,
        qrl: $(() => testLog.push('b2.2: VisibleTask')),
        visible: true,
      })
    );
    scheduler.schedule(
      ChoreType.VISIBLE,
      mockTask(vBHost1, {
        qrl: $(() => {
          testLog.push('b1.0: VisibleTask');
        }),
        visible: true,
      })
    );
    scheduler.schedule(
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
    scheduler.schedule(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'journalFlush']);
  });

  it('should execute chore with promise', async () => {
    vi.useFakeTimers();
    scheduler.schedule(
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
    scheduler.schedule(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    scheduler.schedule(
      ChoreType.TASK,
      mockTask(vBHost1, { qrl: $(() => testLog.push('b1.1')), index: 1 })
    );
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'b1.1', 'journalFlush']);
  });

  it('should execute chore with promise and schedule blocked vnode-diff chores', async () => {
    scheduler.schedule(
      ChoreType.COMPONENT,
      vBHost1 as HostElement,
      $(() => testLog.push('component')) as unknown as QRLInternal<OnRenderFn<unknown>>,
      {}
    );
    scheduler.schedule(
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
    scheduler.schedule(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await waitForDrain();
    scheduler.schedule(ChoreType.TASK, mockTask(vBHost1, { qrl: $(() => testLog.push('b1.1')) }));
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'journalFlush', 'b1.1', 'journalFlush']);
  });

  it('should not go into infinity loop on thrown promise', async () => {
    (globalThis as any).executionCounter = vi.fn();

    scheduler.schedule(
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
    scheduler.schedule(
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

    vnode_setProp(vBHost1, ELEMENT_SEQ, [task1, task2, task3]);

    scheduler.schedule(ChoreType.TASK, task1);
    scheduler.schedule(ChoreType.TASK, task2);
    scheduler.schedule(ChoreType.TASK, task3);
    // schedule only first task
    expect(choreQueue.length).toBe(1);
    // block the rest
    expect(blockedChores.size).toBe(2);
    await waitForDrain();
    expect(testLog).toEqual(['b1.0', 'b1.1', 'b1.2', 'journalFlush']);
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
