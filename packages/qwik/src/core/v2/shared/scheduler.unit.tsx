import { $, type QRL } from '@builder.io/qwik';
import { createDocument } from '@builder.io/qwik-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { TaskFlagsIsVisibleTask, type Task } from '../../use/use-task';
import { QContainerAttr } from '../../util/markers';
import { getDomContainer } from '../client/dom-container';
import type { ElementVNode, VNode, VirtualVNode } from '../client/types';
import {
  vnode_insertBefore,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
  vnode_setProp,
} from '../client/vnode';
import { createScheduler } from './scheduler';

declare global {
  let testLog: string[];
}

describe('scheduler', () => {
  let scheduler: ReturnType<typeof createScheduler> = null!;
  let document: ReturnType<typeof createDocument> = null!;
  let vBody: ElementVNode = null!;
  let vA: ElementVNode = null!;
  let vAHost: VirtualVNode = null!;
  let vB: ElementVNode = null!;
  let vBHost1: VirtualVNode = null!;
  let vBHost2: VirtualVNode = null!;
  beforeEach(() => {
    (globalThis as any as { testLog: string[] }).testLog = [];
    document = createDocument();
    document.body.setAttribute(QContainerAttr, 'paused');
    const container = getDomContainer(document.body);
    container.processJsx = () => null!;
    scheduler = createScheduler(
      container,
      () => null,
      () => testLog.push('journalFlush')
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
    scheduler.$scheduleTask$(mockTask(vBHost1, { index: 2, qrl: $(() => testLog.push('b1.2')) }));
    scheduler.$scheduleTask$(mockTask(vAHost, { qrl: $(() => testLog.push('a1')) }));
    scheduler.$scheduleTask$(mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0')) }));
    await scheduler.$drainAll$();
    expect(testLog).toEqual([
      'a1', // DepthFirst a host component is before b host component.
      'b1.0', // Same component but smaller index.
      'b1.2', // Same component but larger index.
    ]);
  });
  it('should execute visible tasks after journal flush', async () => {
    scheduler.$scheduleTask$(
      mockTask(vBHost2, { index: 2, qrl: $(() => testLog.push('b2.2: Task')) })
    );
    scheduler.$scheduleTask$(mockTask(vBHost1, { qrl: $(() => testLog.push('b1.0: Task')) }));
    scheduler.$scheduleTask$(
      mockTask(vBHost2, {
        index: 2,
        qrl: $(() => testLog.push('b2.2: VisibleTask')),
        visible: true,
      })
    );
    scheduler.$scheduleTask$(
      mockTask(vBHost1, {
        qrl: $(() => {
          testLog.push('b1.0: VisibleTask');
        }),
        visible: true,
      })
    );
    scheduler.$scheduleComponent$(
      vBHost1,
      $(() => testLog.push('b1: Render')),
      {}
    );
    await scheduler.$drainAll$();
    expect(testLog).toEqual([
      'b1.0: Task',
      'b1: Render',
      'b2.2: Task',
      'journalFlush',
      'b1.0: VisibleTask',
      'b2.2: VisibleTask',
    ]);
  });
});

function mockTask(host: VNode, opts: { index?: number; qrl?: QRL; visible?: boolean }): Task {
  return {
    $flags$: opts.visible ? TaskFlagsIsVisibleTask : 0,
    $index$: opts.index || 0,
    $el$: host as any,
    $qrl$: opts.qrl || ($(() => null) as any),
    $state$: null!,
    $destroy$: null!,
  };
}
