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
  executeNodeDiff,
  executeNodeProps,
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

/** Options for walking a cursor. */
export interface WalkOptions {
  /** Time budget in milliseconds (for DOM time-slicing). If exceeded, walk pauses. */
  timeBudget: number;
}

/**
 * Processes the cursor queue, walking each cursor in turn.
 *
 * @param options - Walk options (time budget, etc.)
 */
export function processCursorQueue(
  options: WalkOptions = {
    timeBudget: 1000 / 60, // 60fps
  }
): void {
  isNextTickScheduled = false;

  let cursor: Cursor | null = null;
  while ((cursor = getHighestPriorityCursor())) {
    walkCursor(cursor, options);
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
 * @param options - Walk options (time budget, etc.)
 * @returns Walk result indicating completion status
 */
export function walkCursor(cursor: Cursor, options: WalkOptions): void {
  const { timeBudget } = options;
  const isRunningOnServer = import.meta.env.TEST ? isServerPlatform() : isServer;
  const startTime = performance.now();

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
    // Check time budget (only for DOM, not SSR)
    if (!isRunningOnServer && !import.meta.env.TEST) {
      const elapsed = performance.now() - startTime;
      if (elapsed >= timeBudget) {
        // Schedule continuation as macrotask to actually yield to browser
        scheduleYield();
        return;
      }
    }

    if (cursorData.promise) {
      return;
    }

    // Skip if the vNode is not dirty
    if (!(currentVNode.dirty & ChoreBits.DIRTY_MASK)) {
      // Move to next node
      setCursorPosition(container, cursorData, getNextVNode(currentVNode, cursor));
      continue;
    }

    // Skip if the vNode is deleted
    if (currentVNode.flags & VNodeFlags.Deleted) {
      // if deleted, run cleanup if needed
      if (currentVNode.dirty & ChoreBits.CLEANUP) {
        executeCleanup(currentVNode, container);
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
      } else if (currentVNode.dirty & ChoreBits.NODE_PROPS) {
        executeNodeProps(currentVNode, journal);
      } else if (currentVNode.dirty & ChoreBits.COMPUTE) {
        result = executeCompute(currentVNode, container);
      } else if (currentVNode.dirty & ChoreBits.CHILDREN) {
        const dirtyChildren = currentVNode.dirtyChildren;
        if (!dirtyChildren || dirtyChildren.length === 0) {
          // No dirty children
          currentVNode.dirty &= ~ChoreBits.CHILDREN;
        } else {
          partitionDirtyChildren(dirtyChildren, currentVNode);
          currentVNode.nextDirtyChildIndex = 0;
          // descend
          currentVNode = getNextVNode(dirtyChildren[0], cursor)!;
          setCursorPosition(container, cursorData, currentVNode);
          continue;
        }
      }
    } catch (error) {
      container.handleError(error, currentVNode);
    }

    // Handle blocking promise
    if (result && isPromise(result)) {
      DEBUG && console.warn('walkCursor: blocking promise', currentVNode.toString());
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

    if (cursorData.extraPromises) {
      Promise.all(cursorData.extraPromises).then(() => {
        resolveCursor(container);
      });
      return;
    }

    resolveCursor(container);
  }
}

export function resolveCursor(container: Container): void {
  DEBUG &&
    console.warn(
      `walkCursor: cursor resolved, ${container.$cursorCount$} remaining, ${container.$pausedCursorCount$} paused`
    );
  // TODO streaming as a cursor? otherwise we need to wait separately for it
  // or just ignore and resolve manually
  if (container.$cursorCount$ === 0 && container.$pausedCursorCount$ === 0) {
    container.$resolveRenderPromise$!();
    container.$renderPromise$ = null;
  }
}

/**
 * Partitions dirtyChildren array so non-projections come first, projections last. Uses in-place
 * swapping to avoid allocations.
 */
function partitionDirtyChildren(dirtyChildren: VNode[], parent: VNode): void {
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
  // Prefer parent if it's dirty, otherwise try slotParent
  let parent: VNode | null = null;
  if (vNode.parent && vNode.parent.dirty & ChoreBits.CHILDREN) {
    parent = vNode.parent;
  } else if (vNode.slotParent && vNode.slotParent.dirty & ChoreBits.CHILDREN) {
    parent = vNode.slotParent;
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
  return getNextVNode(parent!, cursor);
}
