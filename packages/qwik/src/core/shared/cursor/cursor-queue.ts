/**
 * @file Cursor queue management for cursor-based scheduling.
 *
 *   Maintains a priority queue of cursors sorted by priority (lower = higher priority).
 */

import { VNodeFlags } from '../../client/types';
import type { Container } from '../types';
import type { Cursor } from './cursor';
import { getCursorPriority } from './cursor-props';

/** Global cursor queue array. Cursors are sorted by priority. */
let globalCursorQueue: Cursor[] = [];

/**
 * Adds a cursor to the global queue. If the cursor already exists, it's removed and re-added to
 * maintain correct priority order.
 *
 * @param cursor - The cursor to add
 */
export function addCursorToQueue(container: Container, cursor: Cursor): void {
  const priority = getCursorPriority(cursor)!;
  let insertIndex = globalCursorQueue.length;

  for (let i = 0; i < globalCursorQueue.length; i++) {
    const existingPriority = getCursorPriority(globalCursorQueue[i])!;
    if (priority < existingPriority) {
      insertIndex = i;
      break;
    }
  }

  globalCursorQueue.splice(insertIndex, 0, cursor);

  container.$cursorCount$++;
  container.$renderPromise$ ||= new Promise((r) => (container.$resolveRenderPromise$ = r));
}

/**
 * Gets the highest priority cursor (lowest priority number) from the queue.
 *
 * @returns The highest priority cursor, or null if queue is empty
 */
export function getHighestPriorityCursor(): Cursor | null {
  return globalCursorQueue.length > 0 ? globalCursorQueue[0] : null;
}

/**
 * Removes a cursor from the global queue using swap-and-remove algorithm for O(1) removal.
 *
 * @param cursor - The cursor to remove
 */
export function removeCursorFromQueue(cursor: Cursor): void {
  cursor.flags &= ~VNodeFlags.Cursor;
  const index = globalCursorQueue.indexOf(cursor);
  if (index !== -1) {
    // Move last element to the position of the element to remove, then pop
    const lastIndex = globalCursorQueue.length - 1;
    if (index !== lastIndex) {
      globalCursorQueue[index] = globalCursorQueue[lastIndex];
    }
    globalCursorQueue.pop();
  }
}

/**
 * Checks if the global cursor queue is empty.
 *
 * @returns True if the queue is empty
 */
export function isCursorQueueEmpty(): boolean {
  return globalCursorQueue.length === 0;
}

/**
 * Gets the number of cursors in the global queue.
 *
 * @returns The number of cursors
 */
export function getCursorQueueSize(): number {
  return globalCursorQueue.length;
}

/** Clears all cursors from the global queue. */
export function clearCursorQueue(): void {
  globalCursorQueue = [];
}
