/**
 * @file Cursor queue management for cursor-based scheduling.
 *
 *   Maintains a priority queue of cursors sorted by priority (lower = higher priority).
 */

import { VNodeFlags } from '../../client/types';
import { vnode_isDescendantOf } from '../../client/vnode-utils';
import type { Container } from '../types';
import type { Cursor } from './cursor';
import { getCursorData } from './cursor-props';

/** Global cursor queue array. Cursors are sorted by priority. */
const globalCursorQueue: Cursor[] = [];

const pausedCursorQueue: Cursor[] = [];

/**
 * Adds a cursor to the global queue.
 *
 * @param cursor - The cursor to add
 */
export function addCursorToQueue(container: Container, cursor: Cursor): void {
  const priority = getCursorData(cursor)!.priority;
  let insertIndex = globalCursorQueue.length;

  for (let i = 0; i < globalCursorQueue.length; i++) {
    const existingPriority = getCursorData(globalCursorQueue[i])!.priority;
    if (priority < existingPriority) {
      insertIndex = i;
      break;
    }
  }

  globalCursorQueue.splice(insertIndex, 0, cursor);

  container.$pendingCount$++;
  container.$renderPromise$ ||= new Promise((r) => (container.$resolveRenderPromise$ = r));
}

/**
 * Gets the highest priority cursor (lowest priority number) from the queue.
 *
 * @returns The highest priority cursor, or null if queue is empty
 */
export function getHighestPriorityCursor(): Cursor | null {
  for (let i = 0; i < globalCursorQueue.length; i++) {
    const cursor = globalCursorQueue[i];
    let isDescendantOfPaused = false;

    for (let j = 0; j < pausedCursorQueue.length; j++) {
      const pausedCursor = pausedCursorQueue[j];
      if (vnode_isDescendantOf(cursor, pausedCursor)) {
        isDescendantOfPaused = true;
        break;
      }
    }

    if (!isDescendantOfPaused) {
      return cursor;
    }
  }

  return null;
}

export function pauseCursor(cursor: Cursor, container: Container): void {
  pausedCursorQueue.push(cursor);
  removeCursorFromQueue(cursor, container, true);
  container.$pendingCount$++;
}

export function resumeCursor(cursor: Cursor, container: Container): void {
  const index = pausedCursorQueue.indexOf(cursor);
  if (index !== -1) {
    const lastIndex = pausedCursorQueue.length - 1;
    if (index !== lastIndex) {
      pausedCursorQueue[index] = pausedCursorQueue[lastIndex];
    }
    pausedCursorQueue.pop();
    container.$pendingCount$--;
  }
  addCursorToQueue(container, cursor);
}

/**
 * Returns true if there are cursors in the active (non-paused) queue.
 *
 * @internal
 */
export function hasActiveCursors(): boolean {
  return globalCursorQueue.length > 0;
}

/**
 * Remove all cursors (active and paused) belonging to a specific container. Used when a container
 * finishes rendering to ensure no orphaned cursors remain.
 *
 * @internal
 */
export function removeContainerCursors(container: Container): void {
  for (let i = globalCursorQueue.length - 1; i >= 0; i--) {
    const data = getCursorData(globalCursorQueue[i]);
    if (data && data.container === container) {
      globalCursorQueue[i].flags &= ~VNodeFlags.Cursor;
      globalCursorQueue.splice(i, 1);
      container.$pendingCount$--;
    }
  }
  for (let i = pausedCursorQueue.length - 1; i >= 0; i--) {
    const data = getCursorData(pausedCursorQueue[i]);
    if (data && data.container === container) {
      pausedCursorQueue[i].flags &= ~VNodeFlags.Cursor;
      pausedCursorQueue.splice(i, 1);
      container.$pendingCount$--;
    }
  }
}

/**
 * Removes a cursor from the global queue.
 *
 * @param cursor - The cursor to remove
 * @internal
 */
export function removeCursorFromQueue(
  cursor: Cursor,
  container: Container,
  keepCursorFlag?: boolean
): void {
  if (!keepCursorFlag) {
    cursor.flags &= ~VNodeFlags.Cursor;
  }
  const index = globalCursorQueue.indexOf(cursor);
  if (index !== -1) {
    // TODO: we can't use swap-and-remove algorithm because it will break the priority order
    // // Move last element to the position of the element to remove, then pop
    // const lastIndex = globalCursorQueue.length - 1;
    // if (index !== lastIndex) {
    //   globalCursorQueue[index] = globalCursorQueue[lastIndex];
    // }
    // globalCursorQueue.pop();
    globalCursorQueue.splice(index, 1);
    container.$pendingCount$--;
  }
}
