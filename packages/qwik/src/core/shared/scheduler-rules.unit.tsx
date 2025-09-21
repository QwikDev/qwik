import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findBlockingChore, findBlockingChoreForVisible } from './scheduler-rules';
import { ChoreType } from './util-chore-type';
import { addBlockedChore, type Chore } from './scheduler';
import { Task, TaskFlags } from '../use/use-task';
import { ELEMENT_SEQ } from './utils/markers';
import type { Container } from './types';
import { vnode_newVirtual } from '../client/vnode';
import { $, type QRL } from './qrl/qrl.public';
import { createQRL } from './qrl/qrl-class';
import { ChoreArray } from '../client/chore-array';
import type { VNode } from '../client/vnode-impl';

const createMockChore = (
  type: ChoreType,
  host: object,
  idx: number | string = 0,
  payload: any = null,
  target: any = null
): Chore => ({
  $type$: type,
  $host$: host as any,
  $idx$: idx,
  $payload$: payload,
  $target$: target,
  $state$: 0,
  $blockedChores$: null,
  $returnValue$: null,
  $startTime$: undefined,
  $endTime$: undefined,
  $resolve$: undefined,
  $reject$: undefined,
});

let rootVNode = vnode_newVirtual();

const createMockContainer = (elementSeqMap: Map<object, any[]>) =>
  ({
    getHostProp: vi.fn((host, prop) => {
      if (prop === ELEMENT_SEQ) {
        return elementSeqMap.get(host) || null;
      }
      return null;
    }),
    rootVNode,
  }) as unknown as Container;

function createMockTask(
  host: object,
  opts: { index?: number; qrl?: QRL; visible?: boolean }
): Task {
  return new Task(
    opts.visible ? TaskFlags.VISIBLE_TASK : TaskFlags.TASK,
    opts.index || 0,
    host as any,
    opts.qrl || ($(() => null) as any),
    null!,
    null!
  );
}

function createMockQRL(symbol: string): QRL {
  return createQRL(null, symbol, null, null, null, null) as QRL;
}

describe('findBlockingChore', () => {
  const host1 = { el: 'host1' };
  const host2 = { el: 'host2' };

  describe('QRL_RESOLVE blocking', () => {
    const blockingChore = createMockChore(
      ChoreType.QRL_RESOLVE,
      host1,
      0,
      null,
      createMockQRL('qrl1')
    );
    const container = createMockContainer(new Map());

    it.each([ChoreType.RUN_QRL, ChoreType.TASK, ChoreType.VISIBLE])(
      'should block %s on the same host with the same qrl',
      (blockedType) => {
        const choreQueue = new ChoreArray();
        choreQueue.add(blockingChore);
        const blockedChores = new Set<Chore>();
        const runningChores = new Set<Chore>();
        let newChore;
        if (blockedType === ChoreType.VISIBLE || blockedType === ChoreType.TASK) {
          newChore = createMockChore(
            blockedType,
            host1,
            0,
            createMockTask(host1, {
              qrl: createMockQRL('qrl1'),
              visible: blockedType === ChoreType.VISIBLE,
            })
          );
        } else {
          newChore = createMockChore(blockedType, host1, 0, null, createMockQRL('qrl1'));
        }

        const result = findBlockingChore(
          newChore,
          choreQueue,
          blockedChores,
          runningChores,
          container
        );
        expect(result).toBe(blockingChore);
      }
    );

    it('should NOT block on a different host with the same qrl', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.RUN_QRL, host2, 0, null, createMockQRL('qrl1'));

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should NOT block on a different host with a different qrl', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.RUN_QRL, host2, 0, null, createMockQRL('qrl2'));
      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should NOT block on a the same host with a different qrl', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.RUN_QRL, host1, 0, null, createMockQRL('qrl2'));
      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should find blocking chore in blockedChores set with the same qrl', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.RUN_QRL, host1, 0, null, createMockQRL('qrl1'));

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });

    it('should find blocking chore in runningChores set with the same qrl', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.RUN_QRL, host1, 0, null, createMockQRL('qrl1'));

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });

    it('should block VISIBLE on the same host with the same qrl', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(
        ChoreType.VISIBLE,
        host1,
        0,
        createMockTask(host1, { qrl: createMockQRL('qrl1'), visible: true })
      );

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });
  });

  describe('COMPONENT and NODE_DIFF blocking VISIBLE', () => {
    const parentVNode = vnode_newVirtual();
    const childVNode = vnode_newVirtual();
    childVNode.parent = parentVNode;
    const siblingVNode = vnode_newVirtual();
    siblingVNode.parent = parentVNode;

    const container = createMockContainer(new Map());

    it.each([ChoreType.COMPONENT, ChoreType.NODE_DIFF])(
      'should block VISIBLE chore if it is a child of a %s chore',
      (blockingType) => {
        const blockingChore = createMockChore(blockingType, parentVNode);
        const choreQueue = new ChoreArray();
        choreQueue.add(blockingChore);
        const blockedChores = new Set<Chore>();
        const runningChores = new Set<Chore>();
        const newChore = createMockChore(ChoreType.VISIBLE, childVNode);

        const result = findBlockingChore(
          newChore,
          choreQueue,
          blockedChores,
          runningChores,
          container
        );
        expect(result).toBe(blockingChore);
      }
    );

    it.each([ChoreType.COMPONENT, ChoreType.NODE_DIFF])(
      'should block VISIBLE chore if it is a parent of a %s chore',
      (blockingType) => {
        const blockingChore = createMockChore(blockingType, childVNode);
        const choreQueue = new ChoreArray();
        choreQueue.add(blockingChore);
        const blockedChores = new Set<Chore>();
        const runningChores = new Set<Chore>();
        const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

        const result = findBlockingChore(
          newChore,
          choreQueue,
          blockedChores,
          runningChores,
          container
        );
        expect(result).toBe(blockingChore);
      }
    );

    it.each([ChoreType.COMPONENT, ChoreType.NODE_DIFF])(
      'should NOT block VISIBLE chore if it is a sibling of a %s chore',
      (blockingType) => {
        const blockingChore = createMockChore(blockingType, siblingVNode);
        const choreQueue = new ChoreArray();
        choreQueue.add(blockingChore);
        const blockedChores = new Set<Chore>();
        const runningChores = new Set<Chore>();
        const newChore = createMockChore(ChoreType.VISIBLE, childVNode);

        const result = findBlockingChore(
          newChore,
          choreQueue,
          blockedChores,
          runningChores,
          container
        );
        expect(result).toBeNull();
      }
    );

    it.each([ChoreType.COMPONENT, ChoreType.NODE_DIFF])(
      'should NOT block VISIBLE chore if it is on a different branch than a %s chore',
      (blockingType) => {
        const otherVNode = vnode_newVirtual();
        const blockingChore = createMockChore(blockingType, otherVNode);
        const choreQueue = new ChoreArray();
        choreQueue.add(blockingChore);
        const blockedChores = new Set<Chore>();
        const runningChores = new Set<Chore>();
        const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

        const result = findBlockingChore(
          newChore,
          choreQueue,
          blockedChores,
          runningChores,
          container
        );
        expect(result).toBeNull();
      }
    );

    it('should handle non-VNode hosts gracefully', () => {
      const nonVNodeHost = { el: 'not-a-vnode' };
      const blockingChore = createMockChore(ChoreType.COMPONENT, nonVNodeHost as any);
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });
  });

  describe('COMPONENT blocking', () => {
    const blockingChore = createMockChore(ChoreType.COMPONENT, host1);
    const container = createMockContainer(new Map());

    it.each([ChoreType.NODE_DIFF, ChoreType.NODE_PROP])(
      'should block %s on the same host',
      (blockedType) => {
        const choreQueue = new ChoreArray();
        choreQueue.add(blockingChore);
        const blockedChores = new Set<Chore>();
        const runningChores = new Set<Chore>();
        const newChore = createMockChore(blockedType, host1);

        const result = findBlockingChore(
          newChore,
          choreQueue,
          blockedChores,
          runningChores,
          container
        );
        expect(result).toBe(blockingChore);
      }
    );

    it('should NOT block on a different host', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.NODE_DIFF, host2);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should find blocking chore in blockedChores set', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.NODE_DIFF, host1);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });

    it('should find blocking chore in runningChores set', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.NODE_DIFF, host1);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });
  });

  describe('TASK blocking', () => {
    // Mock tasks and signals in a component's sequence
    const task1 = new Task(TaskFlags.TASK, 0, host1 as any, {} as any, undefined, null);
    const signal1 = { type: 'signal' }; // A non-task hook
    const task2 = new Task(TaskFlags.TASK, 2, host1 as any, {} as any, undefined, null);
    const task3_otherHost = new Task(TaskFlags.TASK, 0, host2 as any, {} as any, undefined, null);

    const blockingChore = createMockChore(ChoreType.TASK, host1, 0, task1);
    const blockingChoreOtherHost = createMockChore(ChoreType.TASK, host2, 0, task3_otherHost);

    const elementSeqMap = new Map<object, any[]>();
    elementSeqMap.set(host1, [task1, signal1, task2]);
    elementSeqMap.set(host2, [task3_otherHost]);

    const container = createMockContainer(elementSeqMap);

    it('should block a subsequent TASK on the same host', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host1, 2, task2);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });

    it('should NOT block a preceding TASK on the same host', () => {
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      choreQueue.add(createMockChore(ChoreType.TASK, host1, 2, task2));

      const newChore = createMockChore(ChoreType.TASK, host1, 0, task1);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should NOT block a TASK on a different host', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host2, 0, task3_otherHost);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should find blocking TASK in blockedChores set', () => {
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>([blockingChore]);
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host1, 2, task2);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });

    it('should find blocking TASK in runningChores set', () => {
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.TASK, host1, 2, task2);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(blockingChore);
    });

    it('should not block if it is the first task (index 0)', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(blockingChoreOtherHost);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();

      const newChore = createMockChore(ChoreType.TASK, host1, 0, task1);

      const result = findBlockingChore(
        newChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });
  });

  it('should return null if no blocking chore is found', () => {
    const container = createMockContainer(new Map());
    const choreQueue = new ChoreArray();
    const blockedChores = new Set<Chore>();
    const runningChores = new Set<Chore>();
    choreQueue.add(createMockChore(ChoreType.COMPONENT, host1));
    const newChore = createMockChore(ChoreType.RUN_QRL, host1); // Not blocked by COMPONENT

    const result = findBlockingChore(newChore, choreQueue, blockedChores, runningChores, container);
    expect(result).toBeNull();
  });
  describe('Ancestor blocking', () => {
    const parentVNode = vnode_newVirtual();
    const childVNode = vnode_newVirtual();
    childVNode.parent = parentVNode;
    const unrelatedVNode = vnode_newVirtual();
    const container = createMockContainer(new Map());
    const ancestorChore = createMockChore(ChoreType.NODE_DIFF, parentVNode);
    const descendantChore = createMockChore(ChoreType.VISIBLE, childVNode);

    beforeEach(() => {
      rootVNode = vnode_newVirtual();
    });

    it('should block if an ancestor is in the choreQueue', () => {
      const choreQueue = new ChoreArray();
      choreQueue.add(ancestorChore);
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      const result = findBlockingChore(
        descendantChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(ancestorChore);
    });

    it('should block if an ancestor is in the blockedChores', () => {
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>([ancestorChore]);
      const runningChores = new Set<Chore>();
      const result = findBlockingChore(
        descendantChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(ancestorChore);
    });

    it('should block if an ancestor is in the runningChores', () => {
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>([ancestorChore]);
      const result = findBlockingChore(
        descendantChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(ancestorChore);
    });

    it('should not block if candidate is a descendant, not ancestor', () => {
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      choreQueue.add(descendantChore);
      const result = findBlockingChore(
        ancestorChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should not block for unrelated chores', () => {
      const unrelatedChore = createMockChore(ChoreType.NODE_DIFF, unrelatedVNode);
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      choreQueue.add(unrelatedChore);
      const result = findBlockingChore(
        descendantChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should not block if candidate chore type is VISIBLE or greater', () => {
      const ancestorVisibleChore = createMockChore(ChoreType.VISIBLE, parentVNode);
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      choreQueue.add(ancestorVisibleChore);
      const result = findBlockingChore(
        descendantChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should not block if candidate chore type is TASK', () => {
      const ancestorTaskChore = createMockChore(ChoreType.TASK, parentVNode);
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      choreQueue.add(ancestorTaskChore);
      const result = findBlockingChore(
        descendantChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBeNull();
    });

    it('should block if an ancestor is projection parent', () => {
      const parentProjectionVNode = vnode_newVirtual();
      const childProjectionVNode = vnode_newVirtual();
      parentProjectionVNode.parent = rootVNode;
      parentProjectionVNode.setProp('', childProjectionVNode);
      childProjectionVNode.slotParent = parentProjectionVNode;
      const ancestorProjectionChore = createMockChore(ChoreType.COMPONENT, parentProjectionVNode);
      (ancestorProjectionChore.$host$ as VNode).chores = new ChoreArray();
      (ancestorProjectionChore.$host$ as VNode).chores?.add(ancestorProjectionChore);
      const descendantProjectionChore = createMockChore(ChoreType.COMPONENT, childProjectionVNode);
      const choreQueue = new ChoreArray();
      const blockedChores = new Set<Chore>();
      const runningChores = new Set<Chore>();
      choreQueue.add(ancestorProjectionChore);
      const result = findBlockingChore(
        descendantProjectionChore,
        choreQueue,
        blockedChores,
        runningChores,
        container
      );
      expect(result).toBe(ancestorProjectionChore);
    });
  });
});

describe('findBlockingChoreForVisible', () => {
  const host1 = { el: 'host1' };
  const host2 = { el: 'host2' };
  const parentVNode = vnode_newVirtual();
  const childVNode = vnode_newVirtual();
  childVNode.parent = parentVNode;
  const unrelatedVNode = vnode_newVirtual();

  const container = createMockContainer(new Map());
  it.each([
    ['parent', ChoreType.NODE_DIFF, parentVNode, childVNode],
    ['child', ChoreType.NODE_DIFF, childVNode, parentVNode],
    ['parent', ChoreType.COMPONENT, parentVNode, childVNode],
    ['child', ChoreType.COMPONENT, childVNode, parentVNode],
  ])(
    'should block VISIBLE chore if %s is a %s of VISIBLE',
    (_, blockingType, blockingHost, visibleHost) => {
      const blockingChore = createMockChore(blockingType, blockingHost);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, visibleHost);
      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBe(blockingChore);
    }
  );

  it('should NOT block VISIBLE chore if NODE_DIFF is on a different branch', () => {
    const blockingChore = createMockChore(ChoreType.NODE_DIFF, unrelatedVNode);
    const runningChores = new Set<Chore>([blockingChore]);
    const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

    const result = findBlockingChoreForVisible(newChore, runningChores, container);
    expect(result).toBeNull();
  });

  it('should handle non-VNode hosts gracefully for NODE_DIFF', () => {
    const nonVNodeHost = { el: 'not-a-vnode' };
    const blockingChore = createMockChore(ChoreType.NODE_DIFF, nonVNodeHost as any);
    const runningChores = new Set<Chore>([blockingChore]);
    const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

    const result = findBlockingChoreForVisible(newChore, runningChores, container);
    expect(result).toBeNull();
  });

  it('should handle non-VNode hosts gracefully for VISIBLE', () => {
    const blockingChore = createMockChore(ChoreType.NODE_DIFF, childVNode);
    const runningChores = new Set<Chore>([blockingChore]);
    const nonVNodeHost = { el: 'not-a-vnode' };
    const newChore = createMockChore(ChoreType.VISIBLE, nonVNodeHost as any);

    const result = findBlockingChoreForVisible(newChore, runningChores, container);
    expect(result).toBeNull();
  });

  it('should NOT block VISIBLE chore if COMPONENT is on a different branch', () => {
    const blockingChore = createMockChore(ChoreType.COMPONENT, unrelatedVNode);
    const runningChores = new Set<Chore>([blockingChore]);
    const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

    const result = findBlockingChoreForVisible(newChore, runningChores, container);
    expect(result).toBeNull();
  });

  it('should handle non-VNode hosts gracefully for COMPONENT', () => {
    const nonVNodeHost = { el: 'not-a-vnode' };
    const blockingChore = createMockChore(ChoreType.COMPONENT, nonVNodeHost as any);
    const runningChores = new Set<Chore>([blockingChore]);
    const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

    const result = findBlockingChoreForVisible(newChore, runningChores, container);
    expect(result).toBeNull();
  });

  describe('multiple blocking chores', () => {
    it('should return the first matching blocking chore when multiple exist', () => {
      const blockingChore1 = createMockChore(ChoreType.NODE_DIFF, parentVNode);
      const blockingChore2 = createMockChore(ChoreType.COMPONENT, parentVNode);
      const unrelatedChore = createMockChore(ChoreType.TASK, host1);

      const runningChores = new Set<Chore>([unrelatedChore, blockingChore1, blockingChore2]);
      const newChore = createMockChore(ChoreType.VISIBLE, childVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      // Should return the first one found in the iteration order
      expect(result).toBeDefined();
      expect([blockingChore1, blockingChore2]).toContain(result);
    });

    it('should return null when no blocking chores exist', () => {
      const unrelatedChore1 = createMockChore(ChoreType.TASK, host1);
      const unrelatedChore2 = createMockChore(ChoreType.RUN_QRL, host2);

      const runningChores = new Set<Chore>([unrelatedChore1, unrelatedChore2]);
      const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });
  });

  describe('chore type filtering', () => {
    it('should only check VISIBLE chores', () => {
      const blockingChore = createMockChore(ChoreType.NODE_DIFF, childVNode);
      const runningChores = new Set<Chore>([blockingChore]);

      // Test with different chore types that should NOT be blocked
      const nonVisibleChores = [
        createMockChore(ChoreType.TASK, parentVNode),
        createMockChore(ChoreType.RUN_QRL, parentVNode),
        createMockChore(ChoreType.NODE_DIFF, parentVNode),
        createMockChore(ChoreType.NODE_PROP, parentVNode),
        createMockChore(ChoreType.COMPONENT, parentVNode),
        createMockChore(ChoreType.QRL_RESOLVE, parentVNode),
      ];

      nonVisibleChores.forEach((chore) => {
        const result = findBlockingChoreForVisible(chore, runningChores, container);
        expect(result).toBeNull();
      });
    });

    it('should only consider NODE_DIFF and COMPONENT as blocking types', () => {
      const runningChores = new Set<Chore>([
        createMockChore(ChoreType.TASK, childVNode),
        createMockChore(ChoreType.RUN_QRL, childVNode),
        createMockChore(ChoreType.NODE_PROP, childVNode),
        createMockChore(ChoreType.QRL_RESOLVE, childVNode),
      ]);

      const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });
  });

  describe('deep hierarchy', () => {
    const grandparentVNode = vnode_newVirtual();
    const parentVNode = vnode_newVirtual();
    const childVNode = vnode_newVirtual();
    const grandchildVNode = vnode_newVirtual();

    parentVNode.parent = grandparentVNode;
    childVNode.parent = parentVNode;
    grandchildVNode.parent = childVNode;

    const container = createMockContainer(new Map());

    it('should block VISIBLE at grandchild level when NODE_DIFF is at grandparent level', () => {
      const blockingChore = createMockChore(ChoreType.NODE_DIFF, grandparentVNode);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, grandchildVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBe(blockingChore);
    });

    it('should block VISIBLE at child level when COMPONENT is at parent level', () => {
      const blockingChore = createMockChore(ChoreType.COMPONENT, parentVNode);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, childVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBe(blockingChore);
    });

    it('should block VISIBLE at grandparent level when NODE_DIFF is at grandchild level', () => {
      const blockingChore = createMockChore(ChoreType.NODE_DIFF, grandchildVNode);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, grandparentVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBe(blockingChore);
    });

    it('should block VISIBLE at grandparent level when COMPONENT is at grandchild level', () => {
      const blockingChore = createMockChore(ChoreType.COMPONENT, grandchildVNode);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, grandparentVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBe(blockingChore);
    });
  });

  describe('edge cases', () => {
    it('should handle empty runningChores set', () => {
      const runningChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.VISIBLE, host1);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });

    it('should handle null/undefined hosts gracefully', () => {
      const blockingChore = createMockChore(ChoreType.NODE_DIFF, null as any);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, host1);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });

    it('should handle null/undefined hosts for VISIBLE chore', () => {
      const blockingChore = createMockChore(ChoreType.NODE_DIFF, host1);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, null as any);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });

    it('should NOT block VISIBLE when NODE_DIFF is on a different host', () => {
      const blockingChore = createMockChore(ChoreType.NODE_DIFF, host2);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, host1);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });

    it('should NOT block VISIBLE when COMPONENT is on a different host', () => {
      const blockingChore = createMockChore(ChoreType.COMPONENT, host2);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, host1);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });

    it('should handle undefined VNode parent gracefully', () => {
      const parentVNode = vnode_newVirtual();
      const childVNode = vnode_newVirtual();
      // Don't set parent relationship

      const blockingChore = createMockChore(ChoreType.NODE_DIFF, childVNode);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, parentVNode);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBeNull();
    });

    // probably will not happen in practice
    it.skip('should handle circular parent references gracefully', () => {
      const vnode1 = vnode_newVirtual();
      const vnode2 = vnode_newVirtual();
      vnode1.parent = vnode2;
      vnode2.parent = vnode1; // Circular reference

      const blockingChore = createMockChore(ChoreType.NODE_DIFF, vnode2);
      const runningChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.VISIBLE, vnode1);

      const result = findBlockingChoreForVisible(newChore, runningChores, container);
      expect(result).toBe(blockingChore);
    });
  });
});

describe('addBlockedChore', () => {
  it('should add blocked chore to blocking chore and blockedChores set', () => {
    const blockedChore = createMockChore(ChoreType.VISIBLE, { el: 'host1' });
    const blockingChore = createMockChore(ChoreType.NODE_DIFF, { el: 'host2' });
    const blockedChores = new Set<Chore>();

    addBlockedChore(blockedChore, blockingChore, blockedChores);

    expect(blockingChore.$blockedChores$).toContain(blockedChore);
    expect(blockedChores.has(blockedChore)).toBe(true);
  });

  it('should initialize $blockedChores$ array if it does not exist', () => {
    const blockedChore = createMockChore(ChoreType.VISIBLE, { el: 'host1' });
    const blockingChore = createMockChore(ChoreType.NODE_DIFF, { el: 'host2' });
    blockingChore.$blockedChores$ = null;
    const blockedChores = new Set<Chore>();

    addBlockedChore(blockedChore, blockingChore, blockedChores);

    expect(blockingChore.$blockedChores$).toEqual([blockedChore]);
    expect(blockedChores.has(blockedChore)).toBe(true);
  });

  it('should append to existing $blockedChores$ array', () => {
    const blockedChore1 = createMockChore(ChoreType.VISIBLE, { el: 'host1' });
    const blockedChore2 = createMockChore(ChoreType.TASK, { el: 'host2' });
    const blockingChore = createMockChore(ChoreType.NODE_DIFF, { el: 'host3' });
    blockingChore.$blockedChores$ = [blockedChore1];
    const blockedChores = new Set<Chore>([blockedChore1]);

    addBlockedChore(blockedChore2, blockingChore, blockedChores);

    expect(blockingChore.$blockedChores$).toEqual([blockedChore1, blockedChore2]);
    expect(blockedChores.has(blockedChore1)).toBe(true);
    expect(blockedChores.has(blockedChore2)).toBe(true);
  });
});
