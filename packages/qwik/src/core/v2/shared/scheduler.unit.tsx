import { createDocument } from '@builder.io/qwik-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { inlinedQrl } from '../../qrl/qrl';
import { delay } from '../../util/promises';
import type { ElementVNode, VirtualVNode } from '../client/types';
import {
  vnode_insertBefore,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
  vnode_setProp,
} from '../client/vnode';
import { ChoreType, createScheduler } from './scheduler';
import { getDomContainer } from '../client/dom-container';
import { QContainerAttr } from '../../util/markers';

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
    document = createDocument();
    document.body.setAttribute(QContainerAttr, 'paused');
    const container = getDomContainer(document.body);
    container.processJsx = () => null!;
    scheduler = createScheduler(container, () => null);
    document.body.innerHTML = '<a></a><b></b>';
    vBody = vnode_newUnMaterializedElement(document.body);
    vA = vnode_locate(vBody, document.querySelector('a') as Element) as ElementVNode;
    vAHost = vnode_newVirtual();
    vnode_setProp(vAHost, 'id', 'A');
    vnode_insertBefore([], vA, vAHost, null);
    vB = vnode_locate(vBody, document.querySelector('b') as Element) as ElementVNode;
    vBHost1 = vnode_newVirtual();
    vnode_setProp(vBHost1, 'id', 'b1');
    vBHost2 = vnode_newVirtual();
    vnode_setProp(vBHost2, 'id', 'b2');
    vnode_insertBefore([], vB, vBHost1, null);
    vnode_insertBefore([], vB, vBHost2, null);
  });

  it('should execute SIMPLE', () => {
    const log: string[] = [];

    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vBHost1,
      inlinedQrl(() => {
        log.push('2');
      }, 's_2')
    );
    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vBHost2,
      inlinedQrl(() => {
        log.push('3');
      }, 's_3')
    );
    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vAHost,
      inlinedQrl(() => {
        log.push('1');
      }, 's_1')
    );
    scheduler.$drainAll$();
    expect(log).toEqual(['1', '2', '3']);
  });

  it('should execute async SIMPLE', async () => {
    const log: string[] = [];

    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vBHost2,
      inlinedQrl(() => {
        delay(1);
        log.push('3');
      }, 's_3')
    );
    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vBHost1,
      inlinedQrl(() => {
        delay(1);
        log.push('2');
      }, 's_2')
    );
    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vAHost,
      inlinedQrl(() => {
        delay(1);
        log.push('1');
      }, 's_1')
    );
    await scheduler.$drainAll$();
    expect(log).toEqual(['1', '2', '3']);
  });
  it('should not add the same SIMPLE twice', async () => {
    const log: string[] = [];

    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vBHost2,
      inlinedQrl(() => {
        delay(1);
        log.push('1');
      }, 's_3')
    );
    scheduler.$schedule$(
      ChoreType.SIMPLE,
      vBHost2,
      inlinedQrl(() => {
        delay(1);
        log.push('1');
      }, 's_3')
    );
    await scheduler.$drainAll$();
    expect(log).toEqual(['1']);
  });
});
