/**
 * @file Cursor walker implementation for cursor-based scheduling.
 *
 *   Implements depth-first traversal of the vDOM tree, processing dirty vNodes and their children.
 *   Handles promise blocking, time-slicing, and cursor position tracking.
 */

import { isServerPlatform } from '../platform/platform';
import type { VNode } from '../vnode/vnode';
import {
  executeCleanup,
  executeComponentChore,
  executeCompute,
  executeErrorWrap,
  executeNodeDiff,
  executeNodeProps,
  executeReconcile,
  executeTasks,
} from './chore-execution';
import { type Cursor } from './cursor';
import { setCursorPosition, getCursorData, type CursorData } from './cursor-props';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import {
  getHighestPriorityCursor,
  pauseCursor,
  removeCursorFromQueue,
  resumeCursor,
} from './cursor-queue';
import { executeFlushPhase } from './cursor-flush';
import { createMicroTask, createMacroTask } from '../platform/next-tick';
import { isPromise } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { assertDefined, assertFalse } from '../error/assert';
import type { Container } from '../types';
import { VNodeFlags } from '../../client/types';
import { isDev, isServer } from '@qwik.dev/core/build';
import { QNearestCursorBoundary } from '../utils/markers';
import { vnode_setProp } from '../../client/vnode-utils';
import { getNearestCursorBoundary } from '../vnode/vnode-dirty';

const DEBUG = false;

const nextMicroTask = createMicroTask(processCursorQueue);
const nextMacroTask = createMacroTask(processCursorQueue);
let isNextTickScheduled = false;

export function triggerCursors(): void {
  if (!isNextTickScheduled) {
    isNextTickScheduled = true;
    nextMicroTask();
  }
}

/** Schedule continuation as macrotask to yield to browser (for time-slicing) */
function scheduleYield(): void {
  if (!isNextTickScheduled) {
    isNextTickScheduled = true;
    nextMacroTask();
  }
}

/**
 * Processes the cursor queue, walking each cursor in turn.
 *
 * @param options - Walk options (time budget, etc.)
 */
export function processCursorQueue(): void {
  isNextTickScheduled = false;
  const startTime = performance.now();
  const yieldTime = startTime + 15; // 16 ms = 60 FPS, use 15 to yield slightly before next frame

  let cursor: Cursor | null = null;
  while ((cursor = getHighestPriorityCursor())) {
    if (walkCursor(cursor, yieldTime)) {
      // Cursor overran time budget, yield to browser
      // Note that each tick we process at least one thing
      scheduleYield();
      return;
    }
  }
}

/**
 * Walks a cursor through the vDOM tree, processing dirty vNodes in depth-first order.
 *
 * The walker:
 *
 * 1. Starts from the cursor root (or resumes from cursor position)
 * 2. Processes dirty vNodes using executeChoreSequence
 * 3. If the vNode is not dirty, moves to the next vNode
 * 4. If the vNode is dirty, executes the chores
 * 5. If the chore is a promise, pauses the cursor and resumes in next tick
 * 6. If the time budget is exceeded, pauses the cursor and resumes in next tick
 * 7. Updates cursor position as it walks
 *
 * Note that there is only one walker for all containers in the app with the same Qwik version.
 *
 * @param cursor - The cursor to walk
 * @param until - Time budget (timestamp to yield by)
 * @returns `true` if the walk was paused due to time budget (do not process more cursors in this
 *   tick)
 */
export function walkCursor(cursor: Cursor, until: number): boolean | void {
  const isRunningOnServer = import.meta.env.TEST ? isServerPlatform() : isServer;

  const cursorData = getCursorData(cursor)!;

  // Check if cursor is blocked by a promise
  const blockingPromise = cursorData.promise;
  if (blockingPromise) {
    return;
  }

  const container = cursorData.container;
  isDev && assertDefined(container, 'Cursor container not found');

  // Check if cursor is already complete
  if (!cursor.dirty) {
    finishWalk(container, cursor, cursorData, isRunningOnServer);
    return;
  }

  const journal = (cursorData.journal ||= []);

  // Get starting position (resume from last position or start at root)
  let currentVNode: VNode | null = null;

  let count = 0;
  while ((currentVNode = cursorData.position)) {
    DEBUG && console.warn('walkCursor', currentVNode.toString());
    if (DEBUG && count++ > 1000) {
      throw new Error('Infinite loop detected in cursor walker');
    }
    if (cursorData.promise) {
      return;
    }

    // Skip if the vNode is not dirty
    if (!(currentVNode.dirty & ChoreBits.DIRTY_MASK)) {
      // Move to next node
      clearNearestCursorBoundary(currentVNode);
      setCursorPosition(container, cursorData, getNextVNode(currentVNode, cursor));
      continue;
    }

    // Skip if the vNode is deleted
    if (currentVNode.flags & VNodeFlags.Deleted) {
      // if deleted, run cleanup if needed
      if (currentVNode.dirty & ChoreBits.CLEANUP) {
        executeCleanup(currentVNode, container);
      } else if (currentVNode.dirty & ChoreBits.CHILDREN) {
        const next = tryDescendDirtyChildren(container, cursorData, currentVNode, cursor);
        if (next !== null) {
          currentVNode = next;
          continue;
        }
      }
      // Clear dirty bits and move to next node
      currentVNode.dirty &= ~ChoreBits.DIRTY_MASK;
      setCursorPosition(container, cursorData, getNextVNode(currentVNode, cursor));
      continue;
    }

    let result: ValueOrPromise<void> | undefined;
    try {
      // Execute chores in order
      if (currentVNode.dirty & ChoreBits.TASKS) {
        result = executeTasks(currentVNode, container, cursorData);
      } else if (currentVNode.dirty & ChoreBits.NODE_DIFF) {
        result = executeNodeDiff(currentVNode, container, journal, cursor);
      } else if (currentVNode.dirty & ChoreBits.COMPONENT) {
        result = executeComponentChore(currentVNode, container, journal, cursor);
      } else if (currentVNode.dirty & ChoreBits.RECONCILE) {
        result = executeReconcile(currentVNode, container, journal, cursor);
      } else if (currentVNode.dirty & ChoreBits.NODE_PROPS) {
        executeNodeProps(currentVNode, journal);
      } else if (currentVNode.dirty & ChoreBits.COMPUTE) {
        result = executeCompute(currentVNode, container);
      } else if (currentVNode.dirty & ChoreBits.CHILDREN) {
        const next = tryDescendDirtyChildren(container, cursorData, currentVNode, cursor);
        if (next !== null) {
          currentVNode = next;
          continue;
        }
      } else if (currentVNode.dirty & ChoreBits.ERROR_WRAP) {
        // Must run after CHILDREN so that all descendant chores (e.g. signal text
        // NODE_DIFF updates) are flushed before we reparent children into the
        // errored-host wrapper element.
        executeErrorWrap(currentVNode, journal);
      }
    } catch (error) {
      container.handleError(error, currentVNode);
    }

    // Handle blocking promise
    if (result && isPromise(result)) {
      DEBUG && console.warn('walkCursor: blocking promise', currentVNode.toString());
      addCursorBoundary(cursorData, currentVNode);
      // Store promise on cursor and pause
      cursorData.promise = result;
      pauseCursor(cursor, container);

      const host = currentVNode;
      result
        .catch((error) => {
          container.handleError(error, host);
        })
        .finally(() => {
          cursorData.promise = null;
          resumeCursor(cursor, container);
          triggerCursors();
        });
      return;
    }

    // Check time budget (only for DOM, not SSR)
    if (performance.now() >= until) {
      return true;
    }
  }
  isDev &&
    assertFalse(
      !!(cursor.dirty & ChoreBits.DIRTY_MASK && !cursorData.position),
      'Cursor is still dirty and position is not set after walking'
    );
  finishWalk(container, cursor, cursorData, isRunningOnServer);
}

function finishWalk(
  container: Container,
  cursor: Cursor,
  cursorData: CursorData,
  isServer: boolean
): void {
  if (!(cursor.dirty & ChoreBits.DIRTY_MASK)) {
    removeCursorFromQueue(cursor, container);
    DEBUG && console.warn('walkCursor: cursor done', cursor.toString());
    if (!isServer) {
      executeFlushPhase(cursor, container);
    }

    resolveCursorBoundaries(cursorData);

    if (cursorData.extraPromises) {
      Promise.all(cursorData.extraPromises).then(() => {
        resolveCursor(container);
      });
      return;
    }

    resolveCursor(container);
  }
}

function addCursorBoundary(cursorData: CursorData, vNode: VNode): void {
  const boundary = getNearestCursorBoundary(cursorData.container, vNode);
  if (!boundary) {
    return;
  }
  const boundaries = (cursorData.boundaries ||= []);
  if (!boundaries.includes(boundary)) {
    boundaries.push(boundary);
    boundary.pending.value++;
  }
}

function clearNearestCursorBoundary(vNode: VNode): void {
  if (vNode.props) {
    vnode_setProp(vNode, QNearestCursorBoundary, null);
  }
}

function resolveCursorBoundaries(cursorData: CursorData): void {
  const boundaries = cursorData.boundaries;
  if (!boundaries) {
    return;
  }
  cursorData.boundaries = null;
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    boundary.pending.value = Math.max(0, boundary.pending.value - 1);
    boundary.version.value++;
  }
}

export function resolveCursor(container: Container): void {
  DEBUG && console.warn(`walkCursor: cursor resolved, ${container.$pendingCount$} remaining`);
  container.$checkPendingCount$();
}

/**
 * If the vNode has dirty children, partitions them, sets cursor to first dirty child, and returns
 * that child. Otherwise clears CHILDREN bit and returns null.
 */
export function tryDescendDirtyChildren(
  container: Container,
  cursorData: CursorData,
  currentVNode: VNode,
  cursor: Cursor
): VNode | null {
  const dirtyChildren = currentVNode.dirtyChildren;
  if (!dirtyChildren || dirtyChildren.length === 0) {
    currentVNode.dirty &= ~ChoreBits.CHILDREN;
    clearNearestCursorBoundary(currentVNode);
    return null;
  }
  partitionDirtyChildren(dirtyChildren, currentVNode);
  // Scan dirtyChildren directly instead of going through getNextVNode.
  // getNextVNode follows the child's parent/slotParent pointer, which for Projection nodes
  // points to the DOM insertion location rather than currentVNode — that would scan the
  // wrong dirtyChildren array and potentially cause infinite loops.
  // const len = dirtyChildren.length;
  // for (let i = 0; i < len; i++) {
  //   const child = dirtyChildren[i];
  //   if (child.dirty & ChoreBits.DIRTY_MASK) {
  //     currentVNode.nextDirtyChildIndex = (i + 1) % len;
  //     setCursorPosition(container, cursorData, child);
  //     return child;
  //   }
  // }
  // // No dirty child found — clean up
  // currentVNode.dirty &= ~ChoreBits.CHILDREN;
  // currentVNode.dirtyChildren = null;
  currentVNode.nextDirtyChildIndex = 0;
  const next = getNextVNode(dirtyChildren[0], cursor)!;
  setCursorPosition(container, cursorData, next);
  return next;
  // return null;
}

/**
 * Partitions dirtyChildren array so non-projections come first, projections last. Uses in-place
 * swapping to avoid allocations.
 */
export function partitionDirtyChildren(dirtyChildren: VNode[], parent: VNode): void {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < dirtyChildren.length; readIndex++) {
    const child = dirtyChildren[readIndex];
    if (child.parent === parent) {
      // Non-projection, move to front
      if (writeIndex !== readIndex) {
        const temp = dirtyChildren[writeIndex];
        dirtyChildren[writeIndex] = child;
        dirtyChildren[readIndex] = temp;
      }
      writeIndex++;
    }
  }
}

/** @returns Next vNode to process, or null if traversal is complete */
export function getNextVNode(vNode: VNode, cursor: Cursor): VNode | null {
  if (vNode === cursor) {
    if (cursor.dirty & ChoreBits.DIRTY_MASK) {
      return cursor;
    }
    return null;
  }
  // Prefer slotParent (logical owner) for Projections, fall back to parent
  let parent: VNode | null = null;
  if (vNode.slotParent && vNode.slotParent.dirty & ChoreBits.CHILDREN) {
    parent = vNode.slotParent;
  } else if (vNode.parent && vNode.parent.dirty & ChoreBits.CHILDREN) {
    parent = vNode.parent;
  }

  if (!parent) {
    if (cursor.dirty & ChoreBits.DIRTY_MASK) {
      return cursor;
    }
    return null;
  }
  const dirtyChildren = parent.dirtyChildren!;
  let index = parent.nextDirtyChildIndex;

  const len = dirtyChildren!.length;
  let count = len;
  while (count-- > 0) {
    const nextVNode = dirtyChildren[index];
    if (nextVNode.dirty & ChoreBits.DIRTY_MASK) {
      parent.nextDirtyChildIndex = (index + 1) % len;
      return nextVNode;
    }
    index++;
    if (index === len) {
      index = 0;
    }
  }
  // all array items checked, children are no longer dirty
  parent!.dirty &= ~ChoreBits.CHILDREN;
  parent!.dirtyChildren = null;
  parent!.nextDirtyChildIndex = 0;
  clearNearestCursorBoundary(parent!);
  return getNextVNode(parent!, cursor);
}
