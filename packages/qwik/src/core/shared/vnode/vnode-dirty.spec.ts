import { describe, expect, it } from 'vitest';
import { VNodeFlags } from '../../client/types';
import { vnode_newVirtual } from '../../client/vnode-utils';
import type { Cursor } from '../cursor/cursor';
import { setCursorData, type CursorData } from '../cursor/cursor-props';
import type { Container } from '../types';
import { ChoreBits } from './enums/chore-bits.enum';
import type { VirtualVNode } from './virtual-vnode';
import { markVNodeDirty } from './vnode-dirty';

describe('markVNodeDirty', () => {
  const createMockContainer = () =>
    ({
      $pendingCount$: 0,
      $renderPromise$: null,
      $resolveRenderPromise$: null,
      $checkPendingCount$: () => {},
      getHostProp: () => null,
      handleError: () => {},
    }) as unknown as Container;

  const createCursorData = (
    container: Container,
    cursor: Cursor,
    position: VirtualVNode
  ): CursorData => {
    const cursorData: CursorData = {
      container,
      position,
      promise: null,
      journal: null,
      extraPromises: null,
      afterFlushTasks: null,
      priority: 0,
      boundaries: null,
    };
    setCursorData(cursor, cursorData);
    cursor.flags |= VNodeFlags.Cursor;
    return cursorData;
  };

  it('should rewind an existing blocking cursor to the dirty branch', () => {
    const container = createMockContainer();
    const cursor = vnode_newVirtual() as Cursor;
    const previousPosition = vnode_newVirtual() as VirtualVNode;
    const parent = vnode_newVirtual() as VirtualVNode;
    const child = vnode_newVirtual() as VirtualVNode;

    previousPosition.parent = cursor;
    parent.parent = cursor;
    child.parent = parent;

    const cursorData = createCursorData(container, cursor, previousPosition);

    markVNodeDirty(container, child, ChoreBits.NODE_DIFF);

    expect(cursorData.position).toBe(parent);
    expect(cursor.dirty & ChoreBits.CHILDREN).toBeTruthy();
    expect(cursor.dirtyChildren).toContain(parent);
    expect(parent.dirty & ChoreBits.CHILDREN).toBeTruthy();
    expect(parent.dirtyChildren).toContain(child);
  });

  it('should not rewind past dirty ancestors to the leaf vnode', () => {
    const container = createMockContainer();
    const cursor = vnode_newVirtual() as Cursor;
    const previousPosition = vnode_newVirtual() as VirtualVNode;
    const branch = vnode_newVirtual() as VirtualVNode;
    const parent = vnode_newVirtual() as VirtualVNode;
    const child = vnode_newVirtual() as VirtualVNode;

    previousPosition.parent = cursor;
    branch.parent = cursor;
    parent.parent = branch;
    child.parent = parent;

    const cursorData = createCursorData(container, cursor, previousPosition);

    markVNodeDirty(container, child, ChoreBits.NODE_DIFF);

    expect(cursorData.position).toBe(branch);
    expect(cursorData.position).not.toBe(parent);
    expect(cursorData.position).not.toBe(child);
    expect(cursor.dirtyChildren).toContain(branch);
    expect(branch.dirty & ChoreBits.CHILDREN).toBeTruthy();
    expect(branch.dirtyChildren).toContain(parent);
    expect(parent.dirty & ChoreBits.CHILDREN).toBeTruthy();
    expect(parent.dirtyChildren).toContain(child);
  });
});
