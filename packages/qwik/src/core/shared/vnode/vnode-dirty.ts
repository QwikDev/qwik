import type { VNodeJournal } from '../../client/vnode';
import { addCursor, findCursor } from '../cursor/cursor';
import { getCursorPosition, setCursorPosition } from '../cursor/cursor-props';
import type { Container } from '../types';
import { ChoreBits } from './enums/chore-bits.enum';
import type { VNodeOperation } from './types/dom-vnode-operation';
import type { VNode } from './vnode';

export function markVNodeDirty(container: Container, vNode: VNode, bits: ChoreBits): void {
  const prevDirty = vNode.dirty;
  vNode.dirty |= bits;
  const isRealDirty = bits & ChoreBits.DIRTY_MASK;
  // If already dirty, no need to propagate again
  if (isRealDirty ? prevDirty & ChoreBits.DIRTY_MASK : prevDirty) {
    return;
  }
  const parent = vNode.parent || vNode.slotParent;
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
        let cursorPosition = getCursorPosition(cursor);
        if (cursorPosition) {
          // find the ancestor of the cursor position that is current vNode
          while (cursorPosition !== cursor) {
            cursorPosition = cursorPosition.parent || cursorPosition.slotParent!;
            if (cursorPosition === vNode) {
              // set cursor position to this node
              setCursorPosition(container, cursor, vNode);
              break;
            }
          }
        }
      }
    }
  } else {
    addCursor(container, vNode, 0);
  }
}

export function addVNodeOperation(journal: VNodeJournal, operation: VNodeOperation): void {
  journal.push(operation);
}
