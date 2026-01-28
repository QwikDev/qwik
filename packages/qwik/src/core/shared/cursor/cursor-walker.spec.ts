import { describe, expect, it } from 'vitest';
import { vnode_newVirtual } from '../../client/vnode-utils';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import type { VirtualVNode } from '../vnode/virtual-vnode';
import type { Cursor } from './cursor';
import { getNextVNode } from './cursor-walker';

describe('getNextVNode', () => {
  it('should reset vnode cursor data when no dirty children remain', () => {
    const parent = vnode_newVirtual();
    parent.dirty |= ChoreBits.CHILDREN;
    parent.nextDirtyChildIndex = 2;
    parent.dirtyChildren = [];

    const child1 = vnode_newVirtual();
    child1.parent = parent as VirtualVNode;
    const child2 = vnode_newVirtual();
    child2.parent = parent as VirtualVNode;
    const child3 = vnode_newVirtual();
    child3.parent = parent as VirtualVNode;

    parent.dirtyChildren = [child1, child2, child3];

    const cursor: Cursor = vnode_newVirtual();

    getNextVNode(child1, cursor);

    expect(parent.dirtyChildren).toBeNull();
    expect(parent.nextDirtyChildIndex).toBe(0);
    expect((parent.dirty & ChoreBits.CHILDREN) === 0).toBe(true);
  });
});
