import type { VNode } from '../vnode/vnode';
import { isCursor } from './cursor';
import { removeCursorFromQueue } from './cursor-queue';
import type { Container } from '../types';
import type { VNodeJournal } from '../../client/vnode';
import type { Task } from '../../use/use-task';

/**
 * Keys used to store cursor-related data in vNode props. These are internal properties that should
 * not conflict with user props.
 */
const CURSOR_DATA_KEY = ':cursor';

/** Key used to store pending node prop updates in vNode props. */
export const NODE_PROPS_DATA_KEY = ':nodeProps';
export const NODE_DIFF_DATA_KEY = ':nodeDiff';
export const HOST_SIGNAL = ':signal';

export interface CursorData {
  afterFlushTasks: Task[] | null;
  extraPromises: Promise<void>[] | null;
  journal: VNodeJournal | null;
  container: Container;
  position: VNode | null;
  priority: number;
  promise: Promise<void> | null;
  /** True when executing a render-blocking task (before promise is set) */
  isBlocking: boolean;
}

/**
 * Sets the cursor position in a cursor vNode.
 *
 * @param vNode - The cursor vNode
 * @param position - The vNode position to set, or null for root
 */
export function setCursorPosition(
  container: Container,
  cursorData: CursorData,
  position: VNode | null
): void {
  cursorData.position = position;
  if (position && isCursor(position)) {
    mergeCursors(container, cursorData, position);
  }
}

function mergeCursors(container: Container, newCursorData: CursorData, oldCursor: VNode): void {
  // delete from global cursors queue
  removeCursorFromQueue(oldCursor, container);
  const oldCursorData = getCursorData(oldCursor)!;
  // merge after flush tasks
  const oldAfterFlushTasks = oldCursorData.afterFlushTasks;
  if (oldAfterFlushTasks && oldAfterFlushTasks.length > 0) {
    const newAfterFlushTasks = newCursorData.afterFlushTasks;
    if (newAfterFlushTasks) {
      newAfterFlushTasks.push(...oldAfterFlushTasks);
    } else {
      newCursorData.afterFlushTasks = oldAfterFlushTasks;
    }
  }
  // merge extra promises
  const oldExtraPromises = oldCursorData.extraPromises;
  if (oldExtraPromises && oldExtraPromises.length > 0) {
    const newExtraPromises = newCursorData.extraPromises;
    if (newExtraPromises) {
      newExtraPromises.push(...oldExtraPromises);
    } else {
      newCursorData.extraPromises = oldExtraPromises;
    }
  }
  // merge journal
  const oldJournal = oldCursorData.journal;
  if (oldJournal && oldJournal.length > 0) {
    const newJournal = newCursorData.journal;
    if (newJournal) {
      newJournal.push(...oldJournal);
    } else {
      newCursorData.journal = oldJournal;
    }
  }
}

/**
 * Gets the cursor data from a vNode.
 *
 * @param vNode - The vNode
 * @returns The cursor data, or null if none or not a cursor
 */
export function getCursorData(vNode: VNode): CursorData | null {
  const props = vNode.props;
  return (props?.[CURSOR_DATA_KEY] as CursorData | null) ?? null;
}

/**
 * Sets the cursor data on a vNode.
 *
 * @param vNode - The vNode
 * @param cursorData - The cursor data to set, or null to clear
 */
export function setCursorData(vNode: VNode, cursorData: CursorData | null): void {
  const props = (vNode.props ||= {});
  props[CURSOR_DATA_KEY] = cursorData;
}
