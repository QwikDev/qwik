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
import { setCursorPosition, getCursorData } from './cursor-props';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { addCursorToQueue, getHighestPriorityCursor, removeCursorFromQueue } from './cursor-queue';
import { executeFlushPhase } from './cursor-flush';
import { createNextTick } from '../platform/next-tick';
import { isPromise } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { assertDefined, assertFalse } from '../error/assert';
import type { Container } from '../types';
import { VNodeFlags } from '../../client/types';

const DEBUG = false;

const nextTick = createNextTick(processCursorQueue);
let isNextTickScheduled = false;

export function triggerCursors(): void {
  if (!isNextTickScheduled) {
    isNextTickScheduled = true;
    nextTick();
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
  const isServer = isServerPlatform();
  const startTime = performance.now();

  const cursorData = getCursorData(cursor)!;

  // Check if cursor is blocked by a promise
  const blockingPromise = cursorData.promise;
  if (blockingPromise) {
    return;
  }

  const container = cursorData.container;
  assertDefined(container, 'Cursor container not found');

  // Check if cursor is already complete
  if (!cursor.dirty) {
    finishWalk(container, cursor, isServer);
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
    if (!isServer && !import.meta.env.TEST) {
      const elapsed = performance.now() - startTime;
      if (elapsed >= timeBudget) {
        // Run in next tick
        triggerCursors();
        return;
      }
    }

    if (cursorData.promise) {
      return;
    }

    // Skip if the vNode is not dirty
    if (!(currentVNode.dirty & ChoreBits.DIRTY_MASK)) {
      // Move to next node
      setCursorPosition(container, cursorData, getNextVNode(currentVNode));
      continue;
    }

    // Skip if the vNode is deleted
    if (currentVNode.flags & VNodeFlags.Deleted) {
      // Clear dirty bits and move to next node
      currentVNode.dirty &= ~ChoreBits.DIRTY_MASK;
      setCursorPosition(container, cursorData, getNextVNode(currentVNode));
      continue;
    }

    let result: ValueOrPromise<void> | undefined;
    try {
      // Execute chores in order
      if (currentVNode.dirty & ChoreBits.TASKS) {
        result = executeTasks(currentVNode, container, cursorData);
      } else if (currentVNode.dirty & ChoreBits.NODE_DIFF) {
        result = executeNodeDiff(currentVNode, container, journal);
      } else if (currentVNode.dirty & ChoreBits.COMPONENT) {
        result = executeComponentChore(currentVNode, container, journal);
      } else if (currentVNode.dirty & ChoreBits.NODE_PROPS) {
        executeNodeProps(currentVNode, container, journal);
      } else if (currentVNode.dirty & ChoreBits.COMPUTE) {
        result = executeCompute(currentVNode, container);
      } else if (currentVNode.dirty & ChoreBits.CHILDREN) {
        const dirtyChildren = currentVNode.dirtyChildren;
        if (!dirtyChildren || dirtyChildren.length === 0) {
          // No dirty children
          currentVNode.dirty &= ~ChoreBits.CHILDREN;
        } else {
          currentVNode.nextDirtyChildIndex = 0;
          // descend
          currentVNode = getNextVNode(dirtyChildren[0])!;
          setCursorPosition(container, cursorData, currentVNode);
          continue;
        }
      } else if (currentVNode.dirty & ChoreBits.CLEANUP) {
        executeCleanup(currentVNode, container);
      }
    } catch (error) {
      container.handleError(error, currentVNode);
    }

    // Handle blocking promise
    if (result && isPromise(result)) {
      DEBUG && console.warn('walkCursor: blocking promise', currentVNode.toString());
      // Store promise on cursor and pause
      cursorData.promise = result;
      removeCursorFromQueue(cursor, container, true);

      const host = currentVNode;
      result
        .catch((error) => {
          container.handleError(error, host);
        })
        .finally(() => {
          cursorData.promise = null;
          addCursorToQueue(container, cursor);
          triggerCursors();
        });
      return;
    }
  }
  assertFalse(
    !!(cursor.dirty & ChoreBits.DIRTY_MASK && !cursorData.position),
    'Cursor is still dirty and position is not set after walking'
  );
  finishWalk(container, cursor, isServer);
}

function finishWalk(container: Container, cursor: Cursor, isServer: boolean): void {
  if (!(cursor.dirty & ChoreBits.DIRTY_MASK)) {
    removeCursorFromQueue(cursor, container);
    if (!isServer) {
      executeFlushPhase(cursor, container);
    }
    resolveCursor(container);
  }
}

export function resolveCursor(container: Container): void {
  // TODO streaming as a cursor? otherwise we need to wait separately for it
  // or just ignore and resolve manually
  if (container.$cursorCount$ === 0) {
    container.$resolveRenderPromise$!();
    container.$renderPromise$ = null;
  }
}

/** @returns Next vNode to process, or null if traversal is complete */
function getNextVNode(vNode: VNode): VNode | null {
  // Prefer parent if it's dirty, otherwise try slotParent
  let parent: VNode | null = null;
  if (vNode.parent && vNode.parent.dirty & ChoreBits.CHILDREN) {
    parent = vNode.parent;
  } else if (vNode.slotParent && vNode.slotParent.dirty & ChoreBits.CHILDREN) {
    parent = vNode.slotParent;
  }

  if (!parent) {
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
  return getNextVNode(parent!);
}
