import { describe, expect, it } from 'vitest';
import { vnode_newVirtual } from '../../client/vnode-utils';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import type { VirtualVNode } from '../vnode/virtual-vnode';
import type { Cursor } from './cursor';
import { getNextVNode, partitionDirtyChildren, tryDescendDirtyChildren } from './cursor-walker';
import { setCursorData, type CursorData } from './cursor-props';
import type { Container } from '../types';

describe('getNextVNode', () => {
  it('should return next dirty sibling in simple parent-children structure', () => {
    //   <parent>              [CHILDREN*]
    //     <child1 />          [COMPONENT*]  (already processed)
    //     <child2 />          [COMPONENT*]  ← expected next
    //   </parent>
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;
    parent.nextDirtyChildIndex = 1; // start at child2 (child1 already processed)

    const child1 = vnode_newVirtual() as VirtualVNode;
    child1.parent = parent;
    child1.dirty = ChoreBits.COMPONENT;

    const child2 = vnode_newVirtual() as VirtualVNode;
    child2.parent = parent;
    child2.dirty = ChoreBits.COMPONENT;

    parent.dirtyChildren = [child1, child2];

    const cursor: Cursor = vnode_newVirtual();

    expect(getNextVNode(child1, cursor)).toBe(child2);
    expect(parent.nextDirtyChildIndex).toBe(0); // wraps around to 0 (2 % 2)
  });

  it('should return cursor itself when vNode is cursor and cursor is dirty', () => {
    const cursor: Cursor = vnode_newVirtual();
    cursor.dirty = ChoreBits.COMPONENT;

    expect(getNextVNode(cursor, cursor)).toBe(cursor);
  });

  it('should return null when vNode is cursor and cursor is clean', () => {
    const cursor: Cursor = vnode_newVirtual();
    cursor.dirty = 0;

    expect(getNextVNode(cursor, cursor)).toBeNull();
  });

  it('should find next via structural parent when slotParent is not dirty', () => {
    // slotParent exists but is NOT dirty -> falls through to structural parent
    //
    //   <parent>              [CHILDREN*]
    //     <child1 />          (done, dirty=0)  parent=parent, slotParent=cleanSlotParent
    //     <child2 />          [COMPONENT*]     parent=parent  ← expected
    //   </parent>
    //
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;
    parent.nextDirtyChildIndex = 0;

    const cleanSlotParent = vnode_newVirtual() as VirtualVNode;
    cleanSlotParent.dirty = 0; // not dirty — must not be chosen

    const child1 = vnode_newVirtual() as VirtualVNode;
    child1.parent = parent;
    child1.slotParent = cleanSlotParent;
    child1.dirty = 0;

    const child2 = vnode_newVirtual() as VirtualVNode;
    child2.parent = parent;
    child2.dirty = ChoreBits.COMPONENT;

    parent.dirtyChildren = [child1, child2];

    const cursor: Cursor = vnode_newVirtual();

    expect(getNextVNode(child1, cursor)).toBe(child2);
  });

  it('should return cursor when no parent or slotParent is dirty and cursor is dirty', () => {
    // Neither parent nor slotParent has CHILDREN set -> fall back to cursor
    const node = vnode_newVirtual() as VirtualVNode;
    node.parent = null;
    node.slotParent = null;

    const cursor: Cursor = vnode_newVirtual();
    cursor.dirty = ChoreBits.COMPONENT;

    expect(getNextVNode(node, cursor)).toBe(cursor);
  });

  it('should return null when no parent or slotParent is dirty and cursor is clean', () => {
    // Neither parent nor slotParent has CHILDREN set, cursor is also clean
    const node = vnode_newVirtual() as VirtualVNode;
    node.parent = null;
    node.slotParent = null;

    const cursor: Cursor = vnode_newVirtual();
    cursor.dirty = 0;

    expect(getNextVNode(node, cursor)).toBeNull();
  });

  it('should wrap nextDirtyChildIndex when first dirty child is behind the current index', () => {
    // nextDirtyChildIndex starts at 2 (past the dirty child at index 0) so the scan
    // must wrap around: check [2], [0(dirty)] → returns dirtyChildren[0], sets index to 1
    //
    //   <parent>              [CHILDREN*]  nextDirtyChildIndex=2
    //     <dirty />           [COMPONENT*]
    //     <clean1 />          (dirty=0)
    //     <clean2 />          (dirty=0)
    //   </parent>
    //
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;
    parent.nextDirtyChildIndex = 2; // starts past the only dirty child

    const dirty = vnode_newVirtual() as VirtualVNode;
    dirty.parent = parent;
    dirty.dirty = ChoreBits.COMPONENT;

    const clean1 = vnode_newVirtual() as VirtualVNode;
    clean1.parent = parent;
    clean1.dirty = 0;

    const clean2 = vnode_newVirtual() as VirtualVNode;
    clean2.parent = parent;
    clean2.dirty = 0;

    parent.dirtyChildren = [dirty, clean1, clean2];

    // Use a sibling of parent so getNextVNode routes through parent
    const sibling = vnode_newVirtual() as VirtualVNode;
    sibling.parent = parent;
    sibling.dirty = 0;

    const cursor: Cursor = vnode_newVirtual();

    const next = getNextVNode(sibling, cursor);

    expect(next).toBe(dirty);
    expect(parent.nextDirtyChildIndex).toBe(1); // advanced past dirty (index 0), wraps to 1
  });

  it('should advance to next sibling via slotParent after a projection is processed', () => {
    // JSX:
    //
    //   <Parent>                     [CHILDREN*]
    //     <Child>                    [CHILDREN*]
    //       <Unrelated />            [COMPONENT*]
    //       <Slot />                 <- ProjectedContent inserted here (parent=Child)
    //     </Child>
    //     <ProjectedContent />       (done, dirty=0)  slotParent=Parent
    //     <AnotherContent />         [COMPONENT*]     slotParent=Parent  ← expected
    //   </Parent>
    //
    const Parent = vnode_newVirtual() as VirtualVNode;
    Parent.dirty = ChoreBits.CHILDREN;
    Parent.nextDirtyChildIndex = 0;

    const Child = vnode_newVirtual() as VirtualVNode;
    Child.parent = Parent;
    Child.dirty = ChoreBits.CHILDREN;

    const Unrelated = vnode_newVirtual() as VirtualVNode;
    Unrelated.parent = Child;
    Unrelated.dirty = ChoreBits.COMPONENT;
    Child.dirtyChildren = [Unrelated];
    Child.nextDirtyChildIndex = 0;

    const ProjectedContent = vnode_newVirtual() as VirtualVNode;
    ProjectedContent.parent = Child; // placed in DOM
    ProjectedContent.slotParent = Parent; // owned by Parent
    ProjectedContent.dirty = 0; // already processed — dirty cleared

    const AnotherContent = vnode_newVirtual() as VirtualVNode;
    AnotherContent.slotParent = Parent;
    AnotherContent.dirty = ChoreBits.COMPONENT;

    Parent.dirtyChildren = [ProjectedContent, AnotherContent];
    Parent.nextDirtyChildIndex = 0;

    const cursor: Cursor = vnode_newVirtual();

    const next = getNextVNode(ProjectedContent, cursor);

    expect(next).toBe(AnotherContent);
  });

  it('should reset vnode cursor data when no dirty children remain', () => {
    // All children are clean -> clears CHILDREN bit, nulls dirtyChildren, resets index
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty |= ChoreBits.CHILDREN;
    parent.nextDirtyChildIndex = 2;

    const child1 = vnode_newVirtual() as VirtualVNode;
    child1.parent = parent;
    const child2 = vnode_newVirtual() as VirtualVNode;
    child2.parent = parent;
    const child3 = vnode_newVirtual() as VirtualVNode;
    child3.parent = parent;

    parent.dirtyChildren = [child1, child2, child3];

    const cursor: Cursor = vnode_newVirtual();

    getNextVNode(child1, cursor);

    expect(parent.dirtyChildren).toBeNull();
    expect(parent.nextDirtyChildIndex).toBe(0);
    expect((parent.dirty & ChoreBits.CHILDREN) === 0).toBe(true);
  });
});

describe('partitionDirtyChildren', () => {
  it('should move non-projections to the front', () => {
    // Given mixed array: [projection1, regular1, projection2, regular2]
    // Expected: non-projections first, projections last (exact order within each group preserved)
    const parent = vnode_newVirtual() as VirtualVNode;

    const projection1 = vnode_newVirtual() as VirtualVNode;
    projection1.slotParent = parent; // projection — no parent set to parent

    const regular1 = vnode_newVirtual() as VirtualVNode;
    regular1.parent = parent;

    const projection2 = vnode_newVirtual() as VirtualVNode;
    projection2.slotParent = parent;

    const regular2 = vnode_newVirtual() as VirtualVNode;
    regular2.parent = parent;

    const dirtyChildren = [projection1, regular1, projection2, regular2];

    partitionDirtyChildren(dirtyChildren, parent);

    // First two should be non-projections
    expect(dirtyChildren[0]).toBe(regular1);
    expect(dirtyChildren[1]).toBe(regular2);
    // Last two should be projections,
    // may be in original order but not guaranteed, so check with toContain
    const lastTwo = [dirtyChildren[2], dirtyChildren[3]];
    expect(lastTwo).toContain(projection1);
    expect(lastTwo).toContain(projection2);
  });

  it('should handle all non-projections', () => {
    const parent = vnode_newVirtual() as VirtualVNode;

    const child1 = vnode_newVirtual() as VirtualVNode;
    child1.parent = parent;
    const child2 = vnode_newVirtual() as VirtualVNode;
    child2.parent = parent;

    const dirtyChildren = [child2, child1];

    partitionDirtyChildren(dirtyChildren, parent);

    // Order preserved when all are non-projections
    expect(dirtyChildren[0]).toBe(child2);
    expect(dirtyChildren[1]).toBe(child1);
  });

  it('should handle all projections', () => {
    const parent = vnode_newVirtual() as VirtualVNode;

    const proj1 = vnode_newVirtual() as VirtualVNode;
    proj1.slotParent = parent;
    const proj2 = vnode_newVirtual() as VirtualVNode;
    proj2.slotParent = parent;

    const dirtyChildren = [proj1, proj2];

    partitionDirtyChildren(dirtyChildren, parent);

    // Order preserved when all are projections
    expect(dirtyChildren[0]).toBe(proj1);
    expect(dirtyChildren[1]).toBe(proj2);
  });
});

describe('tryDescendDirtyChildren', () => {
  const createMockContainer = () =>
    ({
      handleError: () => {},
    }) as unknown as Container;

  const createCursorData = (cursor: Cursor): CursorData => {
    const cursorData: CursorData = {
      container: createMockContainer(),
      position: cursor,
      promise: null,
      journal: null,
      extraPromises: null,
      afterFlushTasks: null,
      priority: 0,
    };
    setCursorData(cursor, cursorData);
    return cursorData;
  };

  it('should return null and clear CHILDREN bit when dirtyChildren is null', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;
    parent.dirtyChildren = null;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    expect(result).toBeNull();
    expect((parent.dirty & ChoreBits.CHILDREN) === 0).toBe(true);
  });

  it('should return null and clear CHILDREN bit when dirtyChildren is empty', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;
    parent.dirtyChildren = [];

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    expect(result).toBeNull();
    expect((parent.dirty & ChoreBits.CHILDREN) === 0).toBe(true);
  });

  it('should clean up when all children are no longer dirty', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const clean1 = vnode_newVirtual() as VirtualVNode;
    clean1.parent = parent;
    clean1.dirty = 0;

    const clean2 = vnode_newVirtual() as VirtualVNode;
    clean2.parent = parent;
    clean2.dirty = 0;

    parent.dirtyChildren = [clean1, clean2];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    expect(result).toBeNull();
    expect((parent.dirty & ChoreBits.CHILDREN) === 0).toBe(true);
    expect(parent.dirtyChildren).toBeNull();
    expect(parent.nextDirtyChildIndex).toBe(0);
  });

  it('should return first dirty child and set nextDirtyChildIndex', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const dirty1 = vnode_newVirtual() as VirtualVNode;
    dirty1.parent = parent;
    dirty1.dirty = ChoreBits.COMPONENT;

    const dirty2 = vnode_newVirtual() as VirtualVNode;
    dirty2.parent = parent;
    dirty2.dirty = ChoreBits.COMPONENT;

    parent.dirtyChildren = [dirty1, dirty2];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    expect(result).toBe(dirty1);
    expect(parent.nextDirtyChildIndex).toBe(1);
    expect(cursorData.position).toBe(dirty1);
  });

  it('should return first dirty projection without following parent pointer', () => {
    //   <Parent>              [CHILDREN*]
    //     <Child>             [CHILDREN*]
    //       <Unrelated />     [COMPONENT*]
    //     </Child>
    //     <Projection />      [COMPONENT*]  parent=Child, slotParent=Parent
    //   </Parent>
    const Parent = vnode_newVirtual() as VirtualVNode;
    Parent.dirty = ChoreBits.CHILDREN;

    const Child = vnode_newVirtual() as VirtualVNode;
    Child.parent = Parent;
    Child.dirty = ChoreBits.CHILDREN;

    const Unrelated = vnode_newVirtual() as VirtualVNode;
    Unrelated.parent = Child;
    Unrelated.dirty = ChoreBits.COMPONENT;
    Child.dirtyChildren = [Unrelated];

    const Projection = vnode_newVirtual() as VirtualVNode;
    Projection.parent = Child; // placed in DOM (structural parent)
    Projection.slotParent = Parent; // owned by Parent (logical parent)
    Projection.dirty = ChoreBits.COMPONENT;

    Parent.dirtyChildren = [Projection];
    Parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, Parent, cursor);

    // Must return Projection (from Parent.dirtyChildren), NOT Unrelated (from Child.dirtyChildren)
    expect(result).toBe(Projection);
    expect(cursorData.position).toBe(Projection);
  });

  it('should partition non-projections first, then return first dirty', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const projection = vnode_newVirtual() as VirtualVNode;
    projection.slotParent = parent;
    projection.dirty = ChoreBits.COMPONENT;

    const regular = vnode_newVirtual() as VirtualVNode;
    regular.parent = parent;
    regular.dirty = ChoreBits.COMPONENT;

    // Start with projection first in the array
    parent.dirtyChildren = [projection, regular];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    // After partition: [regular, projection]
    expect(parent.dirtyChildren[0]).toBe(regular);
    expect(parent.dirtyChildren[1]).toBe(projection);
    // Returns first element (regular)
    expect(result).toBe(regular);
  });

  it('should find dirty child when starting from non-zero index with clean child at index 0', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const clean = vnode_newVirtual() as VirtualVNode;
    clean.parent = parent;
    clean.dirty = 0;

    const dirty1 = vnode_newVirtual() as VirtualVNode;
    dirty1.parent = parent;
    dirty1.dirty = ChoreBits.COMPONENT;

    const dirty2 = vnode_newVirtual() as VirtualVNode;
    dirty2.parent = parent;
    dirty2.dirty = ChoreBits.NODE_DIFF;

    parent.dirtyChildren = [clean, dirty1, dirty2];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    // Should skip index 0 (clean) and return index 1 (dirty1)
    expect(result).toBe(dirty1);
    expect(parent.nextDirtyChildIndex).toBe(2);
    expect(cursorData.position).toBe(dirty1);
  });

  it('should wrap nextDirtyChildIndex using modulo when reaching end of array', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const dirty = vnode_newVirtual() as VirtualVNode;
    dirty.parent = parent;
    dirty.dirty = ChoreBits.COMPONENT;

    const clean1 = vnode_newVirtual() as VirtualVNode;
    clean1.parent = parent;
    clean1.dirty = 0;

    const clean2 = vnode_newVirtual() as VirtualVNode;
    clean2.parent = parent;
    clean2.dirty = 0;

    parent.dirtyChildren = [dirty, clean1, clean2];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    // Should return dirty at index 0
    expect(result).toBe(dirty);
    // nextDirtyChildIndex should be (0 + 1) % 3 = 1
    expect(parent.nextDirtyChildIndex).toBe(1);
  });

  it('should handle array with single dirty element correctly', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const dirty = vnode_newVirtual() as VirtualVNode;
    dirty.parent = parent;
    dirty.dirty = ChoreBits.TASKS;

    parent.dirtyChildren = [dirty];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    expect(result).toBe(dirty);
    // (0 + 1) % 1 = 0
    expect(parent.nextDirtyChildIndex).toBe(0);
    expect(cursorData.position).toBe(dirty);
  });

  it('should skip multiple clean children before finding dirty one', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const clean1 = vnode_newVirtual() as VirtualVNode;
    clean1.parent = parent;
    clean1.dirty = 0;

    const clean2 = vnode_newVirtual() as VirtualVNode;
    clean2.parent = parent;
    clean2.dirty = 0;

    const clean3 = vnode_newVirtual() as VirtualVNode;
    clean3.parent = parent;
    clean3.dirty = 0;

    const dirty = vnode_newVirtual() as VirtualVNode;
    dirty.parent = parent;
    dirty.dirty = ChoreBits.COMPUTE;

    parent.dirtyChildren = [clean1, clean2, clean3, dirty];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    expect(result).toBe(dirty);
    // (3 + 1) % 4 = 0
    expect(parent.nextDirtyChildIndex).toBe(0);
    expect(cursorData.position).toBe(dirty);
  });

  it('should handle mix of regular children and projections with proper partitioning', () => {
    const parent = vnode_newVirtual() as VirtualVNode;
    parent.dirty = ChoreBits.CHILDREN;

    const projection1 = vnode_newVirtual() as VirtualVNode;
    projection1.slotParent = parent;
    projection1.dirty = ChoreBits.COMPONENT;

    const regular1 = vnode_newVirtual() as VirtualVNode;
    regular1.parent = parent;
    regular1.dirty = 0; // clean

    const projection2 = vnode_newVirtual() as VirtualVNode;
    projection2.slotParent = parent;
    projection2.dirty = ChoreBits.NODE_DIFF;

    const regular2 = vnode_newVirtual() as VirtualVNode;
    regular2.parent = parent;
    regular2.dirty = ChoreBits.TASKS;

    // Mix of projections and regulars
    parent.dirtyChildren = [projection1, regular1, projection2, regular2];
    parent.nextDirtyChildIndex = 0;

    const cursor = vnode_newVirtual() as VirtualVNode;
    const cursorData = createCursorData(cursor);

    const result = tryDescendDirtyChildren(createMockContainer(), cursorData, parent, cursor);

    // After partition: regulars first [regular1, regular2], then projections [projection1, projection2]
    // First two items should be regulars
    expect(parent.dirtyChildren[0].parent).toBe(parent);
    expect(parent.dirtyChildren[1].parent).toBe(parent);
    // Last two should be projections
    expect(parent.dirtyChildren[2].slotParent).toBe(parent);
    expect(parent.dirtyChildren[3].slotParent).toBe(parent);

    // Should return first dirty child after partitioning (skipping clean regular1)
    expect(result).toBe(regular2);
  });
});
