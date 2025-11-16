import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $ } from '@qwik.dev/core';
import { delay } from './utils/promises';
import { Chore, createScheduler } from './scheduler';
import { createDocument } from '@qwik.dev/core/testing';
import { QContainerAttr } from './utils/markers';
import { getDomContainer } from '../client/dom-container';
import { ChoreArray } from '../client/chore-array';
import { ChoreType } from './util-chore-type';
import type { HostElement } from './types';
import { _jsxSorted } from '../internal';
import type { ElementVNode, VirtualVNode } from '../client/vnode-impl';
import {
  vnode_insertBefore,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
} from '../client/vnode';

vi.mock('../client/vnode-diff', () => ({
  vnode_diff: vi.fn().mockImplementation(async () => {
    await delay(100);
  }),
}));

describe('should block journal flush during node-diff and component runs', () => {
  let scheduler: ReturnType<typeof createScheduler> = null!;
  let document: ReturnType<typeof createDocument> = null!;
  let vBody: ElementVNode = null!;
  let vA: ElementVNode = null!;
  let vAHost: VirtualVNode = null!;
  let choreQueue: ChoreArray;
  let blockedChores: Set<Chore>;
  let runningChores: Set<Chore>;

  async function waitForDrain() {
    await scheduler(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
  }

  beforeEach(() => {
    (globalThis as any).testLog = [];
    document = createDocument();
    document.body.setAttribute(QContainerAttr, 'paused');
    const container = getDomContainer(document.body);
    container.handleError = vi.fn();
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
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await waitForDrain();
  });

  it('should block journal flush when NODE_DIFF is scheduled and executing', async () => {
    scheduler(
      ChoreType.NODE_DIFF,
      vAHost as HostElement,
      vAHost as HostElement,
      _jsxSorted('div', {}, null, null, 0, null)
    );

    expect(choreQueue.length).toBe(1);
    vi.advanceTimersToNextTimer();
    expect(runningChores.size).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    // no journal flush even if time elapsed, because NODE_DIFF is running
    expect(testLog).toEqual([]);
    // finish VNODE_DIFF
    await vi.advanceTimersByTimeAsync(80);
    // no running chores
    expect(runningChores.size).toBe(0);
    // journal flush should have happened
    expect(testLog).toEqual(['journalFlush']);
  });

  it('should block journal flush when NODE_DIFF and COMPONENT is scheduled and executing', async () => {
    scheduler(
      ChoreType.NODE_DIFF,
      vAHost as HostElement,
      vAHost as HostElement,
      _jsxSorted('div', {}, null, null, 0, null)
    );

    expect(choreQueue.length).toBe(1);
    vi.advanceTimersToNextTimer();
    expect(runningChores.size).toBe(1);
    await vi.advanceTimersByTimeAsync(80);
    // no journal flush even if time elapsed, because NODE_DIFF is running
    expect(testLog).toEqual([]);
    // schedule component chore while NODE_DIFF is running
    scheduler(
      ChoreType.COMPONENT,
      vAHost as HostElement,
      $(async () => {
        await delay(50);
      }) as any,
      null
    );
    // finish VNODE_DIFF
    await vi.advanceTimersByTimeAsync(20);
    // no running chores
    expect(runningChores.size).toBe(1);
    // still no journal flush because COMPONENT is running
    expect(testLog).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    // still no journal flush because COMPONENT is running
    expect(testLog).toEqual([]);
    // finish COMPONENT + next VNODE_DIFF
    await vi.advanceTimersByTimeAsync(110);
    expect(runningChores.size).toBe(0);
    expect(testLog).toEqual(['journalFlush']);
  });
});
