import type { VNodeJournal } from '../../client/vnode';
import { addCursor, findCursor, isCursor } from '../cursor/cursor';
import { getCursorData, type CursorData } from '../cursor/cursor-props';
import type { Container } from '../types';
import { ChoreBits } from './enums/chore-bits.enum';
import type { VNodeOperation } from './types/dom-vnode-operation';
import type { VNode } from './vnode';

export function markVNodeDirty(
  container: Container,
  vNode: VNode,
  bits: ChoreBits,
  mergeWithParentCursor = false
): void {
  const prevDirty = vNode.dirty;
  vNode.dirty |= bits;
  const isRealDirty = bits & ChoreBits.DIRTY_MASK;
  // If already dirty, no need to propagate again
  if (isRealDirty ? prevDirty & ChoreBits.DIRTY_MASK : prevDirty) {
    return;
  }
  let parent = vNode.parent || vNode.slotParent;
  if (mergeWithParentCursor && isRealDirty && parent && !parent.dirty) {
    let previousParent = vNode;
    while (parent) {
      const parentWasDirty = parent.dirty & ChoreBits.DIRTY_MASK;
      parent.dirty |= ChoreBits.CHILDREN;
      parent.dirtyChildren ||= [];
      parent.dirtyChildren.push(previousParent);
      if (isCursor(parent)) {
        const cursorData: CursorData = getCursorData(parent)!;
        if (cursorData.position !== parent) {
          cursorData.position = vNode;
        }
      }
      if (parentWasDirty) {
        break;
      }
      previousParent = parent;
      parent = parent.parent || parent.slotParent;
    }
    return;
  }
  // We must attach to a cursor subtree if it exists
  if (parent && parent.dirty & ChoreBits.DIRTY_MASK) {
    if (isRealDirty) {
      parent.dirty |= ChoreBits.CHILDREN;
    }
    parent.dirtyChildren ||= [];
    parent.dirtyChildren.push(vNode);

    if (isRealDirty && vNode.dirtyChildren) {
      // this node is maybe an ancestor of the current cursor position
      // if so we must restart from here
      const cursor = findCursor(vNode);
      if (cursor) {
        const cursorData = getCursorData(cursor)!;
        let cursorPosition = cursorData.position;
        if (cursorPosition) {
          // find the ancestor of the cursor position that is current vNode
          while (cursorPosition !== cursor) {
            cursorPosition = cursorPosition.parent || cursorPosition.slotParent!;
            if (cursorPosition === vNode) {
              // set cursor position to this node
              cursorData.position = vNode;
              break;
            }
          }
        }
      }
    }
  } else if (!isCursor(vNode)) {
    addCursor(container, vNode, 0);
  }
}

export function addVNodeOperation(journal: VNodeJournal, operation: VNodeOperation): void {
  journal.push(operation);
}
