import type { VNodeJournal } from '../../client/vnode';
import { addCursor, findCursor, isCursor } from '../cursor/cursor';
import { getCursorData, type CursorData } from '../cursor/cursor-props';
import type { Container } from '../types';
import { ChoreBits } from './enums/chore-bits.enum';
import type { VNodeOperation } from './types/dom-vnode-operation';
import type { VNode } from './vnode';

/** Reusable path array to avoid allocations */
const reusablePath: VNode[] = [];

/** Propagates CHILDREN dirty bits through the collected path up to the target ancestor */
function propagatePath(target: VNode): void {
  for (let i = 0; i < reusablePath.length; i++) {
    const child = reusablePath[i];
    const parent = reusablePath[i + 1] || target;
    parent.dirty |= ChoreBits.CHILDREN;
    parent.dirtyChildren ||= [];
    parent.dirtyChildren.push(child);
  }
}

/**
 * Propagates dirty bits from vNode up to the specified cursorRoot. Used during diff when we know
 * the cursor root to merge with. Also updates cursor position if we pass through any cursors.
 */
function propagateToCursorRoot(vNode: VNode, cursorRoot: VNode): void {
  reusablePath.push(vNode);
  let current: VNode | null = vNode.parent || vNode.slotParent;

  while (current) {
    const isDirty = current.dirty & ChoreBits.DIRTY_MASK;
    const currentIsCursor = isCursor(current);

    // Stop when we reach the cursor root or a dirty ancestor
    if (current === cursorRoot || isDirty) {
      propagatePath(current);
      // Update cursor position if current is a cursor
      if (currentIsCursor) {
        const cursorData: CursorData = getCursorData(current)!;
        if (cursorData.position !== current) {
          cursorData.position = vNode;
        }
      }
      reusablePath.length = 0;
      return;
    }

    // Update cursor position if we pass through a cursor on the way up
    if (currentIsCursor) {
      const cursorData: CursorData = getCursorData(current)!;
      if (cursorData.position !== current) {
        cursorData.position = vNode;
      }
    }

    reusablePath.push(current);
    current = current.parent || current.slotParent;
  }
  reusablePath.length = 0;
}

/**
 * Finds a blocking cursor or dirty ancestor and propagates dirty bits to it. Returns true if found
 * and attached, false if a new cursor should be created.
 */
function findAndPropagateToBlockingCursor(vNode: VNode): boolean {
  reusablePath.push(vNode);
  let current: VNode | null = vNode.parent || vNode.slotParent;

  while (current) {
    const currentIsCursor = isCursor(current);
    const isBlockingCursor = currentIsCursor && getCursorData(current)?.isBlocking;

    if (isBlockingCursor) {
      propagatePath(current);
      reusablePath.length = 0;
      return true;
    }

    // Found non-blocking cursor - no point looking further up
    if (currentIsCursor) {
      reusablePath.length = 0;
      return false;
    }

    reusablePath.push(current);
    current = current.parent || current.slotParent;
  }
  reusablePath.length = 0;
  return false;
}

/**
 * Marks a vNode as dirty and propagates dirty bits up the tree.
 *
 * @param container - The container
 * @param vNode - The vNode to mark dirty
 * @param bits - The dirty bits to set
 * @param cursorRoot - If provided, propagate dirty bits up to this cursor root (used during diff).
 *   If null, will search for a blocking cursor or create a new one.
 */
export function markVNodeDirty(
  container: Container,
  vNode: VNode,
  bits: ChoreBits,
  cursorRoot: VNode | null = null
): void {
  const prevDirty = vNode.dirty;
  vNode.dirty |= bits;
  const isRealDirty = bits & ChoreBits.DIRTY_MASK;
  // If already dirty, no need to propagate again
  if (isRealDirty ? prevDirty & ChoreBits.DIRTY_MASK : prevDirty) {
    return;
  }
  const parent = vNode.parent || vNode.slotParent;

  // If cursorRoot is provided, propagate up to it
  if (cursorRoot && isRealDirty && parent && !parent.dirty) {
    propagateToCursorRoot(vNode, cursorRoot);
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
    // Check if there's an existing cursor that is blocking (executing a render-blocking task)
    // If so, merge with it instead of creating a new cursor (single-pass find + propagate)
    if (!findAndPropagateToBlockingCursor(vNode)) {
      // No blocking cursor found, create a new one
      addCursor(container, vNode, 0);
    }
  }
}

export function addVNodeOperation(journal: VNodeJournal, operation: VNodeOperation): void {
  journal.push(operation);
}
