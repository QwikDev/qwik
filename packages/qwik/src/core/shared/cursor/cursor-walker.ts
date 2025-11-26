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
import type { Cursor } from './cursor';
import {
  getCursorPosition,
  setCursorPosition,
  getVNodePromise,
  setVNodePromise,
  setNextChildIndex,
  getNextChildIndex,
  getCursorContainer,
} from './cursor-props';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { getHighestPriorityCursor, removeCursorFromQueue } from './cursor-queue';
import { executeFlushPhase } from './cursor-flush';
import { getDomContainer } from '../../client/dom-container';
import { createNextTick } from '../platform/next-tick';
import { vnode_isElementVNode } from '../../client/vnode';
import type { Container } from '../types';
import { VNodeFlags } from '../../client/types';
import { isPromise } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { assertDefined } from '../error/assert';

const DEBUG = true;

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
 * @param container - The container
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
    if (!(cursor.dirty & ChoreBits.DIRTY_MASK)) {
      removeCursorFromQueue(cursor);
    }
  }
}

let globalCount = 0;

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
 * @param container - The container
 * @param options - Walk options (time budget, etc.)
 * @returns Walk result indicating completion status
 */
export function walkCursor(cursor: Cursor, options: WalkOptions): void {
  const { timeBudget } = options;
  const isServer = isServerPlatform();
  const startTime = performance.now();

  // Check if cursor is already complete
  if (!cursor.dirty) {
    return;
  }

  // Check if cursor is blocked by a promise
  const blockingPromise = getVNodePromise(cursor);
  if (blockingPromise) {
    return;
  }

  globalCount++;
  if (globalCount > 100) {
    throw new Error('Infinite loop detected in cursor walker');
  }

  const container = getCursorContainer(cursor);
  assertDefined(container, 'Cursor container not found');
  // Get starting position (resume from last position or start at root)
  let currentVNode: VNode | null = null;

  let count = 0;
  while ((currentVNode = getCursorPosition(cursor))) {
    DEBUG && console.warn('walkCursor', currentVNode.toString());
    if (count++ > 100) {
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

    // Skip if the vNode is not dirty
    if (!(currentVNode.dirty & ChoreBits.DIRTY_MASK) || getVNodePromise(currentVNode)) {
      // Move to next node
      setCursorPosition(cursor, getNextVNode(currentVNode));
      continue;
    }

    let result: ValueOrPromise<void> | undefined;
    // Execute chores in order
    if (currentVNode.dirty & ChoreBits.TASKS) {
      result = executeTasks(currentVNode, container, cursor);
    } else if (currentVNode.dirty & ChoreBits.NODE_DIFF) {
      result = executeNodeDiff(currentVNode, container);
    } else if (currentVNode.dirty & ChoreBits.COMPONENT) {
      result = executeComponentChore(currentVNode, container);
    } else if (currentVNode.dirty & ChoreBits.NODE_PROPS) {
      executeNodeProps(currentVNode, container);
    } else if (currentVNode.dirty & ChoreBits.COMPUTE) {
      result = executeCompute(currentVNode, container);
    } else if (currentVNode.dirty & ChoreBits.CHILDREN) {
      const dirtyChildren = currentVNode.dirtyChildren;
      if (!dirtyChildren || dirtyChildren.length === 0) {
        // No dirty children
        currentVNode.dirty &= ~ChoreBits.CHILDREN;
      } else {
        setNextChildIndex(currentVNode, 0);
        // descend
        currentVNode = getNextVNode(dirtyChildren[0])!;
        setCursorPosition(cursor, currentVNode);
        continue;
      }
    } else if (currentVNode.dirty & ChoreBits.CLEANUP) {
      executeCleanup(currentVNode, container);
    }

    // Handle blocking promise
    if (result && isPromise(result)) {
      DEBUG && console.warn('walkCursor: blocking promise', currentVNode.toString());
      // Store promise on cursor and pause
      setVNodePromise(cursor, result);
      // pauseCursor(cursor, currentVNode);

      result
        .catch((error) => {
          setVNodePromise(cursor, null);
          container.handleError(error, currentVNode);
        })
        .finally(() => {
          setVNodePromise(cursor, null);
          triggerCursors();
        });
      return;
    }
  }
  if (!(cursor.dirty & ChoreBits.DIRTY_MASK)) {
    // Walk complete
    cursor.flags &= ~VNodeFlags.Cursor;
    if (!isServer) {
      executeFlushPhase(cursor, container);
    }
    // TODO streaming as a cursor? otherwise we need to wait separately for it
    // or just ignore and resolve manually
    if (--container.$cursorCount$ === 0) {
      container.$resolveRenderPromise$!();
      container.$renderPromise$ = null;
    }
  }
}

/** @returns Next vNode to process, or null if traversal is complete */
function getNextVNode(vNode: VNode): VNode | null {
  const parent = vNode.parent || vNode.slotParent;
  if (!parent || !(parent.dirty & ChoreBits.CHILDREN)) {
    return null;
  }
  const dirtyChildren = parent.dirtyChildren!;
  let index = getNextChildIndex(parent)!;

  const len = dirtyChildren!.length;
  let count = len;
  while (count-- > 0) {
    const nextVNode = dirtyChildren[index];
    if (nextVNode.dirty & ChoreBits.DIRTY_MASK) {
      setNextChildIndex(parent, (index + 1) % len);
      return nextVNode;
    }
    index++;
    if (index === len) {
      index = 0;
    }
  }
  // all array items checked, children are no longer dirty
  parent!.dirty &= ~ChoreBits.CHILDREN;
  return getNextVNode(parent!);
}
