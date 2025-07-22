import { describe, it, expect, vi } from 'vitest';
import { findBlockingChore } from './scheduler-rules';
import { ChoreType } from './util-chore-type';
import type { Chore } from './scheduler';
import { Task, TaskFlags } from '../use/use-task';
import { ELEMENT_SEQ } from './utils/markers';
import type { Container } from './types';

const createMockChore = (
  type: ChoreType,
  host: object,
  idx: number | string = 0,
  payload: any = null
): Chore => ({
  $type$: type,
  $host$: host as any,
  $idx$: idx,
  $payload$: payload,
  $target$: null,
  $state$: 0,
  $blockedChores$: null,
  $returnValue$: null,
});

const createMockContainer = (elementSeqMap: Map<object, any[]>) =>
  ({
    getHostProp: vi.fn((host, prop) => {
      if (prop === ELEMENT_SEQ) {
        return elementSeqMap.get(host) || null;
      }
      return null;
    }),
  }) as unknown as Container;

describe('findBlockingChore', () => {
  const host1 = { el: 'host1' };
  const host2 = { el: 'host2' };

  describe('QRL_RESOLVE blocking', () => {
    const blockingChore = createMockChore(ChoreType.QRL_RESOLVE, host1);
    const container = createMockContainer(new Map());

    it.each([ChoreType.RUN_QRL, ChoreType.TASK, ChoreType.VISIBLE])(
      'should block %s on the same host',
      (blockedType) => {
        const choreQueue = [blockingChore];
        const blockedChores = new Set<Chore>();
        const newChore = createMockChore(blockedType, host1);

        const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
        expect(result).toBe(blockingChore);
      }
    );

    it('should NOT block on a different host', () => {
      const choreQueue = [blockingChore];
      const blockedChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.RUN_QRL, host2);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBeNull();
    });

    it('should find blocking chore in blockedChores set', () => {
      const choreQueue: Chore[] = [];
      const blockedChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.RUN_QRL, host1);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBe(blockingChore);
    });
  });

  describe('COMPONENT blocking', () => {
    const blockingChore = createMockChore(ChoreType.COMPONENT, host1);
    const container = createMockContainer(new Map());

    it.each([ChoreType.NODE_DIFF, ChoreType.NODE_PROP])(
      'should block %s on the same host',
      (blockedType) => {
        const choreQueue = [blockingChore];
        const blockedChores = new Set<Chore>();
        const newChore = createMockChore(blockedType, host1);

        const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
        expect(result).toBe(blockingChore);
      }
    );

    it('should NOT block on a different host', () => {
      const choreQueue = [blockingChore];
      const blockedChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.NODE_DIFF, host2);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBeNull();
    });

    it('should find blocking chore in blockedChores set', () => {
      const choreQueue: Chore[] = [];
      const blockedChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.NODE_DIFF, host1);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
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
      const choreQueue = [blockingChore];
      const blockedChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host1, 2, task2);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBe(blockingChore);
    });

    it('should NOT block a preceding TASK on the same host', () => {
      const choreQueue = [createMockChore(ChoreType.TASK, host1, 2, task2)];
      const blockedChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host1, 0, task1);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBeNull();
    });

    it('should NOT block a TASK on a different host', () => {
      const choreQueue = [blockingChore];
      const blockedChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host2, 0, task3_otherHost);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBeNull();
    });

    it('should find blocking TASK in blockedChores set', () => {
      const choreQueue: Chore[] = [];
      const blockedChores = new Set<Chore>([blockingChore]);
      const newChore = createMockChore(ChoreType.TASK, host1, 2, task2);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBe(blockingChore);
    });

    it('should not block if it is the first task (index 0)', () => {
      const choreQueue = [blockingChoreOtherHost];
      const blockedChores = new Set<Chore>();
      const newChore = createMockChore(ChoreType.TASK, host1, 0, task1);

      const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
      expect(result).toBeNull();
    });
  });

  it('should return null if no blocking chore is found', () => {
    const container = createMockContainer(new Map());
    const choreQueue = [createMockChore(ChoreType.COMPONENT, host1)];
    const blockedChores = new Set<Chore>();
    const newChore = createMockChore(ChoreType.RUN_QRL, host1); // Not blocked by COMPONENT

    const result = findBlockingChore(newChore, choreQueue, blockedChores, container);
    expect(result).toBeNull();
  });
});
