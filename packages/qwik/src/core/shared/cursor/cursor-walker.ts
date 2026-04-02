/**
 * @file Cursor walker implementation for cursor-based scheduling.
 *
 *   Implements depth-first traversal of the vDOM tree, processing dirty vNodes and their children.
 *   Handles promise blocking, time-slicing, and cursor position tracking.
 */

import type { VNode } from '../vnode/vnode';
import { type Cursor } from './cursor';
import { setCursorPosition, getCursorData, type CursorData } from './cursor-props';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import {
  getHighestPriorityCursor,
  pauseCursor,
  removeCursorFromQueue,
  resumeCursor,
} from './cursor-queue';
import { createMicroTask, createMacroTask } from '../platform/next-tick';
import { isPromise } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { assertDefined, assertFalse } from '../error/assert';
import type { Container } from '../types';
import { VNodeFlags } from '../../client/types';
import { isBrowser, isDev } from '@qwik.dev/core/build';
import { getCursorChoreRuntime } from './chore-runtime';

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
 * @internal
 */
export function processCursorQueue(
  options: WalkOptions = {
    timeBudget: isBrowser ? 1000 / 60 : 0, // 60fps on browser, unlimited on server
  }
): void {
  isNextTickScheduled = false;

  const startTime = performance.now();
  let cursor: Cursor | null = null;
  while ((cursor = getHighestPriorityCursor())) {
    let didYield: true | void;
    try {
      didYield = walkCursor(cursor, options, startTime);
    } catch (e) {
      // If a cursor's walk fails (e.g., its container was disposed), remove it
      // from the queue so it doesn't block other cursors.
      const cursorData = getCursorData(cursor);
      if (cursorData) {
        removeCursorFromQueue(cursor, cursorData.container);
        cursorData.container.handleError(e, cursor);
        // Ensure $renderPromise$ is resolved so the emit loop doesn't hang
        // waiting for a cursor that was removed due to an error.
        cursorData.container.$checkPendingCount$();
      }
      continue;
    }
    // Check if time budget expired (cursor stays in queue, caller decides next step)
    if (didYield) {
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
 * @param options - Walk options (time budget, etc.)
 * @returns True if the walk yielded (time budget exceeded), false if walk completed
 */
export function walkCursor(cursor: Cursor, options: WalkOptions, startTime: number): true | void {
  const { timeBudget } = options;
  // If the cursor has SSR build state, force server mode regardless of the current platform.
  // This prevents platform mismatches when cursor async callbacks (from promise chains) run
  // as microtasks after the render loop resolves — the platform may have been restored to
  // client mode by the test harness, but SSR cursors must always use the SSR chore runtime.
  const isRunningOnServer = 'tag' in getCursorData(cursor)!.container;
  const choreRuntime = getCursorChoreRuntime(isRunningOnServer);

  const cursorData = getCursorData(cursor)!;

  // Check if cursor is blocked by a promise
  const blockingPromise = cursorData.promise;
  if (blockingPromise) {
    return;
  }

  const container = cursorData.container;
  isDev && assertDefined(container, 'Cursor container not found');

  // Swap SSR build state if this cursor has one
  if (isRunningOnServer && cursorData.ssrBuildState) {
    (container as any).ssrBuildState = cursorData.ssrBuildState;
  }

  // Check if cursor is already complete
  if (!cursor.dirty) {
    finishWalk(container, cursor, cursorData, choreRuntime);
    return;
  }

  const journal = choreRuntime.needsJournal ? (cursorData.journal ||= []) : null;

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
    // Check time budget (skipped when 0 — the server default via triggerCursors)
    if (timeBudget !== 0) {
      const elapsed = performance.now() - startTime;
      if (elapsed >= timeBudget) {
        if (isBrowser) {
          // Schedule continuation as macrotask to actually yield to browser
          scheduleYield();
        }
        return true;
      }
    }

    // Skip if the vNode is not dirty
    if (!(currentVNode.dirty & ChoreBits.DIRTY_MASK)) {
      // Before moving on, emit unclaimed projections for this node AND all ancestors
      // that getNextVNode will skip over during its recursive parent walk.
      // getNextVNode clears CHILDREN bits on ancestors without the walker ever visiting them,
      // so we must process unclaimed projections for the entire ancestor chain here.
      if (choreRuntime.hasCleanNodeLeave) {
        const unclaimedResult = emitUnclaimedProjectionsForChain(
          currentVNode,
          cursor,
          container,
          cursorData,
          choreRuntime
        );
        if (unclaimedResult && isPromise(unclaimedResult)) {
          cursorData.promise = unclaimedResult;
          pauseCursor(cursor, container);
          const host = currentVNode;
          unclaimedResult
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
        // If unclaimed projections made us dirty again, re-process this node
        if (currentVNode.dirty & ChoreBits.DIRTY_MASK) {
          continue;
        }
      }
      // Move to next node
      setCursorPosition(container, cursorData, getNextVNode(currentVNode, cursor));
      continue;
    }

    // Skip if the vNode is deleted
    if (currentVNode.flags & VNodeFlags.Deleted) {
      // if deleted, run cleanup if needed
      if (currentVNode.dirty & ChoreBits.CLEANUP) {
        choreRuntime.cleanup(currentVNode, container);
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
      // Execute chores in order, with SSR-specific dispatch on server
      if (currentVNode.dirty & ChoreBits.TASKS) {
        result = choreRuntime.tasks(currentVNode, container, cursorData);
      } else if (currentVNode.dirty & ChoreBits.COMPONENT) {
        result = choreRuntime.component(currentVNode, container, cursorData, cursor, journal);
      } else if (currentVNode.dirty & ChoreBits.RECONCILE) {
        result = choreRuntime.reconcile(currentVNode, container, cursorData, cursor, journal);
      } else if (currentVNode.dirty & ChoreBits.NODE_DIFF) {
        result = choreRuntime.nodeDiff(currentVNode, container, cursorData, cursor, journal);
      } else if (currentVNode.dirty & ChoreBits.NODE_PROPS) {
        choreRuntime.nodeProps(currentVNode, container, cursorData, journal);
      } else if (currentVNode.dirty & ChoreBits.COMPUTE) {
        result = choreRuntime.compute(currentVNode, container);
      } else if (currentVNode.dirty & ChoreBits.CHILDREN) {
        const next = tryDescendDirtyChildren(container, cursorData, currentVNode, cursor);
        if (next !== null) {
          currentVNode = next;
          continue;
        }
        result = choreRuntime.onCleanNodeLeave(currentVNode, container, cursorData, cursor);
      }
    } catch (error) {
      container.handleError(error, currentVNode);
    }

    // Handle blocking promise
    if (result && isPromise(result)) {
      DEBUG && console.warn('walkCursor: blocking promise', currentVNode.toString());
      // Mark node as having a pending promise so the emitter blocks on it.
      // PROMISE is not in DIRTY_MASK, so the walker won't dispatch it as a chore.
      currentVNode.dirty |= ChoreBits.PROMISE;
      cursorData.promise = result;
      pauseCursor(cursor, container);

      const host = currentVNode;
      result
        .catch((error) => {
          container.handleError(error, host);
        })
        .finally(() => {
          host.dirty &= ~ChoreBits.PROMISE;
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
  finishWalk(container, cursor, cursorData, choreRuntime);
}

function finishWalk(
  container: Container,
  cursor: Cursor,
  cursorData: CursorData,
  choreRuntime: ReturnType<typeof getCursorChoreRuntime>
): void {
  if (!(cursor.dirty & ChoreBits.DIRTY_MASK)) {
    removeCursorFromQueue(cursor, container);
    DEBUG && console.warn('walkCursor: cursor done', cursor.toString());
    choreRuntime.onCursorFinish(cursor, container, cursorData);

    // Notify completion (used by Suspense sub-cursors)
    cursorData.onDone?.();

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
  return getNextVNode(parent!, cursor);
}

/**
 * Walk up the ancestor chain from `vNode` to `cursor` root, emitting unclaimed projections for each
 * ancestor that has no remaining dirty children. This is needed because `getNextVNode` recursively
 * clears CHILDREN bits on ancestors without the walker ever visiting them — so we process unclaimed
 * projections for each ancestor that getNextVNode would skip over.
 *
 * Only processes an ancestor if its dirtyChildren are all clean (matching the condition under which
 * getNextVNode would clear its CHILDREN bit). Stops at ancestors that still have dirty children —
 * those will be visited later by the walker.
 *
 * If any emission is async, returns the promise immediately. The cursor will re-enter the "not
 * dirty" branch on resume and call this function again to process remaining ancestors.
 */
function emitUnclaimedProjectionsForChain(
  vNode: VNode,
  cursor: Cursor,
  container: Container,
  cursorData: CursorData,
  choreRuntime: ReturnType<typeof getCursorChoreRuntime>
): ValueOrPromise<void> {
  let node: VNode | null = vNode;

  while (node) {
    const result = choreRuntime.onCleanNodeLeave(node, container, cursorData, cursor);
    if (result && isPromise(result)) {
      // Return immediately — don't continue ancestor walk.
      // The emission may create new dirty children that change the ancestor state.
      // When the cursor resumes, the walker will re-enter the "not dirty" branch
      // and call this function again, which will continue the ancestor walk.
      return result;
    }
    // If unclaimed projections made the node dirty again, stop — walker will re-process
    if (node.dirty & ChoreBits.DIRTY_MASK) {
      return;
    }

    if (node === cursor) {
      break;
    }

    // Move to parent. But only continue if the parent's dirtyChildren are all clean
    // (i.e., getNextVNode would clear its CHILDREN bit). If the parent still has other
    // dirty children, stop — those children need to run first, and the walker will visit
    // the parent later.
    const parent: VNode | null = node.slotParent || node.parent;
    if (!parent) {
      break;
    }

    // Check if parent still has other dirty children
    if (parent.dirty & ChoreBits.CHILDREN) {
      const dirtyChildren = parent.dirtyChildren;
      if (dirtyChildren) {
        let hasOtherDirty = false;
        for (let i = 0; i < dirtyChildren.length; i++) {
          if (dirtyChildren[i] !== node && dirtyChildren[i].dirty & ChoreBits.DIRTY_MASK) {
            // Parent still has other dirty children — stop. Walker will handle this parent later.
            hasOtherDirty = true;
            break;
          }
        }
        if (hasOtherDirty) {
          return;
        }
      }
      // All dirty children are clean — clear the CHILDREN bit so we don't
      // stop at this node in the dirty check above. This mirrors what
      // getNextVNode does when it finds no more dirty children.
      parent.dirty &= ~ChoreBits.CHILDREN;
      parent.dirtyChildren = null;
      parent.nextDirtyChildIndex = 0;
    }

    node = parent;
  }
}
