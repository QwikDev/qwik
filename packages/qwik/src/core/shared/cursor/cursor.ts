import { VNodeFlags } from '../../client/types';
import type { Container } from '../types';
import type { VNode } from '../vnode/vnode';
import { setCursorPriority, setCursorPosition, setCursorContainer } from './cursor-props';
import { addCursorToQueue } from './cursor-queue';
import { triggerCursors } from './cursor-walker';

/**
 * A cursor is a vNode that has the CURSOR flag set and priority stored in props.
 *
 * The cursor root is the vNode where the cursor was created (the dirty root). The cursor's current
 * position is tracked in the vNode's props.
 */
export type Cursor = VNode;

/**
 * Adds a cursor to the given vNode (makes the vNode a cursor). Sets the cursor priority and
 * position to the root vNode itself.
 *
 * @param root - The vNode that will become the cursor root (dirty root)
 * @param priority - Priority level (lower = higher priority, 0 is default)
 * @returns The vNode itself, now acting as a cursor
 */
export function addCursor(container: Container, root: VNode, priority: number): Cursor {
  setCursorPriority(root, priority);
  setCursorPosition(container, root, root);
  setCursorContainer(root, container);

  const cursor = root as Cursor;
  cursor.flags |= VNodeFlags.Cursor;
  // Add cursor to global queue
  addCursorToQueue(container, cursor);

  triggerCursors();

  return cursor;
}

/**
 * Checks if a vNode is a cursor (has CURSOR flag set).
 *
 * @param vNode - The vNode to check
 * @returns True if the vNode has the CURSOR flag set
 */
export function isCursor(vNode: VNode): vNode is Cursor {
  return (vNode.flags & VNodeFlags.Cursor) !== 0;
}

/**
 * Pauses a cursor at the given vNode position. Sets the cursor position for time-slicing or promise
 * waiting.
 *
 * @param cursor - The cursor (vNode with CURSOR flag set) to pause
 * @param vNode - The vNode position to pause at
 */
export function pauseCursor(container: Container, cursor: Cursor, vNode: VNode): void {
  setCursorPosition(container, cursor, vNode);
}

/**
 * Checks if a cursor is complete (root vNode is clean). According to RFC section 3.2: "when a
 * cursor finally marks its root vNode clean, that means the entire subtree is clean."
 *
 * @param cursor - The cursor to check
 * @returns True if the cursor's root vNode has no dirty bits
 */
export function isCursorComplete(cursor: Cursor): boolean {
  return cursor.dirty === 0;
}

/**
 * Finds the root cursor for the given vNode.
 *
 * @param vNode - The vNode to find the cursor for
 * @returns The cursor that contains the vNode, or null if no cursor is found
 */
export function findCursor(vNode: VNode): Cursor | null {
  while (vNode) {
    if (isCursor(vNode)) {
      return vNode;
    }
    vNode = (vNode as VNode).parent || (vNode as VNode).slotParent!;
  }
  return null;
}
